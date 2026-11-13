// The 12-area assessment (PRD 6.7, 7, Appendix A): the baseline and the
// monthly checks (cycles.ts).
// Each person completes their version alone. Answers are visible only to the
// respondent. The pair sees a per-area comparison once both have submitted
// and the relationship is active ("revealed together").
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AnswerSchema,
  StartAssessmentSchema,
  compare,
  dueState,
  getArea,
  itemsFor,
  progressOf,
  validateItemForVersion,
  isAnswerComplete,
  type AssessmentDetailDto,
  type AssessmentHubDto,
  type ComparisonDto,
  type HubCheckDto,
} from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { requireMember } from "../lib/context";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, parse } from "../lib/errors";
import { linkBaselinesAndActivate } from "./relationships";
import { itemSetOf, loadAnswers, requireOwnAssessment, strip, summary } from "./assessment-data";
import { completeCycleIfDone, ensureOpenCycle, progressPoints } from "./cycles";

const IdParam = z.object({ id: z.string().uuid() });
const AnswerParams = z.object({ id: z.string().uuid(), itemId: z.string().regex(/^\d{1,2}[AB]-\d$/) });

export async function assessmentRoutes(app: FastifyInstance) {
  /** My assessments hub: my own Test B and the Test As I owe my disciples. */
  app.get("/assessments", async (req): Promise<AssessmentHubDto> => {
    const ctx = await requireMember(req);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const b = await tx
        .selectFrom("assessment")
        .select("id")
        .where("version", "=", "B")
        .where("respondent_id", "=", ctx.personId)
        .where("cycle_id", "is", null)
        .orderBy("started_at", "desc")
        .limit(1)
        .executeTakeFirst();
      const myTestB = b ? strip(await summary(tx, b.id)) : null;

      const rels = await tx
        .selectFrom("relationship as r")
        .innerJoin("person as p", "p.id", "r.disciple_id")
        .select(["r.id", "r.disciple_id", "p.full_name"])
        .where("r.discipler_id", "=", ctx.personId)
        .where("r.status", "=", "accepted_baseline_pending")
        .where("r.baseline_a_id", "is", null)
        .orderBy("r.accepted_at")
        .execute();
      const testAsOwed = [];
      for (const r of rels) {
        const a = await tx.selectFrom("assessment").select("id").where("version", "=", "A").where("relationship_id", "=", r.id).where("cycle_id", "is", null).where("status", "=", "in_progress").executeTakeFirst();
        testAsOwed.push({
          relationshipId: r.id,
          disciple: { personId: r.disciple_id, fullName: r.full_name ?? "Member" },
          assessment: a ? strip(await summary(tx, a.id)) : null,
        });
      }
      // Monthly checks I owe, in every active relationship I am part of.
      const active = await tx
        .selectFrom("relationship as r")
        .innerJoin("person as de", "de.id", "r.disciple_id")
        .select(["r.id", "r.church_id", "r.status", "r.activated_at", "r.discipler_id", "r.disciple_id", "de.full_name as disciple_name"])
        .where((eb) => eb.or([eb("r.discipler_id", "=", ctx.personId), eb("r.disciple_id", "=", ctx.personId)]))
        .where("r.status", "in", ["active", "paused"])
        .execute();
      const checks: HubCheckDto[] = [];
      for (const r of active) {
        const c = await ensureOpenCycle(tx, r);
        if (!c) continue;
        const version = r.discipler_id === ctx.personId ? "A" : "B";
        const mine = await tx.selectFrom("assessment").select(["id", "status"]).where("cycle_id", "=", c.id).where("version", "=", version).executeTakeFirst();
        if (mine?.status === "submitted") continue;
        checks.push({
          cycleId: c.id,
          relationshipId: r.id,
          number: c.number,
          kind: c.kind,
          dueOn: c.due_on,
          due: dueState(new Date(`${c.due_on}T00:00:00Z`)),
          role: version === "B" ? "self" : "about",
          person: { personId: r.disciple_id, fullName: r.disciple_name ?? "Member" },
          assessment: mine ? strip(await summary(tx, mine.id)) : null,
        });
      }
      return { myTestB, testAsOwed, checks };
    });
  });

  /** Start (or resume) an assessment. */
  app.post("/assessments", async (req, reply) => {
    const ctx = await requireMember(req);
    const body = parse(StartAssessmentSchema, req.body);
    const churchId = ctx.membership.churchId;

    const id = await withTenant(churchId, async (tx) => {
      if (body.version === "B") {
        const open = await tx.selectFrom("assessment").select("id").where("version", "=", "B").where("respondent_id", "=", ctx.personId).where("cycle_id", "is", null).where("status", "=", "in_progress").executeTakeFirst();
        if (open) return open.id;
        try {
          const a = await tx
            .insertInto("assessment")
            .values({ church_id: churchId, version: "B", respondent_id: ctx.personId, subject_id: ctx.personId })
            .returning("id")
            .executeTakeFirstOrThrow();
          return a.id;
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict("ALREADY_OPEN", "You already have an assessment in progress");
          throw err;
        }
      }

      const r = await tx.selectFrom("relationship").selectAll().where("id", "=", body.relationshipId).executeTakeFirst();
      if (!r || r.discipler_id !== ctx.personId) throw notFound();
      if (r.status !== "accepted_baseline_pending" || r.baseline_a_id) {
        throw conflict("NOT_DUE", "There is no baseline due for this disciple");
      }
      const open = await tx.selectFrom("assessment").select("id").where("version", "=", "A").where("relationship_id", "=", r.id).where("cycle_id", "is", null).where("status", "=", "in_progress").executeTakeFirst();
      if (open) return open.id;
      const a = await tx
        .insertInto("assessment")
        .values({ church_id: churchId, version: "A", respondent_id: ctx.personId, subject_id: r.disciple_id, relationship_id: r.id })
        .returning("id")
        .executeTakeFirstOrThrow();
      return a.id;
    });

    reply.code(201);
    return withTenant(churchId, async (tx) => strip(await summary(tx, id)));
  });

  app.get("/assessments/:id", async (req): Promise<AssessmentDetailDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      await requireOwnAssessment(tx, id, ctx.personId);
      const s = strip(await summary(tx, id));
      const answers = await loadAnswers(tx, id);
      return { ...s, answers };
    });
  });

  /** Save one answer. Progress is saved per item, so people can finish over several sittings. */
  app.put("/assessments/:id/answers/:itemId", async (req) => {
    const ctx = await requireMember(req);
    const { id, itemId } = parse(AnswerParams, req.params);
    const body = parse(AnswerSchema, req.body);
    const churchId = ctx.membership.churchId;

    return withTenant(churchId, async (tx) => {
      const a = await requireOwnAssessment(tx, id, ctx.personId);
      if (a.status !== "in_progress") throw conflict("SUBMITTED", "This assessment has already been submitted");
      if (!validateItemForVersion(itemId, a.version, itemSetOf(a))) throw badRequest("BAD_ITEM", "That question is not part of this assessment");
      const value = body.noOccasion ? null : body.value;
      await tx
        .insertInto("assessment_answer")
        .values({ assessment_id: id, church_id: churchId, item_id: itemId, value, no_occasion: body.noOccasion, evidence: body.evidence || null, updated_at: new Date() })
        .onConflict((oc) =>
          oc.columns(["assessment_id", "item_id"]).doUpdateSet({ value, no_occasion: body.noOccasion, evidence: body.evidence || null, updated_at: new Date() }),
        )
        .execute();
      return { progress: progressOf(a.version, await loadAnswers(tx, id), itemSetOf(a)) };
    });
  });

  app.post("/assessments/:id/submit", async (req) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;

    await withTenant(churchId, async (tx) => {
      const a = await tx.selectFrom("assessment").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!a || a.respondent_id !== ctx.personId) throw notFound();
      if (a.status !== "in_progress") throw conflict("SUBMITTED", "This assessment has already been submitted");
      const answers = await loadAnswers(tx, id);
      const done = new Set(answers.filter(isAnswerComplete).map((x) => x.itemId));
      const missing = itemsFor(a.version, itemSetOf(a)).filter((q) => !done.has(q.id));
      if (missing.length) throw badRequest("INCOMPLETE", `${missing.length} questions still need an answer`);

      await tx.updateTable("assessment").set({ status: "submitted", submitted_at: new Date() }).where("id", "=", id).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: `assessment.${a.version}.submitted`, targetType: "assessment", targetId: id });

      if (a.cycle_id) await completeCycleIfDone(tx, a.cycle_id, churchId, ctx.personId);
      else if (a.version === "B") await linkBaselinesAndActivate(tx, churchId, { discipleId: ctx.personId }, ctx.personId);
      else await linkBaselinesAndActivate(tx, churchId, { relationshipId: a.relationship_id! }, ctx.personId);
    });
    return withTenant(churchId, async (tx) => strip(await summary(tx, id)));
  });

  /** Compare perspectives (PRD 7.3). Only the two people in the relationship, only once active. */
  app.get("/relationships/:id/comparison", async (req): Promise<ComparisonDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const r = await tx
        .selectFrom("relationship as r")
        .innerJoin("person as dr", "dr.id", "r.discipler_id")
        .innerJoin("person as de", "de.id", "r.disciple_id")
        .selectAll("r")
        .select(["dr.full_name as discipler_name", "de.full_name as disciple_name"])
        .where("r.id", "=", id)
        .executeTakeFirst();
      if (!r || (r.discipler_id !== ctx.personId && r.disciple_id !== ctx.personId)) throw notFound();
      if (!["active", "paused"].includes(r.status) || !r.baseline_a_id || !r.baseline_b_id) {
        throw forbidden("Results are revealed together once you have both finished");
      }
      // The most recent point both have finished: the baseline or a later cycle.
      const latest = (await progressPoints(tx, r)).at(-1)!;
      const c = compare(
        latest.areas.map((p) => ({ area: p.area, raw: 0, scoredItems: 0, outOf20: p.disciple })),
        latest.areas.map((p) => ({ area: p.area, raw: 0, scoredItems: 0, outOf20: p.discipler })),
      );
      const focus = c.discussFirst[0] ?? c.growthAreas[0];
      return {
        ...c,
        relationshipId: r.id,
        disciple: { personId: r.disciple_id, fullName: r.disciple_name ?? "Member" },
        discipler: { personId: r.discipler_id, fullName: r.discipler_name ?? "Member" },
        suggestion: focus
          ? {
              area: focus,
              text: `Talk about ${getArea(focus).name} at your ${latest.label === "Baseline" ? "first review meeting" : "next meeting"}, then agree one practical 30-day step together.`,
            }
          : null,
        basis: { label: latest.label, date: latest.date },
      };
    });
  });
}
