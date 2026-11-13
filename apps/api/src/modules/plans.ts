// Growth plans, weekly practice and reflection (PRD 8.2, 8.3).
// A plan belongs to one relationship and is seen only by the two people in it.
// Either can draft or edit it; it becomes active once both have confirmed it.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PlanDraftSchema,
  PracticeDaySchema,
  ReflectionSchema,
  addDays,
  compare,
  isoDateSchema,
  isoDay,
  weekStart,
  type GrowthPlanDto,
  type PlanStateDto,
} from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { requireMember } from "../lib/context";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors";
import { progressPoints } from "./cycles";
import { requireActive, requireParty, type PartyRelationship } from "./party";

const IdParam = z.object({ id: z.string().uuid() });
const DayParams = z.object({ id: z.string().uuid(), day: isoDateSchema });

type PlanRow = Awaited<ReturnType<typeof loadPlans>>[number];

async function loadPlans(tx: Tx, relationshipId: string) {
  return tx.selectFrom("growth_plan").selectAll().where("relationship_id", "=", relationshipId).where("status", "in", ["draft", "active"]).execute();
}

async function planDto(tx: Tx, p: PlanRow, r: PartyRelationship, me: string): Promise<GrowthPlanDto> {
  const practices = await tx.selectFrom("plan_practice").selectAll().where("plan_id", "=", p.id).orderBy("position").execute();
  const week = weekStart();
  const logs = practices.length
    ? await tx
        .selectFrom("practice_log")
        .select(["practice_id", "day"])
        .where("practice_id", "in", practices.map((x) => x.id))
        .where("day", ">=", week)
        .where("day", "<=", addDays(week, 6))
        .execute()
    : [];
  const mineCol = r.myRole === "disciple" ? p.confirmed_by_disciple_at : p.confirmed_by_discipler_at;
  const theirsCol = r.myRole === "disciple" ? p.confirmed_by_discipler_at : p.confirmed_by_disciple_at;
  return {
    id: p.id,
    status: p.status as "draft" | "active",
    focusAreas: p.focus_areas,
    lengthDays: p.length_days,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    ended: !!p.ends_on && p.ends_on < isoDay(new Date()),
    confirmedByMe: !!mineCol,
    confirmedByThem: !!theirsCol,
    editedBy: p.edited_by === me ? "me" : "them",
    practices: practices.map((x) => ({
      id: x.id,
      title: x.title,
      detail: x.detail,
      timesPerWeek: x.times_per_week,
      area: x.area,
      doneThisWeek: logs.filter((l) => l.practice_id === x.id).map((l) => l.day).sort(),
    })),
  };
}

/** Focus suggestions from the latest results: areas to discuss, then the lowest. Template only, no AI. */
async function suggestedFocus(tx: Tx, r: PartyRelationship): Promise<number[]> {
  const latest = (await progressPoints(tx, r)).at(-1);
  if (!latest) return [];
  const c = compare(
    latest.areas.map((p) => ({ area: p.area, raw: 0, scoredItems: 0, outOf20: p.disciple })),
    latest.areas.map((p) => ({ area: p.area, raw: 0, scoredItems: 0, outOf20: p.discipler })),
  );
  return [...new Set([...c.growthAreas, ...c.discussFirst])].slice(0, 3);
}

async function planState(tx: Tx, r: PartyRelationship, me: string): Promise<PlanStateDto> {
  const plans = await loadPlans(tx, r.id);
  const active = plans.find((p) => p.status === "active");
  const draft = plans.find((p) => p.status === "draft");
  const reflections = await tx.selectFrom("reflection").selectAll().where("relationship_id", "=", r.id).orderBy("week_start", "desc").limit(4).execute();
  return {
    relationshipId: r.id,
    myRole: r.myRole,
    active: active ? await planDto(tx, active, r, me) : null,
    draft: draft ? await planDto(tx, draft, r, me) : null,
    weekStart: weekStart(),
    reflections: reflections.map((x) => ({
      weekStart: x.week_start,
      did: x.did,
      difficult: x.difficult,
      changed: x.changed,
      needHelp: x.need_help,
      updatedAt: x.updated_at.toISOString(),
    })),
    suggestedFocus: await suggestedFocus(tx, r),
  };
}

