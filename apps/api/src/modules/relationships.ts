// Discipleship relationships (PRD 6.3 to 6.7).
// Both entry routes (disciple requests / discipler invites) converge on one
// consent flow: the other person accepts, capacity is checked, the
// relationship becomes "accepted, baseline pending", and turns active only
// when both baseline assessments are submitted.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  AcceptRelationshipSchema,
  CAPACITY_STATUSES,
  CreateRelationshipSchema,
  EndRelationshipSchema,
  MAX_ACTIVE_DISCIPLES,
  TEST_B_REUSE_DAYS,
  type RelationshipDto,
} from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { assertRoom } from "../lib/limits";
import { notify } from "../lib/notify";
import { requireMember } from "../lib/context";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, parse } from "../lib/errors";

const IdParam = z.object({ id: z.string().uuid() });

/** Full names for notifications, by person id. */
async function nameOf(tx: Tx, personId: string): Promise<string> {
  const p = await tx.selectFrom("person").select("full_name").where("id", "=", personId).executeTakeFirst();
  return p?.full_name ?? "Someone";
}

async function isApprovedDiscipler(tx: Tx, personId: string): Promise<boolean> {
  const r = await tx.selectFrom("discipler_status").select("status").where("person_id", "=", personId).executeTakeFirst();
  return r?.status === "approved";
}

async function isApprovedMember(tx: Tx, personId: string): Promise<boolean> {
  const r = await tx.selectFrom("membership").select("id").where("person_id", "=", personId).where("status", "=", "approved").executeTakeFirst();
  return !!r;
}

async function hasPrimaryDiscipler(tx: Tx, discipleId: string): Promise<boolean> {
  const r = await tx.selectFrom("relationship").select("id").where("disciple_id", "=", discipleId).where("status", "in", CAPACITY_STATUSES).executeTakeFirst();
  return !!r;
}

/**
 * Attach any submitted baselines to relationships waiting on them, and
 * activate relationships whose two baselines are both in. Called after a
 * relationship is accepted and after an assessment is submitted.
 */
export async function linkBaselinesAndActivate(tx: Tx, churchId: string, opts: { discipleId?: string; relationshipId?: string }, actorId: string) {
  let q = tx.selectFrom("relationship").selectAll().where("status", "=", "accepted_baseline_pending");
  if (opts.relationshipId) q = q.where("id", "=", opts.relationshipId);
  if (opts.discipleId) q = q.where("disciple_id", "=", opts.discipleId);
  const pending = await q.forUpdate().execute();

  for (const r of pending) {
    let bId = r.baseline_b_id;
    if (!bId) {
      // Reuse the disciple's most recent Test B if submitted within the reuse window (PRD 6.7 rule 10).
      const cutoff = new Date(Date.now() - TEST_B_REUSE_DAYS * 86_400_000);
      const b = await tx
        .selectFrom("assessment")
        .select("id")
        .where("version", "=", "B")
        .where("kind", "=", "full") // a 12-question monthly check is never a baseline
        .where("respondent_id", "=", r.disciple_id)
        .where("status", "=", "submitted")
        .where("submitted_at", ">=", cutoff)
        .orderBy("submitted_at", "desc")
        .limit(1)
        .executeTakeFirst();
      bId = b?.id ?? null;
    }
    let aId = r.baseline_a_id;
    if (!aId) {
      const a = await tx
        .selectFrom("assessment")
        .select("id")
        .where("version", "=", "A")
        .where("relationship_id", "=", r.id)
        .where("cycle_id", "is", null)
        .where("status", "=", "submitted")
        .orderBy("submitted_at", "desc")
        .limit(1)
        .executeTakeFirst();
      aId = a?.id ?? null;
    }
    const activate = !!aId && !!bId;
    if (bId !== r.baseline_b_id || aId !== r.baseline_a_id || activate) {
      await tx
        .updateTable("relationship")
        .set({ baseline_a_id: aId, baseline_b_id: bId, ...(activate ? { status: "active", activated_at: new Date() } : {}) })
        .where("id", "=", r.id)
        .execute();
      if (activate) {
        await audit(tx, { churchId, actorId, action: "relationship.activated", targetType: "relationship", targetId: r.id });
        await notify(tx, churchId, [r.disciple_id], "relationship.active", { otherName: await nameOf(tx, r.discipler_id), relationshipId: r.id });
        await notify(tx, churchId, [r.discipler_id], "relationship.active", { otherName: await nameOf(tx, r.disciple_id), relationshipId: r.id });
      }
    }
  }
}

