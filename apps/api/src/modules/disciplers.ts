// Discipler activation (PRD 6.2) and the admin approval queue (PRD 12.2, screen 13).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CAPACITY_STATUSES, DecisionSchema, MAX_ACTIVE_DISCIPLES, type AdminOverviewDto, type ApprovalsDto, type DisciplerCardDto } from "@daveup/shared";
import { ownerDb, withTenant } from "../db/pool";
import { audit } from "../lib/audit";
import { assertRoom } from "../lib/limits";
import { churchAdminIds, notify } from "../lib/notify";
import { requireAdmin, requireMember } from "../lib/context";
import { conflict, notFound, parse } from "../lib/errors";

const IdParam = z.object({ id: z.string().uuid() });

export async function disciplerRoutes(app: FastifyInstance) {
  /** A member asks for discipler status. */
  app.post("/discipler-status/request", async (req, reply) => {
    const ctx = await requireMember(req);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      const existing = await tx.selectFrom("discipler_status").select(["id", "status"]).where("person_id", "=", ctx.personId).forUpdate().executeTakeFirst();
      if (existing?.status === "approved") throw conflict("ALREADY_DISCIPLER", "You are already an approved discipler");
      if (existing?.status === "requested") throw conflict("ALREADY_REQUESTED", "Your request is already waiting for approval");
      if (existing?.status === "suspended") throw conflict("SUSPENDED", "Your discipler status is suspended. Speak with your organization administrator.");
      if (existing) {
        await tx
          .updateTable("discipler_status")
          .set({ status: "requested", requested_at: new Date(), decided_at: null, decided_by: null, note: null })
          .where("id", "=", existing.id)
          .execute();
      } else {
        await tx.insertInto("discipler_status").values({ church_id: churchId, person_id: ctx.personId, status: "requested" }).execute();
      }
      await audit(tx, { churchId, actorId: ctx.personId, action: "discipler_status.requested", targetType: "person", targetId: ctx.personId });
      const me = await tx.selectFrom("person").select("full_name").where("id", "=", ctx.personId).executeTakeFirst();
      const admins = (await churchAdminIds(tx)).filter((id) => id !== ctx.personId);
      await notify(tx, churchId, admins, "admin.discipler_request", { name: me?.full_name ?? "A member" });
    });
    reply.code(201);
    return { status: "requested" };
  });

  /** Approved disciplers in my church, with open places (PRD 13.4 item 2). */
  app.get("/disciplers", async (req): Promise<DisciplerCardDto[]> => {
    const ctx = await requireMember(req);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const rows = await tx
        .selectFrom("discipler_status as ds")
        .innerJoin("membership as m", (j) => j.onRef("m.person_id", "=", "ds.person_id").on("m.status", "=", "approved"))
        .innerJoin("person as p", "p.id", "ds.person_id")
        .leftJoin("relationship as r", (j) => j.onRef("r.discipler_id", "=", "ds.person_id").on("r.status", "in", CAPACITY_STATUSES))
        .select((eb) => ["p.id as personId", "p.full_name as fullName", "m.department", eb.fn.count<string>("r.id").as("filled")])
        .where("ds.status", "=", "approved")
        .where("ds.person_id", "!=", ctx.personId)
        .groupBy(["p.id", "p.full_name", "m.department"])
        .orderBy("p.full_name")
        .execute();
      return rows.map((r) => ({
        personId: r.personId,
        fullName: r.fullName ?? "Member",
        department: r.department,
        placesFilled: Number(r.filled),
        placesTotal: MAX_ACTIVE_DISCIPLES,
      }));
    });
  });

  app.get("/admin/approvals", async (req): Promise<ApprovalsDto> => {
    const ctx = await requireAdmin(req);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const members = await tx
        .selectFrom("membership as m")
        .innerJoin("person as p", "p.id", "m.person_id")
        .select(["m.id as membershipId", "p.id as personId", "p.full_name as fullName", "p.phone", "p.email", "m.participation", "m.department", "m.created_at as requestedAt"])
        .where("m.status", "=", "pending")
        .orderBy("m.created_at")
        .execute();
      const disciplerRequests = await tx
        .selectFrom("discipler_status as ds")
        .innerJoin("person as p", "p.id", "ds.person_id")
        .leftJoin("membership as m", (j) => j.onRef("m.person_id", "=", "ds.person_id").on("m.status", "=", "approved"))
        .select(["ds.id", "p.id as personId", "p.full_name as fullName", "m.department", "ds.requested_at as requestedAt"])
        .where("ds.status", "=", "requested")
        .orderBy("ds.requested_at")
        .execute();
      return {
        members: members.map((m) => ({ ...m, requestedAt: m.requestedAt.toISOString() })),
        disciplerRequests: disciplerRequests.map((d) => ({ ...d, requestedAt: d.requestedAt.toISOString() })),
      };
    });
  });

  /** Church console overview: counts for the administrator's church. */
  app.get("/admin/overview", async (req): Promise<AdminOverviewDto> => {
    const ctx = await requireAdmin(req);
    const churchId = ctx.membership.churchId;
    const c = await ownerDb.selectFrom("church").select(["id", "name", "city", "status", "plan", "join_code"]).where("id", "=", churchId).executeTakeFirstOrThrow();
    const counts = await withTenant(churchId, async (tx) => {
      const n = (v: unknown) => Number(v ?? 0);
      const m = await tx
        .selectFrom("membership")
        .select((eb) => [
          eb.fn.countAll<string>().filterWhere("status", "=", "approved").as("approved"),
          eb.fn.countAll<string>().filterWhere("status", "=", "pending").as("pending"),
        ])
        .executeTakeFirstOrThrow();
      const d = await tx
        .selectFrom("discipler_status")
        .select((eb) => [
          eb.fn.countAll<string>().filterWhere("status", "=", "approved").as("approved"),
          eb.fn.countAll<string>().filterWhere("status", "=", "requested").as("requested"),
        ])
        .executeTakeFirstOrThrow();
      const r = await tx
        .selectFrom("relationship")
        .select((eb) => [
          eb.fn.countAll<string>().filterWhere("status", "in", ["active", "paused"]).as("active"),
          eb.fn.countAll<string>().filterWhere("status", "=", "accepted_baseline_pending").as("baseline"),
        ])
        .executeTakeFirstOrThrow();
      const without = await tx
        .selectFrom("membership as m")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("m.status", "=", "approved")
        .where(({ not, exists, selectFrom }) =>
          not(exists(selectFrom("relationship as r").select("r.id").whereRef("r.disciple_id", "=", "m.person_id").where("r.status", "in", CAPACITY_STATUSES))),
        )
        .executeTakeFirstOrThrow();
      return {
        members: n(m.approved),
        pendingMembers: n(m.pending),
        disciplers: n(d.approved),
        disciplerRequests: n(d.requested),
        activeRelationships: n(r.active),
        baselinePending: n(r.baseline),
        withoutDiscipler: n(without.n),
      };
    });
    return { church: { id: c.id, name: c.name, city: c.city, status: c.status, plan: c.plan, joinCode: c.join_code }, ...counts };
  });

  for (const decision of ["approve", "reject"] as const) {
    app.post(`/admin/members/:id/${decision}`, async (req) => {
      const ctx = await requireAdmin(req);
      const { id } = parse(IdParam, req.params);
      parse(DecisionSchema, req.body ?? {});
      const churchId = ctx.membership.churchId;
      await withTenant(churchId, async (tx) => {
        const updated = await tx
          .updateTable("membership")
          .set({ status: decision === "approve" ? "approved" : "rejected", decided_at: new Date(), decided_by: ctx.personId })
          .where("id", "=", id)
          .where("status", "=", "pending")
          .returning("person_id")
          .executeTakeFirst();
        if (!updated) throw notFound("That request is no longer waiting");
        await audit(tx, { churchId, actorId: ctx.personId, action: `membership.${decision === "approve" ? "approved" : "rejected"}`, targetType: "person", targetId: updated.person_id });
        if (decision === "approve") {
          const church = await tx.selectFrom("church").select("name").where("id", "=", churchId).executeTakeFirstOrThrow();
          await notify(tx, churchId, [updated.person_id], "member.approved", { churchName: church.name });
        }
      });
      return { ok: true };
    });

    app.post(`/admin/discipler-status/:id/${decision}`, async (req) => {
      const ctx = await requireAdmin(req);
      const { id } = parse(IdParam, req.params);
      const { note } = parse(DecisionSchema, req.body ?? {});
      const churchId = ctx.membership.churchId;
      await withTenant(churchId, async (tx) => {
        if (decision === "approve") await assertRoom(tx, churchId, "disciplers");
        const updated = await tx
          .updateTable("discipler_status")
          .set({ status: decision === "approve" ? "approved" : "rejected", decided_at: new Date(), decided_by: ctx.personId, note: note ?? null })
          .where("id", "=", id)
          .where("status", "=", "requested")
          .returning("person_id")
          .executeTakeFirst();
        if (!updated) throw notFound("That request is no longer waiting");
        await audit(tx, { churchId, actorId: ctx.personId, action: `discipler_status.${decision === "approve" ? "approved" : "rejected"}`, targetType: "person", targetId: updated.person_id });
        // No email when approving yourself.
        if (updated.person_id !== ctx.personId) await notify(tx, churchId, [updated.person_id], decision === "approve" ? "discipler.approved" : "discipler.declined", {});
      });
      return { ok: true };
    });
  }
}
