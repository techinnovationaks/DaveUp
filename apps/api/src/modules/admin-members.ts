// Church console member management (PRD 6.2, 6.3, 33.9, 34.3).
// Administrators see roles and connections only, never assessment answers,
// plans or reflections. Every change is written to the audit log.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  AdminMemberUpdateSchema,
  CAPACITY_STATUSES,
  MAX_ACTIVE_DISCIPLES,
  SuggestDisciplerSchema,
  type ChurchMemberDto,
  type MemberDetailDto,
  type SuggestResultDto,
} from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { requireAdmin } from "../lib/context";
import { badRequest, conflict, notFound, parse } from "../lib/errors";

const IdParam = z.object({ id: z.string().uuid() });

/** Member rows for the list and the detail page. Pending and approved members only. */
async function memberRows(tx: Tx, membershipId?: string): Promise<ChurchMemberDto[]> {
  let q = tx
    .selectFrom("membership as m")
    .innerJoin("person as p", "p.id", "m.person_id")
    .leftJoin("discipler_status as ds", "ds.person_id", "m.person_id")
    .select([
      "m.id as membershipId",
      "p.id as personId",
      "p.full_name as fullName",
      "p.phone",
      "p.email",
      "m.status",
      "m.is_admin as isAdmin",
      "ds.status as disciplerStatus",
      "m.participation",
      "m.department",
      "m.created_at as joinedAt",
    ])
    .where("m.status", "in", ["pending", "approved"])
    .orderBy("m.created_at", "desc");
  if (membershipId) q = q.where("m.id", "=", membershipId);
  const members = await q.execute();

  // Current discipler of each member, and how many each person disciples.
  const open = await tx
    .selectFrom("relationship as r")
    .innerJoin("person as d", "d.id", "r.discipler_id")
    .select(["r.disciple_id", "r.discipler_id", "d.full_name as disciplerName"])
    .where("r.status", "in", CAPACITY_STATUSES)
    .execute();
  const disciplerOf = new Map(open.map((r) => [r.disciple_id, { personId: r.discipler_id, fullName: r.disciplerName }]));
  const disciples = new Map<string, number>();
  for (const r of open) disciples.set(r.discipler_id, (disciples.get(r.discipler_id) ?? 0) + 1);

  return members.map((m) => ({
    ...m,
    disciplerStatus: m.disciplerStatus ?? null,
    discipler: disciplerOf.get(m.personId) ?? null,
    disciplesCount: disciples.get(m.personId) ?? 0,
    joinedAt: m.joinedAt.toISOString(),
  }));
}

async function adminCount(tx: Tx): Promise<number> {
  const { n } = await tx.selectFrom("membership").select(sql<string>`count(*)`.as("n")).where("status", "=", "approved").where("is_admin", "=", true).executeTakeFirstOrThrow();
  return Number(n);
}

async function approvedMembership(tx: Tx, id: string) {
  const m = await tx.selectFrom("membership").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
  if (!m) throw notFound();
  if (m.status !== "approved") throw conflict("NOT_APPROVED", "This person is not an approved member. See Approvals.");
  return m;
}

async function detail(tx: Tx, membershipId: string): Promise<MemberDetailDto> {
  const [member] = await memberRows(tx, membershipId);
  if (!member) throw notFound();
  const ds = await tx.selectFrom("discipler_status").select("id").where("person_id", "=", member.personId).executeTakeFirst();
  const rels = await tx
    .selectFrom("relationship as r")
    .innerJoin("person as dr", "dr.id", "r.discipler_id")
    .innerJoin("person as de", "de.id", "r.disciple_id")
    .select(["r.id", "r.discipler_id", "r.disciple_id", "r.status", "r.initiated_by", "r.created_at", "dr.full_name as discipler_name", "de.full_name as disciple_name"])
    .where((eb) => eb.or([eb("r.discipler_id", "=", member.personId), eb("r.disciple_id", "=", member.personId)]))
    .orderBy("r.created_at", "desc")
    .limit(30)
    .execute();
  const relIds = rels.map((r) => r.id);
  const history = await tx
    .selectFrom("audit_log as a")
    .leftJoin("person as actor", "actor.id", "a.actor_id")
    .select(["a.created_at", "a.action", "actor.full_name as actor_name"])
    .where((eb) => eb.or([eb("a.target_id", "=", member.personId), ...(relIds.length ? [eb("a.target_id", "in", relIds)] : [])]))
    // Admin and relationship decisions only; nothing from assessments, plans or meetings.
    .where((eb) =>
      eb.or([eb("a.action", "like", "membership.%"), eb("a.action", "like", "discipler_status.%"), eb("a.action", "like", "relationship.%"), eb("a.action", "like", "member.%")]),
    )
    .orderBy("a.created_at", "desc")
    .limit(25)
    .execute();
  return {
    member,
    disciplerStatusId: ds?.id ?? null,
    placesFilled: member.disciplesCount,
    relationships: rels.map((r) => {
      const asDisciple = r.disciple_id === member.personId;
      return {
        id: r.id,
        role: asDisciple ? "disciple" : "discipler",
        other: asDisciple ? { personId: r.discipler_id, fullName: r.discipler_name ?? "Member" } : { personId: r.disciple_id, fullName: r.disciple_name ?? "Member" },
        status: r.status,
        initiatedBy: r.initiated_by,
        since: r.created_at.toISOString(),
      };
    }),
    history: history.map((h) => ({ at: h.created_at.toISOString(), action: h.action, actor: h.actor_name })),
    lastAdmin: member.isAdmin && (await adminCount(tx)) <= 1,
  };
}