async function toDtos(tx: Tx, personId: string, ids?: string[]): Promise<RelationshipDto[]> {
  let q = tx
    .selectFrom("relationship as r")
    .innerJoin("person as dr", "dr.id", "r.discipler_id")
    .innerJoin("person as de", "de.id", "r.disciple_id")
    .selectAll("r")
    .select(["dr.full_name as discipler_name", "de.full_name as disciple_name"])
    .where((eb) => eb.or([eb("r.discipler_id", "=", personId), eb("r.disciple_id", "=", personId)]))
    .orderBy("r.created_at", "desc");
  if (ids) q = q.where("r.id", "in", ids);
  const rows = await q.execute();
  if (rows.length === 0) return [];

  // In-progress assessments, to show "in progress" vs "not started".
  const relIds = rows.map((r) => r.id);
  const discipleIds = [...new Set(rows.map((r) => r.disciple_id))];
  const openA = await tx.selectFrom("assessment").select(["id", "relationship_id", "respondent_id"]).where("version", "=", "A").where("relationship_id", "in", relIds).where("cycle_id", "is", null).execute();
  const openB = await tx
    .selectFrom("assessment")
    .select(["respondent_id"])
    .where("version", "=", "B")
    .where("cycle_id", "is", null)
    .where("status", "=", "in_progress")
    .where("respondent_id", "in", discipleIds)
    .execute();
  const openBSet = new Set(openB.map((b) => b.respondent_id));

  return rows.map((r) => {
    const myRole: RelationshipDto["myRole"] = r.discipler_id === personId ? "discipler" : "disciple";
    const aForRel = openA.filter((a) => a.relationship_id === r.id);
    const baseline = {
      disciple: r.baseline_b_id ? "submitted" : openBSet.has(r.disciple_id) ? "in_progress" : "not_started",
      discipler: r.baseline_a_id ? "submitted" : aForRel.length ? "in_progress" : "not_started",
    } as const;

    const iAccepted = r.initiated_by === "church" && !!(myRole === "disciple" ? r.disciple_accepted_at : r.discipler_accepted_at);
    let awaiting: RelationshipDto["awaiting"] = null;
    if (r.status === "requested" && r.initiated_by === "church") {
      // Suggested by the church: both people accept.
      const theyAccepted = !!(myRole === "disciple" ? r.discipler_accepted_at : r.disciple_accepted_at);
      awaiting = !iAccepted && !theyAccepted ? "both" : !iAccepted ? "me" : "them";
    } else if (r.status === "requested") {
      awaiting = r.initiated_by === myRole ? "them" : "me";
    } else if (r.status === "accepted_baseline_pending") {
      const mine = myRole === "disciple" ? baseline.disciple : baseline.discipler;
      const theirs = myRole === "disciple" ? baseline.discipler : baseline.disciple;
      awaiting = mine !== "submitted" && theirs !== "submitted" ? "both" : mine !== "submitted" ? "me" : "them";
    }

    return {
      iAccepted,
      id: r.id,
      status: r.status,
      myRole,
      awaiting,
      initiatedBy: r.initiated_by,
      other:
        myRole === "discipler"
          ? { personId: r.disciple_id, fullName: r.disciple_name ?? "Member" }
          : { personId: r.discipler_id, fullName: r.discipler_name ?? "Member" },
      baseline,
      myAssessmentId: myRole === "discipler" ? (r.baseline_a_id ?? aForRel[0]?.id ?? null) : null,
      createdAt: r.created_at.toISOString(),
      acceptedAt: r.accepted_at?.toISOString() ?? null,
      activatedAt: r.activated_at?.toISOString() ?? null,
    };
  });
}