export async function planRoutes(app: FastifyInstance) {
  app.get("/relationships/:id/plan", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      return planState(tx, r, ctx.personId);
    });
  });

  /** Create or edit the draft. Editing resets the other person's confirmation. */
  app.put("/relationships/:id/plan/draft", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(PlanDraftSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      const now = new Date();
      const confirmations = r.myRole === "disciple" ? { confirmed_by_disciple_at: now, confirmed_by_discipler_at: null } : { confirmed_by_discipler_at: now, confirmed_by_disciple_at: null };
      const existing = await tx.selectFrom("growth_plan").select("id").where("relationship_id", "=", r.id).where("status", "=", "draft").forUpdate().executeTakeFirst();
      let planId: string;
      if (existing) {
        planId = existing.id;
        await tx
          .updateTable("growth_plan")
          .set({ focus_areas: body.focusAreas, length_days: body.lengthDays, edited_by: ctx.personId, updated_at: now, ...confirmations })
          .where("id", "=", planId)
          .execute();
        await tx.deleteFrom("plan_practice").where("plan_id", "=", planId).execute();
      } else {
        const p = await tx
          .insertInto("growth_plan")
          .values({ church_id: churchId, relationship_id: r.id, status: "draft", focus_areas: body.focusAreas, length_days: body.lengthDays, edited_by: ctx.personId, ...confirmations })
          .returning("id")
          .executeTakeFirstOrThrow();
        planId = p.id;
      }
      await tx
        .insertInto("plan_practice")
        .values(
          body.practices.map((x, i) => ({
            church_id: churchId,
            plan_id: planId,
            position: i,
            title: x.title,
            detail: x.detail || null,
            times_per_week: x.timesPerWeek,
            area: x.area ?? null,
          })),
        )
        .execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "plan.drafted", targetType: "relationship", targetId: r.id });
      return planState(tx, r, ctx.personId);
    });
  });

  /** Confirm the draft. Once both have confirmed it becomes the active plan, replacing the old one. */
  app.post("/relationships/:id/plan/draft/confirm", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      const d = await tx.selectFrom("growth_plan").selectAll().where("relationship_id", "=", r.id).where("status", "=", "draft").forUpdate().executeTakeFirst();
      if (!d) throw notFound("There is no plan waiting to be confirmed");
      const now = new Date();
      const mine = r.myRole === "disciple" ? "confirmed_by_disciple_at" : "confirmed_by_discipler_at";
      const theirs = r.myRole === "disciple" ? d.confirmed_by_discipler_at : d.confirmed_by_disciple_at;
      if (!theirs) {
        await tx.updateTable("growth_plan").set({ [mine]: now }).where("id", "=", d.id).execute();
        return planState(tx, r, ctx.personId);
      }
      const today = isoDay(now);
      await tx.updateTable("growth_plan").set({ status: "replaced", updated_at: now }).where("relationship_id", "=", r.id).where("status", "=", "active").execute();
      await tx
        .updateTable("growth_plan")
        .set({ [mine]: now, status: "active", starts_on: today, ends_on: addDays(today, d.length_days - 1), updated_at: now })
        .where("id", "=", d.id)
        .execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "plan.activated", targetType: "relationship", targetId: r.id });
      return planState(tx, r, ctx.personId);
    });
  });

  app.delete("/relationships/:id/plan/draft", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      await tx.updateTable("growth_plan").set({ status: "discarded", updated_at: new Date() }).where("relationship_id", "=", r.id).where("status", "=", "draft").execute();
      return planState(tx, r, ctx.personId);
    });
  });

  /** The disciple ticks a practice for a day (today or earlier in the plan). */
  app.put("/practices/:id/days/:day", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id, day } = parse(DayParams, req.params);
    const { done } = parse(PracticeDaySchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const pr = await tx
        .selectFrom("plan_practice as x")
        .innerJoin("growth_plan as p", "p.id", "x.plan_id")
        .select(["x.id", "p.relationship_id", "p.status", "p.starts_on", "p.ends_on"])
        .where("x.id", "=", id)
        .executeTakeFirst();
      if (!pr) throw notFound();
      const r = await requireParty(tx, pr.relationship_id, ctx.personId);
      requireActive(r);
      if (r.myRole !== "disciple") throw forbidden("Only the disciple records their own practice");
      if (pr.status !== "active") throw conflict("PLAN_NOT_ACTIVE", "This plan is not active");
      const today = isoDay(new Date());
      if (day > today) throw badRequest("FUTURE_DAY", "You can only record today or earlier");
      if ((pr.starts_on && day < pr.starts_on) || (pr.ends_on && day > pr.ends_on)) throw badRequest("OUTSIDE_PLAN", "That day is outside this plan");
      if (done) {
        await tx.insertInto("practice_log").values({ practice_id: id, church_id: churchId, day }).onConflict((oc) => oc.columns(["practice_id", "day"]).doNothing()).execute();
      } else {
        await tx.deleteFrom("practice_log").where("practice_id", "=", id).where("day", "=", day).execute();
      }
      return planState(tx, r, ctx.personId);
    });
  });

  /** This week's reflection, written by the disciple and shared with their discipler. */
  app.put("/relationships/:id/reflection", async (req): Promise<PlanStateDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(ReflectionSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireActive(r);
      if (r.myRole !== "disciple") throw forbidden("The disciple writes the weekly reflection");
      const values = { did: body.did || null, difficult: body.difficult || null, changed: body.changed || null, need_help: body.needHelp || null };
      await tx
        .insertInto("reflection")
        .values({ church_id: churchId, relationship_id: r.id, week_start: weekStart(), author_id: ctx.personId, ...values })
        .onConflict((oc) => oc.columns(["relationship_id", "week_start"]).doUpdateSet({ ...values, updated_at: new Date() }))
        .execute();
      return planState(tx, r, ctx.personId);
    });
  });
}