export async function adminMemberRoutes(app: FastifyInstance) {
  /** Everyone registered in the church: roles and connections only. */
  app.get("/admin/members", async (req): Promise<ChurchMemberDto[]> => {
    const ctx = await requireAdmin(req);
    return withTenant(ctx.membership.churchId, (tx) => memberRows(tx));
  });

  app.get("/admin/members/:id", async (req): Promise<MemberDetailDto> => {
    const ctx = await requireAdmin(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, (tx) => detail(tx, id));
  });

  /** Change department or the administrator role. The last administrator cannot be removed. */
  app.patch("/admin/members/:id", async (req): Promise<MemberDetailDto> => {
    const ctx = await requireAdmin(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(AdminMemberUpdateSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const m = await approvedMembership(tx, id);
      if (body.isAdmin === false && m.is_admin && (await adminCount(tx)) <= 1) {
        throw conflict("LAST_ADMIN", "Your church needs at least one administrator. Make someone else an administrator first.");
      }
      const set: { department?: string | null; is_admin?: boolean } = {};
      if (body.department !== undefined) set.department = body.department || null;
      if (body.isAdmin !== undefined) set.is_admin = body.isAdmin;
      await tx.updateTable("membership").set(set).where("id", "=", id).execute();
      if (body.isAdmin !== undefined && body.isAdmin !== m.is_admin) {
        await audit(tx, { churchId, actorId: ctx.personId, action: body.isAdmin ? "member.made_admin" : "member.admin_removed", targetType: "person", targetId: m.person_id });
      }
      if (body.department !== undefined && (body.department || null) !== m.department) {
        await audit(tx, { churchId, actorId: ctx.personId, action: "member.department_changed", targetType: "person", targetId: m.person_id, data: { from: m.department, to: body.department || null } });
      }
      return detail(tx, id);
    });
  });

  /**
   * Remove someone from the church (PRD 33.9). Ends the church's access only:
   * open relationships end, discipler status is revoked, the account remains
   * and they can join a church again.
   */
  app.post("/admin/members/:id/remove", async (req) => {
    const ctx = await requireAdmin(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      const m = await approvedMembership(tx, id);
      if (m.person_id === ctx.personId) throw conflict("REMOVE_SELF", "You cannot remove yourself. Ask another administrator.");
      if (m.is_admin && (await adminCount(tx)) <= 1) throw conflict("LAST_ADMIN", "Your church needs at least one administrator.");
      const now = new Date();
      await tx.updateTable("membership").set({ status: "left", is_admin: false, decided_at: now, decided_by: ctx.personId }).where("id", "=", id).execute();
      const who = (eb: any) => eb.or([eb("discipler_id", "=", m.person_id), eb("disciple_id", "=", m.person_id)]);
      await tx.updateTable("relationship").set({ status: "declined", ended_at: now }).where(who).where("status", "=", "requested").execute();
      await tx.updateTable("relationship").set({ status: "ended", ended_at: now, end_reason: "removed_from_church" }).where(who).where("status", "in", CAPACITY_STATUSES).execute();
      await tx.updateTable("discipler_status").set({ status: "revoked", decided_at: now, decided_by: ctx.personId }).where("person_id", "=", m.person_id).where("status", "in", ["approved", "requested", "suspended"]).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "membership.removed", targetType: "person", targetId: m.person_id });
    });
    return { ok: true };
  });

  /**
   * Suspend, revoke or reinstate discipler status (PRD 6.2). The person keeps
   * their account and history; current relationships continue, but they are
   * hidden from the discipler list and cannot accept anyone new.
   */
  const transitions = { suspend: { from: ["approved"], to: "suspended" }, revoke: { from: ["approved", "suspended"], to: "revoked" }, reinstate: { from: ["suspended"], to: "approved" } } as const;
  for (const [verb, t] of Object.entries(transitions)) {
    app.post(`/admin/discipler-status/:id/${verb}`, async (req): Promise<{ ok: true }> => {
      const ctx = await requireAdmin(req);
      const { id } = parse(IdParam, req.params);
      const churchId = ctx.membership.churchId;
      await withTenant(churchId, async (tx) => {
        const ds = await tx.selectFrom("discipler_status").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
        if (!ds) throw notFound();
        if (!(t.from as readonly string[]).includes(ds.status)) throw conflict("BAD_STATUS", `Discipler status is ${ds.status}; it cannot be changed that way`);
        await tx.updateTable("discipler_status").set({ status: t.to, decided_at: new Date(), decided_by: ctx.personId }).where("id", "=", id).execute();
        await audit(tx, { churchId, actorId: ctx.personId, action: `discipler_status.${t.to === "approved" ? "reinstated" : t.to}`, targetType: "person", targetId: ds.person_id });
      });
      return { ok: true };
    });
  }

  /**
   * Suggest a discipler for one or more members (PRD 34.3 "bulk assign").
   * Each pairing is a suggestion both people must accept (PRD 6.3).
   */
  app.post("/admin/relationships", async (req, reply): Promise<SuggestResultDto> => {
    const ctx = await requireAdmin(req);
    const body = parse(SuggestDisciplerSchema, req.body);
    const churchId = ctx.membership.churchId;
    const out = await withTenant(churchId, async (tx) => {
      const ds = await tx.selectFrom("discipler_status").select("status").where("person_id", "=", body.disciplerId).forUpdate().executeTakeFirst();
      const dm = await tx.selectFrom("membership").select("id").where("person_id", "=", body.disciplerId).where("status", "=", "approved").executeTakeFirst();
      if (ds?.status !== "approved" || !dm) throw badRequest("NOT_DISCIPLER", "Choose an approved discipler in your church");

      const { n } = await tx.selectFrom("relationship").select(sql<string>`count(*)`.as("n")).where("discipler_id", "=", body.disciplerId).where("status", "in", CAPACITY_STATUSES).executeTakeFirstOrThrow();
      const { p } = await tx
        .selectFrom("relationship")
        .select(sql<string>`count(*)`.as("p"))
        .where("discipler_id", "=", body.disciplerId)
        .where("status", "=", "requested")
        .where("initiated_by", "=", "church")
        .executeTakeFirstOrThrow();
      let open = MAX_ACTIVE_DISCIPLES - Number(n) - Number(p);

      const people = await tx
        .selectFrom("membership as m")
        .innerJoin("person as pe", "pe.id", "m.person_id")
        .select(["m.person_id", "m.status", "pe.full_name"])
        .where("m.person_id", "in", [...new Set(body.discipleIds)])
        .execute();
      const result: SuggestResultDto = { created: 0, skipped: [] };
      for (const personId of [...new Set(body.discipleIds)]) {
        const pr = people.find((x) => x.person_id === personId);
        const skip = (reason: string) => result.skipped.push({ personId, fullName: pr?.full_name ?? null, reason });
        if (!pr || pr.status !== "approved") { skip("Not an approved member"); continue; }
        if (personId === body.disciplerId) { skip("Cannot disciple themselves"); continue; }
        const has = await tx.selectFrom("relationship").select("id").where("disciple_id", "=", personId).where("status", "in", CAPACITY_STATUSES).executeTakeFirst();
        if (has) { skip("Already has a discipler"); continue; }
        const pending = await tx.selectFrom("relationship").select("id").where("disciple_id", "=", personId).where("discipler_id", "=", body.disciplerId).where("status", "=", "requested").executeTakeFirst();
        if (pending) { skip("A request between them is already waiting"); continue; }
        if (open <= 0) { skip(`No places left (${MAX_ACTIVE_DISCIPLES} at most, counting suggestions)`); continue; }
        const r = await tx
          .insertInto("relationship")
          .values({ church_id: churchId, discipler_id: body.disciplerId, disciple_id: personId, status: "requested", initiated_by: "church", proposed_by: ctx.personId })
          .returning("id")
          .executeTakeFirstOrThrow();
        await audit(tx, { churchId, actorId: ctx.personId, action: "relationship.suggested", targetType: "relationship", targetId: r.id, data: { disciplerId: body.disciplerId, discipleId: personId } });
        result.created += 1;
        open -= 1;
      }
      return result;
    });
    reply.code(201);
    return out;
  });

  /** Withdraw a church suggestion that has not been accepted by both yet. */
  app.post("/admin/relationships/:id/withdraw", async (req) => {
    const ctx = await requireAdmin(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      const r = await tx.selectFrom("relationship").select(["id", "status", "initiated_by"]).where("id", "=", id).forUpdate().executeTakeFirst();
      if (!r || r.initiated_by !== "church") throw notFound();
      if (r.status !== "requested") throw conflict("NOT_PENDING", "This suggestion is no longer waiting");
      await tx.updateTable("relationship").set({ status: "declined", ended_at: new Date() }).where("id", "=", id).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "relationship.suggestion_withdrawn", targetType: "relationship", targetId: id });
    });
    return { ok: true };
  });
}
