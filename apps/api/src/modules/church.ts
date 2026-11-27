// Profile, church registration, lookup by code and joining (PRD 5.2, 6.1, 29, 30).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  EmailRequestSchema,
  EmailVerifySchema,
  JoinChurchSchema,
  JoinOrganizationSchema,
  OrganizationSearchSchema,
  ProfileUpdateSchema,
  RegisterChurchSchema,
  SwitchOrganizationSchema,
  type ChurchLookupDto,
  type MeDto,
  type OrganizationSearchDto,
  type Participation,
} from "@daveup/shared";
import { ownerDb, withTenant } from "../db/pool";
import { audit } from "../lib/audit";
import { newJoinCode } from "../lib/crypto";
import { currentMembership, isConfigSuperAdmin, memberships, requireAdmin, requireAuth, requireMember } from "../lib/context";
import { badRequest, conflict, isUniqueViolation, notFound, parse } from "../lib/errors";
import { sql } from "kysely";
import { consumeCode, issueCode } from "../lib/codes";
import { churchAdminIds, notify } from "../lib/notify";
import { sendEmailCode } from "./auth";

async function loadMe(personId: string, activeChurchId: string | null): Promise<MeDto> {
  const person = await ownerDb.selectFrom("person").select(["id", "full_name", "phone", "email", "email_verified_at", "notify_email", "is_super_admin"]).where("id", "=", personId).executeTakeFirstOrThrow();
  const all = await memberships(personId);
  const m = await currentMembership(personId, activeChurchId);
  let membership: MeDto["membership"] = null;
  let disciplerStatus: MeDto["disciplerStatus"] = null;
  if (m) {
    const church = await ownerDb.selectFrom("church").select(["name", "city"]).where("id", "=", m.churchId).executeTakeFirstOrThrow();
    membership = {
      id: m.id,
      churchId: m.churchId,
      churchName: church.name,
      churchCity: church.city,
      status: m.status,
      participation: m.participation,
      department: m.department,
      isAdmin: m.isAdmin,
      churchStatus: m.churchStatus,
    };
    const ds = await withTenant(m.churchId, (tx) =>
      tx.selectFrom("discipler_status").select("status").where("person_id", "=", personId).executeTakeFirst(),
    );
    disciplerStatus = ds?.status ?? null;
  }
  return {
    person: {
      id: person.id,
      fullName: person.full_name,
      phone: person.phone,
      email: person.email,
      emailVerified: !!person.email_verified_at,
      notifyEmail: person.notify_email,
      isSuperAdmin: person.is_super_admin || isConfigSuperAdmin(person.email, person.email_verified_at),
    },
    membership,
    disciplerStatus,
    memberships: all.map((x) => ({ churchId: x.churchId, churchName: x.churchName, churchCity: x.churchCity, status: x.status, isAdmin: x.isAdmin, suspended: x.churchStatus === "suspended" })),
  };
}

/** Make this session look at one organization. */
async function useOrganization(sessionId: string, churchId: string): Promise<void> {
  await ownerDb.updateTable("session").set({ active_church_id: churchId }).where("id", "=", sessionId).execute();
}

async function requireProfileName(personId: string): Promise<void> {
  const p = await ownerDb.selectFrom("person").select("full_name").where("id", "=", personId).executeTakeFirstOrThrow();
  if (!p.full_name) throw badRequest("PROFILE_INCOMPLETE", "Add your name first");
}

/** One membership (or request) per organization. */
async function ensureNotMember(personId: string, churchId: string): Promise<void> {
  const m = await ownerDb.selectFrom("membership").select("status").where("person_id", "=", personId).where("church_id", "=", churchId).where("status", "in", ["pending", "approved"]).executeTakeFirst();
  if (m) throw conflict("ALREADY_MEMBER", m.status === "pending" ? "You have already asked to join this organization." : "You already belong to this organization.");
}

/** Ask to join an organization: pending until one of its administrators approves. */
async function requestToJoin(personId: string, churchId: string, body: { participation: Participation; department?: string }) {
  await ensureNotMember(personId, churchId);
  const me = await ownerDb.selectFrom("person").select("full_name").where("id", "=", personId).executeTakeFirstOrThrow();
  await withTenant(churchId, async (tx) => {
    try {
      await tx
        .insertInto("membership")
        .values({ church_id: churchId, person_id: personId, status: "pending", participation: body.participation, department: body.department ?? null })
        .execute();
    } catch (err) {
      if (isUniqueViolation(err, "membership_one_per_church")) throw conflict("ALREADY_MEMBER", "You have already asked to join this organization.");
      throw err;
    }
    await audit(tx, { churchId, actorId: personId, action: "membership.requested", targetType: "person", targetId: personId });
    await notify(tx, churchId, await churchAdminIds(tx), "admin.member_waiting", { name: me.full_name ?? "Someone" });
  });
}

