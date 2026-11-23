// The monthly cycle (PRD 8.5, 38.19): short checks each month, the full
// assessment every third month, both answered alone and revealed together.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CHECK_GRACE_DAYS,
  CYCLE_OPENS_DAYS_BEFORE,
  cycleDueOn,
  cycleCheckRound,
  cycleKind,
  describeProgress,
  dueState,
  isoDay,
  progressOf,
  scoreAreas,
  scoreDomains,
  type AreaPoint,
  type CycleDto,
  type ProgressPointDto,
  type RelationshipProgressDto,
} from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { notify } from "../lib/notify";
import { requireMember } from "../lib/context";
import { conflict, notFound, parse } from "../lib/errors";
import { itemSetOf, loadAnswers, strip, summary } from "./assessment-data";
import { requireActive, requireParty } from "./party";

const IdParam = z.object({ id: z.string().uuid() });
const DAY = 86_400_000;

type RelRow = { id: string; church_id: string; status: string; activated_at: Date | null; discipler_id: string; disciple_id: string };

/**
 * The relationship's open cycle, opening the next one when it is within a week
 * of being due. Only one cycle is open at a time: a check stays open until both
 * have finished, however late. When the next one opens, scheduled checks that
 * are already past their grace period are skipped rather than piling up.
 */
