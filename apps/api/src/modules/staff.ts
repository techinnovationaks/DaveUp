// DaveUp staff console (super administrators): every church on the platform.
// Verify, suspend and reinstate churches, change plans, find people, and
// give or remove staff access. Works across churches, so it runs on the owner
// connection; every change is written to the audit log.
//
// Staff see who belongs where and how much the platform is used. They never
// see message text, files, assessment answers, reflections or meeting notes.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  ChurchPlanSchema,
  ChurchStatusSchema,
  SuperAdminSchema,
  type StaffAuditDto,
  type StaffChurchDetailDto,
  type StaffChurchDto,
  type StaffOverviewDto,
  type StaffPersonDto,
} from "@daveup/shared";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import { audit } from "../lib/audit";
import { isConfigSuperAdmin, requireSuperAdmin } from "../lib/context";
import { badRequest, conflict, notFound, parse } from "../lib/errors";
import { notify } from "../lib/notify";

const IdParam = z.object({ id: z.string().uuid() });
const ChurchQuery = z.object({
  status: z.enum(["unverified", "verified", "suspended"]).optional(),
  q: z.string().trim().max(100).optional(),
});
const PeopleQuery = z.object({ q: z.string().trim().max(100).optional(), staff: z.enum(["1"]).optional() });

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
const n = (v: unknown) => Number(v ?? 0);

async function churchRows(where: { id?: string; status?: string; q?: string }): Promise<StaffChurchDto[]> {
  let q = ownerDb
    .selectFrom("church as c")
    .select([
      "c.id",
      "c.name",
      "c.city",
      "c.status",
      "c.plan",
      "c.created_at",
      "c.verified_at",
      (eb) => eb.selectFrom("membership").select((e) => e.fn.countAll<string>().as("n")).whereRef("church_id", "=", "c.id").where("status", "=", "approved").as("members"),
      (eb) => eb.selectFrom("membership").select((e) => e.fn.countAll<string>().as("n")).whereRef("church_id", "=", "c.id").where("status", "=", "pending").as("pending"),
      (eb) => eb.selectFrom("conversation").select((e) => e.fn.countAll<string>().as("n")).whereRef("church_id", "=", "c.id").where("kind", "=", "cell").where("archived_at", "is", null).as("cells"),
    ])
    .orderBy(sql`case c.status when 'unverified' then 0 when 'suspended' then 1 else 2 end`)
    .orderBy("c.created_at", "desc")
    .limit(500);
  if (where.id) q = q.where("c.id", "=", where.id);
  if (where.status) q = q.where("c.status", "=", where.status as "verified");
  if (where.q) q = q.where((e) => e.or([e("c.name", "ilike", like(where.q!)), e("c.city", "ilike", like(where.q!))]));
  const rows = await q.execute();
  if (rows.length === 0) return [];
  const admins = await ownerDb
    .selectFrom("membership as m")
    .innerJoin("person as p", "p.id", "m.person_id")
    .select(["m.church_id", "p.id", "p.full_name", "p.email", "p.phone"])
    .where("m.church_id", "in", rows.map((r) => r.id))
    .where("m.is_admin", "=", true)
    .where("m.status", "=", "approved")
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    status: r.status,
    plan: r.plan,
    createdAt: r.created_at.toISOString(),
    verifiedAt: r.verified_at?.toISOString() ?? null,
    members: n(r.members),
    pending: n(r.pending),
    cells: n(r.cells),
    admins: admins.filter((a) => a.church_id === r.id).map((a) => ({ personId: a.id, fullName: a.full_name, email: a.email, phone: a.phone })),
  }));
}

async function churchAdminIds(churchId: string): Promise<string[]> {
  const rows = await ownerDb.selectFrom("membership").select("person_id").where("church_id", "=", churchId).where("is_admin", "=", true).where("status", "=", "approved").execute();
  return rows.map((r) => r.person_id);
}