export async function churchRoutes(app: FastifyInstance) {
  app.get("/me", async (req) => {
    const { personId, activeChurchId } = requireAuth(req);
    return loadMe(personId, activeChurchId);
  });

  /** Switch the organization this session is looking at. */
  app.post("/me/organization", async (req) => {
    const { personId, sessionId } = requireAuth(req);
    const { churchId } = parse(SwitchOrganizationSchema, req.body);
    if (!(await memberships(personId)).some((m) => m.churchId === churchId)) throw notFound("You do not belong to that organization");
    await useOrganization(sessionId, churchId);
    return loadMe(personId, churchId);
  });

  /** Find an organization by name or city, to ask to join it. */
  app.get("/organizations/search", async (req): Promise<OrganizationSearchDto[]> => {
    const { personId } = requireAuth(req);
    const { q } = parse(OrganizationSearchSchema, req.query);
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const mine = new Set((await memberships(personId)).map((m) => m.churchId));
    const rows = await ownerDb
      .selectFrom("church as c")
      .select([
        "c.id",
        "c.name",
        "c.city",
        "c.status",
        sql<string>`(select count(*) from membership m where m.church_id = c.id and m.status = 'approved')`.as("members"),
      ])
      .where("c.listed", "=", true)
      .where("c.status", "!=", "suspended")
      .where((e) => e.or([e("c.name", "ilike", like), e("c.city", "ilike", like)]))
      .orderBy(sql`c.status = 'verified'`, "desc")
      .orderBy("c.name")
      .limit(30)
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name, city: r.city, verified: r.status === "verified", members: Number(r.members), mine: mine.has(r.id) }));
  });

  /** Ask to join an organization found in the search. */
  app.post("/organizations/:id/join", async (req, reply) => {
    const { personId, sessionId } = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(JoinOrganizationSchema, req.body);
    await requireProfileName(personId);
    const church = await ownerDb.selectFrom("church").select(["id"]).where("id", "=", id).where("listed", "=", true).where("status", "!=", "suspended").executeTakeFirst();
    if (!church) throw notFound("That organization cannot be joined from the search. Ask its office for the organization code.");
    await requestToJoin(personId, church.id, body);
    await useOrganization(sessionId, church.id);
    reply.code(201);
    return loadMe(personId, church.id);
  });

  /** Administrators: show or hide the organization in the public search. */
  app.put("/church/listing", async (req) => {
    const ctx = await requireAdmin(req);
    const { listed } = parse(z.object({ listed: z.boolean() }), req.body);
    await ownerDb.updateTable("church").set({ listed }).where("id", "=", ctx.membership.churchId).execute();
    return { listed };
  });

  app.patch("/me", async (req) => {
    const { personId } = requireAuth(req);
    const body = parse(ProfileUpdateSchema, req.body);
    await ownerDb
      .updateTable("person")
      .set({
        ...(body.fullName !== undefined ? { full_name: body.fullName } : {}),
        ...(body.notifyEmail !== undefined ? { notify_email: body.notifyEmail } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", personId)
      .execute();
    return loadMe(personId, requireAuth(req).activeChurchId);
  });

  /**
   * Add or change your email: a code goes to the new address, and the email
   * only changes once that code is entered (so nobody can claim an address
   * they do not own).
   */
  app.post("/me/email/request", async (req) => {
    const { personId } = requireAuth(req);
    const { email } = parse(EmailRequestSchema, req.body);
    const { code, ttlSeconds } = await issueCode({ email }, "change_email", personId);
    await sendEmailCode(email, code, ttlSeconds, "change_email");
    return { sent: true, expiresInSeconds: ttlSeconds };
  });

  app.post("/me/email/verify", async (req) => {
    const { personId } = requireAuth(req);
    const { email, code } = parse(EmailVerifySchema, req.body);
    await ownerDb.transaction().execute(async (tx) => {
      await consumeCode(tx, { email }, code, "change_email", personId);
      const holder = await tx.selectFrom("person").select(["id", "email_verified_at", "phone"]).where("email", "=", email).forUpdate().executeTakeFirst();
      if (holder && holder.id !== personId) {
        if (holder.email_verified_at || !holder.phone) throw conflict("EMAIL_TAKEN", "That email is already used by another account");
        // An unverified claim by someone else gives way to the proven owner.
        await tx.updateTable("person").set({ email: null, updated_at: new Date() }).where("id", "=", holder.id).execute();
      }
      await tx.updateTable("person").set({ email, email_verified_at: new Date(), updated_at: new Date() }).where("id", "=", personId).execute();
    });
    return loadMe(personId, requireAuth(req).activeChurchId);
  });

  app.patch("/me/participation", async (req) => {
    const ctx = await requireMember(req);
    const { participation } = parse(z.object({ participation: z.enum(["grow", "disciple", "both"]) }), req.body);
    await withTenant(ctx.membership.churchId, (tx) =>
      tx.updateTable("membership").set({ participation }).where("id", "=", ctx.membership.id).execute(),
    );
    return loadMe(ctx.personId, ctx.membership.churchId);
  });

  /** Register a church. The registrant becomes its first administrator (PRD 29.2). */
  app.post("/churches", async (req, reply) => {
    const { personId, sessionId } = requireAuth(req);
    const body = parse(RegisterChurchSchema, req.body);
    await requireProfileName(personId);

    const churchId = await ownerDb.transaction().execute(async (tx) => {
      let church: { id: string } | undefined;
      for (let attempt = 0; attempt < 5 && !church; attempt++) {
        try {
          church = await tx
            .insertInto("church")
            .values({ name: body.name, city: body.city, join_code: newJoinCode(), created_by: personId })
            .returning("id")
            .executeTakeFirstOrThrow();
        } catch (err) {
          if (!isUniqueViolation(err, "church_join_code_key")) throw err;
        }
      }
      if (!church) throw new Error("Could not allocate an organization code");
      await tx
        .insertInto("membership")
        .values({
          church_id: church.id,
          person_id: personId,
          status: "approved",
          participation: body.participation as Participation,
          department: body.department ?? null,
          is_admin: true,
          decided_at: new Date(),
          decided_by: personId,
        })
        .execute();
      await audit(tx, { churchId: church.id, actorId: personId, action: "church.registered", targetType: "church", targetId: church.id });
      return church.id;
    });

    const church = await ownerDb.selectFrom("church").select(["id", "name", "city", "join_code", "status"]).where("id", "=", churchId).executeTakeFirstOrThrow();
    await useOrganization(sessionId, churchId);
    reply.code(201);
    return { church: { id: church.id, name: church.name, city: church.city, joinCode: church.join_code, status: church.status }, me: await loadMe(personId, churchId) };
  });

  /** Admins can see the join code to share with members. */
  app.get("/church", async (req) => {
    const ctx = await requireMember(req);
    const c = await ownerDb.selectFrom("church").select(["id", "name", "city", "join_code", "status", "plan", "listed", "created_by"]).where("id", "=", ctx.membership.churchId).executeTakeFirstOrThrow();
    // The owner (who registered it), while still an approved member: the default leader of new cells.
    const owner = await ownerDb
      .selectFrom("membership as m")
      .innerJoin("person as p", "p.id", "m.person_id")
      .select(["p.id", "p.full_name"])
      .where("m.church_id", "=", c.id)
      .where("m.person_id", "=", c.created_by)
      .where("m.status", "=", "approved")
      .executeTakeFirst();
    return {
      id: c.id,
      name: c.name,
      city: c.city,
      status: c.status,
      plan: c.plan,
      listed: c.listed,
      joinCode: ctx.membership.isAdmin ? c.join_code : null,
      owner: owner ? { personId: owner.id, fullName: owner.full_name ?? "Owner" } : null,
    };
  });

  app.get("/churches/lookup", async (req): Promise<ChurchLookupDto> => {
    requireAuth(req);
    const { code } = parse(z.object({ code: z.string().trim().toUpperCase().min(4).max(16) }), req.query);
    const c = await ownerDb
      .selectFrom("church")
      .select(["id", "name", "city"])
      .where("join_code", "=", code)
      .where("status", "!=", "suspended")
      .executeTakeFirst();
    if (!c) throw notFound("No organization found with that code. Check with your organization's office or administrator.");
    return c;
  });

  /** Join with a church code. Membership starts pending until an admin approves (PRD 30.4). */
  app.post("/churches/join", async (req, reply) => {
    const { personId, sessionId } = requireAuth(req);
    const body = parse(JoinChurchSchema, req.body);
    await requireProfileName(personId);
    const church = await ownerDb.selectFrom("church").select(["id"]).where("join_code", "=", body.code).where("status", "!=", "suspended").executeTakeFirst();
    if (!church) throw notFound("No organization found with that code. Check with your organization's office or administrator.");
    await requestToJoin(personId, church.id, body);
    await useOrganization(sessionId, church.id);
    reply.code(201);
    return loadMe(personId, church.id);
  });

  /** Search approved members by name, for a discipler inviting someone (PRD 6.3 route 2). */
  app.get("/members/search", async (req) => {
    const ctx = await requireMember(req);
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(60) }), req.query);
    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    return withTenant(ctx.membership.churchId, (tx) =>
      tx
        .selectFrom("membership as m")
        .innerJoin("person as p", "p.id", "m.person_id")
        .select(["p.id as personId", "p.full_name as fullName", "m.department"])
        .where("m.status", "=", "approved")
        .where("p.id", "!=", ctx.personId)
        .where("p.full_name", "ilike", like)
        .orderBy("p.full_name")
        .limit(20)
        .execute(),
    );
  });
}