export async function ensureOpenCycle(tx: Tx, rel: RelRow, now: Date = new Date()) {
  if ((rel.status !== "active" && rel.status !== "paused") || !rel.activated_at) return null;
  const last = await tx.selectFrom("assessment_cycle").selectAll().where("relationship_id", "=", rel.id).orderBy("number", "desc").limit(1).executeTakeFirst();
  if (last && !last.completed_at) return last;

  let number = (last?.number ?? 0) + 1;
  while (cycleDueOn(rel.activated_at, number).getTime() + CHECK_GRACE_DAYS * DAY < now.getTime()) number += 1;
  const due = cycleDueOn(rel.activated_at, number);
  if (due.getTime() - CYCLE_OPENS_DAYS_BEFORE * DAY > now.getTime()) return null;

  const created = await tx
    .insertInto("assessment_cycle")
    .values({ church_id: rel.church_id, relationship_id: rel.id, number, kind: cycleKind(number), check_round: cycleCheckRound(number), due_on: isoDay(due) })
    .onConflict((oc) => oc.columns(["relationship_id", "number"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  if (created) {
    // Tell both people once, when the check opens.
    const names = await tx.selectFrom("person").select(["id", "full_name"]).where("id", "in", [rel.discipler_id, rel.disciple_id]).execute();
    const nameOf = (id: string) => names.find((n) => n.id === id)?.full_name ?? "the other person";
    const base = { relationshipId: rel.id, full: cycleKind(number) === "full", dueOn: isoDay(due) };
    await notify(tx, rel.church_id, [rel.disciple_id], "check.open", { ...base, otherName: nameOf(rel.discipler_id) });
    await notify(tx, rel.church_id, [rel.discipler_id], "check.open", { ...base, otherName: nameOf(rel.disciple_id) });
  }
  return tx.selectFrom("assessment_cycle").selectAll().where("relationship_id", "=", rel.id).where("number", "=", number).executeTakeFirstOrThrow();
}

/** When the next check opens, for "Next check in October" when none is open. */
export async function nextDueOn(tx: Tx, rel: RelRow): Promise<string | null> {
  if (!rel.activated_at) return null;
  const last = await tx.selectFrom("assessment_cycle").select("number").where("relationship_id", "=", rel.id).orderBy("number", "desc").limit(1).executeTakeFirst();
  let number = (last?.number ?? 0) + 1;
  while (cycleDueOn(rel.activated_at, number).getTime() + CHECK_GRACE_DAYS * DAY < Date.now()) number += 1;
  return isoDay(cycleDueOn(rel.activated_at, number));
}

/** Mark a cycle complete once both tests are submitted. */
export async function completeCycleIfDone(tx: Tx, cycleId: string, churchId: string, actorId: string) {
  const c = await tx.selectFrom("assessment_cycle").selectAll().where("id", "=", cycleId).forUpdate().executeTakeFirstOrThrow();
  if (c.completed_at || !c.test_a_id || !c.test_b_id) return;
  const done = await tx
    .selectFrom("assessment")
    .select("id")
    .where("id", "in", [c.test_a_id, c.test_b_id])
    .where("status", "=", "submitted")
    .execute();
  if (done.length < 2) return;
  await tx.updateTable("assessment_cycle").set({ completed_at: new Date() }).where("id", "=", c.id).execute();
  await audit(tx, { churchId, actorId, action: "cycle.completed", targetType: "relationship", targetId: c.relationship_id, data: { number: c.number, kind: c.kind } });
}

export async function cycleDto(tx: Tx, cycle: { id: string; number: number; kind: "full" | "check"; due_on: string; completed_at: Date | null }, myId: string): Promise<CycleDto> {
  const tests = await tx.selectFrom("assessment").select(["id", "respondent_id", "status", "version", "kind", "item_index", "check_round"]).where("cycle_id", "=", cycle.id).execute();
  const mine = tests.find((t) => t.respondent_id === myId);
  const theirs = tests.find((t) => t.respondent_id !== myId);
  return {
    id: cycle.id,
    number: cycle.number,
    kind: cycle.kind,
    dueOn: cycle.due_on,
    due: dueState(new Date(`${cycle.due_on}T00:00:00Z`)),
    completedAt: cycle.completed_at?.toISOString() ?? null,
    mine: mine ? { assessmentId: mine.id, status: mine.status, progress: progressOf(mine.version, await loadAnswers(tx, mine.id), itemSetOf(mine)) } : null,
    theirs: theirs ? theirs.status : "not_started",
  };
}

/** Area scores and Priest/King scores for one revealed pair of tests. */
async function point(tx: Tx, aId: string, bId: string): Promise<Pick<ProgressPointDto, "areas" | "domains">> {
  const meta = await tx.selectFrom("assessment").select(["id", "kind", "item_index", "check_round"]).where("id", "in", [aId, bId]).execute();
  const set = (id: string) => itemSetOf(meta.find((m) => m.id === id)!);
  const bAnswers = await loadAnswers(tx, bId);
  const aAnswers = await loadAnswers(tx, aId);
  const b = scoreAreas("B", bAnswers, set(bId));
  const a = scoreAreas("A", aAnswers, set(aId));
  return {
    areas: b.map((s, i): AreaPoint => ({ area: s.area, disciple: s.outOf20, discipler: a[i]!.outOf20 })),
    domains: { disciple: scoreDomains("B", bAnswers, set(bId)), discipler: scoreDomains("A", aAnswers, set(aId)) },
  };
}

/** Baseline then every completed cycle, oldest first. Only revealed points (both finished). */
export async function progressPoints(tx: Tx, rel: { id: string; baseline_a_id: string | null; baseline_b_id: string | null; activated_at: Date | null }): Promise<ProgressPointDto[]> {
  const points: ProgressPointDto[] = [];
  if (rel.baseline_a_id && rel.baseline_b_id) {
    points.push({ label: "Baseline", kind: "full", date: (rel.activated_at ?? new Date()).toISOString(), ...(await point(tx, rel.baseline_a_id, rel.baseline_b_id)) });
  }
  const cycles = await tx
    .selectFrom("assessment_cycle")
    .selectAll()
    .where("relationship_id", "=", rel.id)
    .where("completed_at", "is not", null)
    .orderBy("number")
    .execute();
  for (const c of cycles) {
    points.push({
      label: c.kind === "full" ? "Full assessment" : "Monthly check",
      kind: c.kind,
      date: c.completed_at!.toISOString(),
      ...(await point(tx, c.test_a_id!, c.test_b_id!)),
    });
  }
  return points;
}

export async function cycleRoutes(app: FastifyInstance) {
  /** Progress over time and the current check, for the two people only. */
  app.get("/relationships/:id/progress", async (req): Promise<RelationshipProgressDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      const open = await ensureOpenCycle(tx, r);
      const points = await progressPoints(tx, r);
      const last = points.at(-1);
      const prev = points.at(-2);
      return {
        current: open ? await cycleDto(tx, open, ctx.personId) : null,
        points,
        summary: last && prev ? describeProgress(prev.areas, last.areas) : null,
        nextDueOn: open ? null : await nextDueOn(tx, r),
      };
    });
  });

  /** Start (or resume) my side of a monthly check: Test B for the disciple, Test A for the discipler. */
  app.post("/cycles/:id/start", async (req, reply) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    const assessmentId = await withTenant(churchId, async (tx) => {
      const c = await tx.selectFrom("assessment_cycle").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!c) throw notFound();
      const r = await requireParty(tx, c.relationship_id, ctx.personId);
      requireActive(r);
      if (c.completed_at) throw conflict("CYCLE_DONE", "This check is already complete");
      const version = r.myRole === "disciple" ? "B" : "A";
      const existing = await tx.selectFrom("assessment").select("id").where("cycle_id", "=", c.id).where("version", "=", version).executeTakeFirst();
      if (existing) return existing.id;
      const a = await tx
        .insertInto("assessment")
        .values({
          church_id: churchId,
          version,
          respondent_id: ctx.personId,
          subject_id: r.disciple_id,
          relationship_id: r.id,
          kind: c.kind,
          item_index: c.item_index,
          check_round: c.check_round,
          cycle_id: c.id,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .updateTable("assessment_cycle")
        .set(version === "A" ? { test_a_id: a.id } : { test_b_id: a.id })
        .where("id", "=", c.id)
        .execute();
      return a.id;
    });
    reply.code(201);
    return withTenant(churchId, async (tx) => strip(await summary(tx, assessmentId)));
  });
}
