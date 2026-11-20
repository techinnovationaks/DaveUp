// Request identity: who is signed in, and their current church membership.
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import { AppError, forbidden, unauthorized } from "./errors";
import { hmac } from "./crypto";

export const SESSION_COOKIE = "daveup_session";

export interface Membership {
  id: string;
  churchId: string;
  status: "pending" | "approved";
  isAdmin: boolean;
  participation: "grow" | "disciple" | "both";
  department: string | null;
  churchStatus: "unverified" | "verified" | "suspended";
}

export interface Auth {
  personId: string;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: Auth | null;
  }
}

function tokenFrom(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[SESSION_COOKIE] ?? null;
}

/** onRequest hook: resolve the session token (cookie for web, bearer for mobile). */
export async function resolveAuth(req: FastifyRequest): Promise<void> {
  req.auth = null;
  const token = tokenFrom(req);
  if (!token) return;
  const s = await ownerDb
    .selectFrom("session")
    .select(["id", "person_id"])
    .where("token_hash", "=", hmac(token))
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  if (s) req.auth = { personId: s.person_id, sessionId: s.id };
}

export function requireAuth(req: FastifyRequest): Auth {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export async function currentMembership(personId: string): Promise<Membership | null> {
  const m = await ownerDb
    .selectFrom("membership")
    .innerJoin("church", "church.id", "membership.church_id")
    .select(["membership.id", "membership.church_id", "membership.status", "membership.is_admin", "membership.participation", "membership.department", "church.status as church_status"])
    .where("membership.person_id", "=", personId)
    .where("membership.status", "in", ["pending", "approved"])
    .executeTakeFirst();
  if (!m) return null;
  return {
    id: m.id,
    churchId: m.church_id,
    status: m.status as "pending" | "approved",
    isAdmin: m.is_admin,
    participation: m.participation,
    department: m.department,
    churchStatus: m.church_status,
  };
}

/** Signed in AND an approved member of a church. */
export async function requireMember(req: FastifyRequest): Promise<Auth & { membership: Membership }> {
  const auth = requireAuth(req);
  const membership = await currentMembership(auth.personId);
  if (!membership) throw forbidden("Join your church first");
  if (membership.status !== "approved") throw forbidden("Your church has not approved your membership yet");
  if (membership.churchStatus === "suspended") {
    throw new AppError(403, "CHURCH_SUSPENDED", "Your church's DaveUp access is paused. Please contact your church administrator.");
  }
  return { ...auth, membership };
}

/** DaveUp staff: flagged in the database, or named by verified email in SUPER_ADMIN_EMAILS. */
export async function isSuperAdmin(personId: string): Promise<boolean> {
  const p = await ownerDb.selectFrom("person").select(["is_super_admin", "email", "email_verified_at"]).where("id", "=", personId).executeTakeFirst();
  if (!p) return false;
  return p.is_super_admin || isConfigSuperAdmin(p.email, p.email_verified_at);
}

export function isConfigSuperAdmin(email: string | null, verifiedAt: Date | null): boolean {
  return !!email && !!verifiedAt && config.superAdminEmails.includes(email.toLowerCase());
}

export async function requireSuperAdmin(req: FastifyRequest): Promise<Auth> {
  const auth = requireAuth(req);
  if (!(await isSuperAdmin(auth.personId))) throw forbidden("Only DaveUp staff can do this");
  return auth;
}

export async function requireAdmin(req: FastifyRequest): Promise<Auth & { membership: Membership }> {
  const ctx = await requireMember(req);
  if (!ctx.membership.isAdmin) throw forbidden("Only church administrators can do this");
  return ctx;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionDays * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
