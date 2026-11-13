// Profile, church registration, lookup by code and joining (PRD 5.2, 6.1, 29, 30).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  JoinChurchSchema,
  ProfileUpdateSchema,
  RegisterChurchSchema,
  type ChurchLookupDto,
  type MeDto,
  type Participation,
} from "@daveup/shared";
import { ownerDb, withTenant } from "../db/pool";
import { audit } from "../lib/audit";
import { newJoinCode } from "../lib/crypto";
import { currentMembership, requireAuth, requireMember } from "../lib/context";
import { badRequest, conflict, isUniqueViolation, notFound, parse } from "../lib/errors";

async function loadMe(personId: string): Promise<MeDto> {
  const person = await ownerDb.selectFrom("person").select(["id", "full_name", "phone", "email"]).where("id", "=", personId).executeTakeFirstOrThrow();
  const m = await currentMembership(personId);
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
    };
    const ds = await withTenant(m.churchId, (tx) =>
      tx.selectFrom("discipler_status").select("status").where("person_id", "=", personId).executeTakeFirst(),
    );
    disciplerStatus = ds?.status ?? null;
  }
  return { person: { id: person.id, fullName: person.full_name, phone: person.phone, email: person.email }, membership, disciplerStatus };
}

async function requireProfileName(personId: string): Promise<void> {
  const p = await ownerDb.selectFrom("person").select("full_name").where("id", "=", personId).executeTakeFirstOrThrow();
  if (!p.full_name) throw badRequest("PROFILE_INCOMPLETE", "Add your name first");
}

async function ensureNoCurrentChurch(personId: string): Promise<void> {
  if (await currentMembership(personId)) throw conflict("ALREADY_IN_CHURCH", "You already belong to a church. Leave it first to join another.");
}

export async function churchRoutes(app: FastifyInstance) {
  app.get("/me", async (req) => loadMe(requireAuth(req).personId));

  app.patch("/me", async (req) => {
    const { personId } = requireAuth(req);
    const body = parse(ProfileUpdateSchema, req.body);
    await ownerDb
      .updateTable("person")
      .set({
        ...(body.fullName !== undefined ? { full_name: body.fullName } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", personId)
      .execute();
    return loadMe(personId);
  });

  app.patch("/me/participation", async (req) => {
    const ctx = await requireMember(req);
    const { participation } = parse(z.object({ participation: z.enum(["grow", "disciple", "both"]) }), req.body);
    await withTenant(ctx.membership.churchId, (tx) =>
      tx.updateTable("membership").set({ participation }).where("id", "=", ctx.membership.id).execute(),
    );
    return loadMe(ctx.personId);
  });

  /** Register a church. The registrant becomes its first administrator (PRD 29.2). */
  app.post("/churches", async (req, reply) => {
    const { personId } = requireAuth(req);
    const body = parse(RegisterChurchSchema, req.body);
    await requireProfileName(personId);
    await ensureNoCurrentChurch(personId);

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
      if (!church) throw new Error("Could not allocate a church code");
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
    reply.code(201);
    return { church: { id: church.id, name: church.name, city: church.city, joinCode: church.join_code, status: church.status }, me: await loadMe(personId) };
  });

  /** Admins can see the join code to share with members. */
  app.get("/church", async (req) => {
    const ctx = await requireMember(req);
    const c = await ownerDb.selectFrom("church").select(["id", "name", "city", "join_code", "status", "plan"]).where("id", "=", ctx.membership.churchId).executeTakeFirstOrThrow();
    return { id: c.id, name: c.name, city: c.city, status: c.status, plan: c.plan, joinCode: ctx.membership.isAdmin ? c.join_code : null };
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
    if (!c) throw notFound("No church found with that code. Check with your church office.");
    return c;
  });

  /** Join with a church code. Membership starts pending until an admin approves (PRD 30.4). */
  app.post("/churches/join", async (req, reply) => {
    const { personId } = requireAuth(req);
    const body = parse(JoinChurchSchema, req.body);
    await requireProfileName(personId);
    await ensureNoCurrentChurch(personId);

    const church = await ownerDb.selectFrom("church").select(["id"]).where("join_code", "=", body.code).where("status", "!=", "suspended").executeTakeFirst();
    if (!church) throw notFound("No church found with that code. Check with your church office.");

    await withTenant(church.id, async (tx) => {
      await tx
        .insertInto("membership")
        .values({ church_id: church.id, person_id: personId, status: "pending", participation: body.participation, department: body.department ?? null })
        .execute();
      await audit(tx, { churchId: church.id, actorId: personId, action: "membership.requested", targetType: "person", targetId: personId });
    });
    reply.code(201);
    return loadMe(personId);
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
