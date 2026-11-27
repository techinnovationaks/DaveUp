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
  /** The organization this session is looking at, when the person belongs to several. */
  activeChurchId: string | null;
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
    .select(["id", "person_id", "active_church_id"])
    .where("token_hash", "=", hmac(token))
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  if (s) req.auth = { personId: s.person_id, sessionId: s.id, activeChurchId: s.active_church_id };
}

export function requireAuth(req: FastifyRequest): Auth {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Every organization the person belongs to or has asked to join. */
export async function memberships(personId: string): Promise<(Membership & { churchName: string; churchCity: string })[]> {
  const rows = await ownerDb
    .selectFrom("membership")
    .innerJoin("church", "church.id", "membership.church_id")
    .select([
      "membership.id",
      "membership.church_id",
      "membership.status",
      "membership.is_admin",
      "membership.participation",
      "membership.department",
      "membership.created_at",
      "church.status as church_status",
      "church.name as church_name",
      "church.city as church_city",
    ])
    .where("membership.person_id", "=", personId)
    .where("membership.status", "in", ["pending", "approved"])
    .orderBy("membership.created_at")
    .execute();
  return rows.map((m) => ({
    id: m.id,
    churchId: m.church_id,
    status: m.status as "pending" | "approved",
    isAdmin: m.is_admin,
    participation: m.participation,
    department: m.department,
    churchStatus: m.church_status,
    churchName: m.church_name,
    churchCity: m.church_city,
  }));
}

/**
 * The membership a request acts in: the session's chosen organization when the
 * person still belongs to it, otherwise their first approved one (or a pending
 * request if that is all they have).
 */
export async function currentMembership(personId: string, preferChurchId?: string | null): Promise<Membership | null> {
  const all = await memberships(personId);
  const pick =
    (preferChurchId ? all.find((m) => m.churchId === preferChurchId) : undefined) ??
    all.find((m) => m.status === "approved" && m.churchStatus !== "suspended") ??
    all.find((m) => m.status === "approved") ??
    all[0];
  if (!pick) return null;
  const { churchName: _n, churchCity: _c, ...m } = pick;
  return m;
}

/** Signed in AND an approved member of a church. */
export async function requireMember(req: FastifyRequest): Promise<Auth & { membership: Membership }> {
  const auth = requireAuth(req);
  const membership = await currentMembership(auth.personId, auth.activeChurchId);
  if (!membership) throw forbidden("Join your organization first");
  if (membership.status !== "approved") throw forbidden("Your organization has not approved your membership yet");
  if (membership.churchStatus === "suspended") {
    throw new AppError(403, "CHURCH_SUSPENDED", "Your organization's DaveUp access is paused. Please contact your organization administrator.");
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
  if (!ctx.membership.isAdmin) throw forbidden("Only organization administrators can do this");
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