export async function staffRoutes(app: FastifyInstance) {
  app.get("/staff/overview", async (req): Promise<StaffOverviewDto> => {
    await requireSuperAdmin(req);
    const r = await sql<Record<string, string>>`
      select
        (select count(*) from church) as churches,
        (select count(*) from church where status = 'unverified') as unverified,
        (select count(*) from church where status = 'verified') as verified,
        (select count(*) from church where status = 'suspended') as suspended,
        (select count(*) from person) as people,
        (select count(*) from membership where status = 'approved') as approved,
        (select count(*) from membership where status = 'pending') as pending,
        (select count(*) from conversation where kind = 'cell' and archived_at is null) as cells,
        (select count(*) from message where created_at > now() - interval '7 days' and kind in ('text','file')) as messages7,
        (select count(*) from call_session where started_at > now() - interval '7 days') as calls7,
        (select coalesce(sum(size_bytes), 0) from shared_file where status = 'ready') as bytes
    `.execute(ownerDb);
    const x = r.rows[0]!;
    return {
      churches: { total: n(x.churches), unverified: n(x.unverified), verified: n(x.verified), suspended: n(x.suspended) },
      people: n(x.people),
      approvedMembers: n(x.approved),
      pendingMembers: n(x.pending),
      cells: n(x.cells),
      messagesLast7Days: n(x.messages7),
      callsLast7Days: n(x.calls7),
      filesStoredBytes: n(x.bytes),
    };
  });

  app.get("/staff/churches", async (req): Promise<StaffChurchDto[]> => {
    await requireSuperAdmin(req);
    const { status, q } = parse(ChurchQuery, req.query);
    return churchRows({ status, q });
  });

  app.get("/staff/churches/:id", async (req): Promise<StaffChurchDetailDto> => {
    await requireSuperAdmin(req);
    const { id } = parse(IdParam, req.params);
    const [base] = await churchRows({ id });
    if (!base) throw notFound("Church not found");
    const extra = await sql<Record<string, string>>`
      select
        (select join_code from church where id = ${id}) as join_code,
        (select count(*) from discipler_status where church_id = ${id} and status = 'approved') as disciplers,
        (select count(*) from relationship where church_id = ${id} and status = 'active') as relationships,
        (select count(*) from message where church_id = ${id} and created_at > now() - interval '30 days' and kind in ('text','file')) as messages30
    `.execute(ownerDb);
    const x = extra.rows[0]!;
    const activity = await ownerDb
      .selectFrom("audit_log as a")
      .leftJoin("person as p", "p.id", "a.actor_id")
      .select(["a.action", "p.full_name", "a.created_at", "a.data"])
      .where("a.church_id", "=", id)
      .orderBy("a.created_at", "desc")
      .limit(30)
      .execute();
    return {
      ...base,
      joinCode: x.join_code!,
      disciplers: n(x.disciplers),
      activeRelationships: n(x.relationships),
      messagesLast30Days: n(x.messages30),
      recentActivity: activity.map((a) => ({ action: a.action, actorName: a.full_name, at: a.created_at.toISOString(), data: a.data })),
    };
  });

  /** Verify, suspend or reinstate a church. Its administrators are told by email. */
  app.post("/staff/churches/:id/status", async (req): Promise<StaffChurchDto> => {
    const auth = await requireSuperAdmin(req);
    const { id } = parse(IdParam, req.params);
    const { status, reason } = parse(ChurchStatusSchema, req.body);
    if (status === "suspended" && !reason) throw badRequest("REASON_REQUIRED", "Give a reason for suspending this church");
    await ownerDb.transaction().execute(async (tx) => {
      const c = await tx.selectFrom("church").select(["status", "name"]).where("id", "=", id).forUpdate().executeTakeFirst();
      if (!c) throw notFound("Church not found");
      if (c.status === status) throw conflict("NO_CHANGE", `This church is already ${status}`);
      await tx
        .updateTable("church")
        .set({ status, ...(status === "verified" ? { verified_at: new Date() } : status === "unverified" ? { verified_at: null } : {}) })
        .where("id", "=", id)
        .execute();
      await audit(tx, { churchId: id, actorId: auth.personId, action: `staff.church_${status}`, targetType: "church", targetId: id, data: { from: c.status, to: status, ...(reason ? { reason } : {}) } });
      const admins = await churchAdminIds(id);
      if (status === "suspended") await notify(tx, id, admins, "church.suspended", { churchName: c.name });
      else if (c.status === "suspended") await notify(tx, id, admins, "church.reinstated", { churchName: c.name });
      else if (status === "verified") await notify(tx, id, admins, "church.verified", { churchName: c.name });
    });
    return (await churchRows({ id }))[0]!;
  });

  app.post("/staff/churches/:id/plan", async (req): Promise<StaffChurchDto> => {
    const auth = await requireSuperAdmin(req);
    const { id } = parse(IdParam, req.params);
    const { plan } = parse(ChurchPlanSchema, req.body);
    await ownerDb.transaction().execute(async (tx) => {
      const c = await tx.selectFrom("church").select("plan").where("id", "=", id).forUpdate().executeTakeFirst();
      if (!c) throw notFound("Church not found");
      await tx.updateTable("church").set({ plan }).where("id", "=", id).execute();
      await audit(tx, { churchId: id, actorId: auth.personId, action: "staff.church_plan", targetType: "church", targetId: id, data: { from: c.plan, to: plan } });
    });
    return (await churchRows({ id }))[0]!;
  });

  /** Find people across the platform by name, email or phone. ?staff=1 lists staff. */
  app.get("/staff/people", async (req): Promise<StaffPersonDto[]> => {
    await requireSuperAdmin(req);
    const { q, staff } = parse(PeopleQuery, req.query);
    let query = ownerDb
      .selectFrom("person as p")
      .leftJoin("membership as m", (j) => j.onRef("m.person_id", "=", "p.id").on("m.status", "in", ["pending", "approved"]))
      .leftJoin("church as c", "c.id", "m.church_id")
      .select(["p.id", "p.full_name", "p.email", "p.email_verified_at", "p.phone", "p.created_at", "p.is_super_admin", "c.id as church_id", "c.name as church_name", "c.status as church_status", "m.is_admin"])
      .orderBy("p.full_name")
      .limit(100);
    if (staff) {
      const emails = config.superAdminEmails;
      query = query.where((e) => (emails.length ? e.or([e("p.is_super_admin", "=", true), e.and([e("p.email", "in", emails), e("p.email_verified_at", "is not", null)])]) : e("p.is_super_admin", "=", true)));
    } else if (q) {
      query = query.where((e) => e.or([e("p.full_name", "ilike", like(q)), e("p.email", "ilike", like(q)), e("p.phone", "ilike", like(q))]));
    } else {
      query = query.orderBy("p.created_at", "desc");
    }
    const rows = await query.execute();
    return rows.map((r) => {
      const fromConfig = isConfigSuperAdmin(r.email, r.email_verified_at);
      return {
        personId: r.id,
        fullName: r.full_name,
        email: r.email,
        emailVerified: !!r.email_verified_at,
        phone: r.phone,
        createdAt: r.created_at.toISOString(),
        church: r.church_id ? { id: r.church_id, name: r.church_name!, status: r.church_status!, isAdmin: !!r.is_admin } : null,
        isSuperAdmin: r.is_super_admin || fromConfig,
        superAdminFromConfig: fromConfig,
      };
    });
  });

  /** Give or remove staff access. Staff named in SUPER_ADMIN_EMAILS can only be changed on the server. */
  app.post("/staff/super-admins", async (req): Promise<{ ok: true }> => {
    const auth = await requireSuperAdmin(req);
    const { personId, grant } = parse(SuperAdminSchema, req.body);
    if (!grant && personId === auth.personId) throw badRequest("SELF", "You cannot remove your own staff access");
    await ownerDb.transaction().execute(async (tx) => {
      const p = await tx.selectFrom("person").select(["is_super_admin", "email", "email_verified_at"]).where("id", "=", personId).forUpdate().executeTakeFirst();
      if (!p) throw notFound("Person not found");
      if (grant && !p.email_verified_at) throw badRequest("EMAIL_NOT_VERIFIED", "Staff must have a verified email address");
      if (!grant && isConfigSuperAdmin(p.email, p.email_verified_at)) {
        throw conflict("FROM_CONFIG", "This person is staff through the server setting SUPER_ADMIN_EMAILS. Remove them there.");
      }
      if (p.is_super_admin === grant) return;
      await tx.updateTable("person").set({ is_super_admin: grant, updated_at: new Date() }).where("id", "=", personId).execute();
      await audit(tx, { churchId: null, actorId: auth.personId, action: grant ? "staff.granted" : "staff.revoked", targetType: "person", targetId: personId });
    });
    return { ok: true };
  });

  /** Recent staff actions across the platform. */
  app.get("/staff/audit", async (req): Promise<StaffAuditDto[]> => {
    await requireSuperAdmin(req);
    const rows = await ownerDb
      .selectFrom("audit_log as a")
      .leftJoin("person as p", "p.id", "a.actor_id")
      .leftJoin("church as c", "c.id", "a.church_id")
      .select(["a.action", "p.full_name", "c.name as church_name", "a.target_type", "a.created_at", "a.data"])
      .where("a.action", "like", "staff.%")
      .orderBy("a.created_at", "desc")
      .limit(100)
      .execute();
    return rows.map((r) => ({ action: r.action, actorName: r.full_name, churchName: r.church_name, targetType: r.target_type, at: r.created_at.toISOString(), data: r.data }));
  });
}
