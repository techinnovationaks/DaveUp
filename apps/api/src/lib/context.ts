// Request identity: who is signed in, and their current church membership.
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import { forbidden, unauthorized } from "./errors";
import { hmac } from "./crypto";

export const SESSION_COOKIE = "daveup_session";

export interface Membership {
  id: string;
  churchId: string;
  status: "pending" | "approved";
  isAdmin: boolean;
  participation: "grow" | "disciple" | "both";
  department: string | null;
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
    .select(["id", "church_id", "status", "is_admin", "participation", "department"])
    .where("person_id", "=", personId)
    .where("status", "in", ["pending", "approved"])
    .executeTakeFirst();
  if (!m) return null;
  return {
    id: m.id,
    churchId: m.church_id,
    status: m.status as "pending" | "approved",
    isAdmin: m.is_admin,
    participation: m.participation,
    department: m.department,
  };
}

/** Signed in AND an approved member of a church. */
export async function requireMember(req: FastifyRequest): Promise<Auth & { membership: Membership }> {
  const auth = requireAuth(req);
  const membership = await currentMembership(auth.personId);
  if (!membership) throw forbidden("Join your church first");
  if (membership.status !== "approved") throw forbidden("Your church has not approved your membership yet");
  return { ...auth, membership };
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