export async function relationshipRoutes(app: FastifyInstance) {
  app.get("/relationships", async (req) => {
    const ctx = await requireMember(req);
    return withTenant(ctx.membership.churchId, (tx) => toDtos(tx, ctx.personId));
  });

  app.get("/relationships/:id", async (req) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const [dto] = await withTenant(ctx.membership.churchId, (tx) => toDtos(tx, ctx.personId, [id]));
    if (!dto) throw notFound();
    return dto;
  });

  /** Route 1: disciple requests a discipler. Route 2: discipler invites a member. */
  app.post("/relationships", async (req, reply) => {
    const ctx = await requireMember(req);
    const body = parse(CreateRelationshipSchema, req.body);
    const churchId = ctx.membership.churchId;

    const id = await withTenant(churchId, async (tx) => {
      let disciplerId: string;
      let discipleId: string;
      let initiatedBy: "disciple" | "discipler";
      if ("disciplerId" in body) {
        disciplerId = body.disciplerId;
        discipleId = ctx.personId;
        initiatedBy = "disciple";
        if (!(await isApprovedDiscipler(tx, disciplerId)) || !(await isApprovedMember(tx, disciplerId))) {
          throw notFound("That person is not an approved discipler in your church");
        }
      } else {
        disciplerId = ctx.personId;
        discipleId = body.discipleId;
        initiatedBy = "discipler";
        if (!(await isApprovedDiscipler(tx, ctx.personId))) throw forbidden("You need approved discipler status to invite someone");
        if (!(await isApprovedMember(tx, discipleId))) throw notFound("That person is not an approved member of your church");
      }
      if (disciplerId === discipleId) throw badRequest("SELF", "You cannot disciple yourself");
      if (await hasPrimaryDiscipler(tx, discipleId)) {
        throw conflict("HAS_DISCIPLER", initiatedBy === "disciple" ? "You already have a discipler. A change goes through a transfer request." : "This person already has a discipler");
      }

      try {
        const r = await tx
          .insertInto("relationship")
          .values({
            church_id: churchId,
            discipler_id: disciplerId,
            disciple_id: discipleId,
            status: "requested",
            initiated_by: initiatedBy,
            disclosure_confirmed_at: initiatedBy === "disciple" ? new Date() : null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await audit(tx, { churchId, actorId: ctx.personId, action: `relationship.${initiatedBy === "disciple" ? "requested" : "invited"}`, targetType: "relationship", targetId: r.id, data: { disciplerId, discipleId } });
        await notify(tx, churchId, [initiatedBy === "disciple" ? disciplerId : discipleId], initiatedBy === "disciple" ? "relationship.requested" : "relationship.invited", {
          otherName: await nameOf(tx, ctx.personId),
          relationshipId: r.id,
        });
        return r.id;
      } catch (err) {
        if (isUniqueViolation(err, "relationship_one_open_request")) throw conflict("ALREADY_REQUESTED", "A request between you is already waiting");
        throw err;
      }
    });
    reply.code(201);
    const [dto] = await withTenant(churchId, (tx) => toDtos(tx, ctx.personId, [id]));
    return dto;
  });

  app.post("/relationships/:id/accept", async (req) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(AcceptRelationshipSchema, req.body ?? {});
    const churchId = ctx.membership.churchId;

    await withTenant(churchId, async (tx) => {
      const r = await tx.selectFrom("relationship").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!r || (r.discipler_id !== ctx.personId && r.disciple_id !== ctx.personId)) throw notFound();
      if (r.status !== "requested") throw conflict("NOT_PENDING", "This request is no longer waiting");
      const myRole = r.discipler_id === ctx.personId ? "discipler" : "disciple";
      if (r.initiated_by === myRole) throw forbidden("The other person needs to accept this");
      if (myRole === "disciple" && !body.disclosureConfirmed) {
        throw badRequest("DISCLOSURE_REQUIRED", "Confirm you understand what your discipler will see");
      }

      // A church suggestion needs both people. The first acceptance is recorded
      // and the pairing waits; the second one goes through the checks below.
      if (r.initiated_by === "church") {
        const now = new Date();
        const mine = myRole === "disciple" ? { disciple_accepted_at: now, disclosure_confirmed_at: now } : { discipler_accepted_at: now };
        const theirs = myRole === "disciple" ? r.discipler_accepted_at : r.disciple_accepted_at;
        if (myRole === "discipler") {
          const st = await tx.selectFrom("discipler_status").select("status").where("person_id", "=", r.discipler_id).executeTakeFirst();
          if (st?.status !== "approved") throw conflict("DISCIPLER_NOT_ACTIVE", "Your discipler status is not active");
        }
        if (!theirs) {
          await tx.updateTable("relationship").set(mine).where("id", "=", id).execute();
          await audit(tx, { churchId, actorId: ctx.personId, action: "relationship.suggestion_accepted", targetType: "relationship", targetId: id, data: { by: myRole } });
          return;
        }
        await tx.updateTable("relationship").set(mine).where("id", "=", id).execute();
      }

      // Capacity check (PRD 6.4). Lock the discipler's status row so two
      // acceptances at the same moment cannot both take the 12th place.
      const ds = await tx.selectFrom("discipler_status").select("status").where("person_id", "=", r.discipler_id).forUpdate().executeTakeFirst();
      if (ds?.status !== "approved") throw conflict("DISCIPLER_NOT_ACTIVE", "This discipler is not currently approved");
      const { n } = await tx
        .selectFrom("relationship")
        .select(sql<string>`count(*)`.as("n"))
        .where("discipler_id", "=", r.discipler_id)
        .where("status", "in", CAPACITY_STATUSES)
        .executeTakeFirstOrThrow();
      if (Number(n) >= MAX_ACTIVE_DISCIPLES) {
        throw conflict("CAPACITY_FULL", `This discipler already has ${MAX_ACTIVE_DISCIPLES} disciples`);
      }
      // The church's plan limit on disciples (PRD 17.3).
      await assertRoom(tx, churchId, "disciples");

      try {
        await tx
          .updateTable("relationship")
          .set({
            status: "accepted_baseline_pending",
            accepted_at: new Date(),
            ...(myRole === "disciple" ? { disclosure_confirmed_at: new Date() } : {}),
          })
          .where("id", "=", id)
          .execute();
      } catch (err) {
        if (isUniqueViolation(err, "relationship_one_primary")) throw conflict("HAS_DISCIPLER", "This disciple already has a discipler");
        throw err;
      }
      await audit(tx, { churchId, actorId: ctx.personId, action: "relationship.accepted", targetType: "relationship", targetId: id, data: { placesFilledBefore: Number(n) } });
      const other = myRole === "disciple" ? r.discipler_id : r.disciple_id;
      await notify(tx, churchId, [other], "relationship.accepted", { otherName: await nameOf(tx, ctx.personId), relationshipId: id });
      await linkBaselinesAndActivate(tx, churchId, { relationshipId: id }, ctx.personId);
    });
    const [dto] = await withTenant(churchId, (tx) => toDtos(tx, ctx.personId, [id]));
    return dto;
  });

  /** The invited person declines, or the initiator withdraws. */
  app.post("/relationships/:id/decline", async (req) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      const r = await tx.selectFrom("relationship").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!r || (r.discipler_id !== ctx.personId && r.disciple_id !== ctx.personId)) throw notFound();
      if (r.status !== "requested") throw conflict("NOT_PENDING", "This request is no longer waiting");
      const myRole = r.discipler_id === ctx.personId ? "discipler" : "disciple";
      await tx.updateTable("relationship").set({ status: "declined", ended_at: new Date() }).where("id", "=", id).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: r.initiated_by === myRole ? "relationship.withdrawn" : "relationship.declined", targetType: "relationship", targetId: id, data: { by: myRole } });
    });
    return { ok: true };
  });

  /**
   * Either person can end a relationship at any time (PRD 6.5): a disciple is
   * never trapped by the current discipler. A "concern" reason is recorded for
   * the church administrator.
   */
  app.post("/relationships/:id/end", async (req) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { reason, note } = parse(EndRelationshipSchema, req.body);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      const r = await tx.selectFrom("relationship").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!r || (r.discipler_id !== ctx.personId && r.disciple_id !== ctx.personId)) throw notFound();
      if (!CAPACITY_STATUSES.includes(r.status)) throw conflict("NOT_OPEN", "This relationship is not open");
      await tx.updateTable("relationship").set({ status: "ended", ended_at: new Date(), end_reason: reason }).where("id", "=", id).execute();
      await audit(tx, {
        churchId,
        actorId: ctx.personId,
        action: reason === "concern" ? "relationship.ended_with_concern" : "relationship.ended",
        targetType: "relationship",
        targetId: id,
        // The note is kept only on concerns, for the administrator's review.
        data: { reason, endedBy: r.discipler_id === ctx.personId ? "discipler" : "disciple", ...(reason === "concern" && note ? { note } : {}) },
      });
      // The other person is told it ended, never the reason or any concern.
      const other = r.discipler_id === ctx.personId ? r.disciple_id : r.discipler_id;
      await notify(tx, churchId, [other], "relationship.ended", { otherName: await nameOf(tx, ctx.personId) });
    });
    return { ok: true };
  });
}
