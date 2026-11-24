// Sign-in. Email is the primary method: a 6-digit code sent by email signs
// you up the first time and in every time after. Phone sign-in remains as an
// alternative (with SMS codes once a provider is configured).
import type { FastifyInstance, FastifyReply } from "fastify";
import { sql } from "kysely";
import { EmailRequestSchema, EmailVerifySchema, OtpRequestSchema, OtpVerifySchema, type AuthMethodsDto } from "@daveup/shared";
import { config } from "../config";
import { ownerDb, type Tx } from "../db/pool";
import { consumeCode, issueCode } from "../lib/codes";
import { randomBytes } from "node:crypto";
import { hmac, newSessionToken, safeEqualHex } from "../lib/crypto";
import { getGoogle, pkcePair, type GoogleProfile } from "../lib/google";
import { AppError, badRequest, parse } from "../lib/errors";
import { getEmailSender, renderEmail } from "../lib/email";
import { getOtpSender } from "../lib/otp-sender";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../lib/context";

type Who = { id: string; full_name: string | null };

async function openSession(tx: Tx, person: Who, isNew: boolean, token: string) {
  await tx
    .insertInto("session")
    .values({ person_id: person.id, token_hash: hmac(token), expires_at: new Date(Date.now() + config.sessionDays * 86_400_000) })
    .execute();
  return { personId: person.id, isNew, needsProfile: !person.full_name };
}

/** Find or create the person for a phone number. */
async function personForPhone(tx: Tx, phone: string): Promise<{ person: Who; isNew: boolean }> {
  const found = await tx.selectFrom("person").select(["id", "full_name"]).where("phone", "=", phone).executeTakeFirst();
  if (found) return { person: found, isNew: false };
  const person = await tx.insertInto("person").values({ phone }).returning(["id", "full_name"]).executeTakeFirstOrThrow();
  return { person, isNew: true };
}

/**
 * Find or create the person for an email the caller has just proved they own.
 * Only a verified email identifies an account. An unverified address someone
 * typed into their profile before email sign-in existed is released, so it can
 * never be used to take over the real owner's sign-in.
 */
async function personForEmail(tx: Tx, email: string): Promise<{ person: Who; isNew: boolean }> {
  const holder = await tx.selectFrom("person").select(["id", "full_name", "phone", "email_verified_at"]).where("email", "=", email).forUpdate().executeTakeFirst();
  if (holder?.email_verified_at || (holder && !holder.phone)) {
    if (!holder.email_verified_at) await tx.updateTable("person").set({ email_verified_at: new Date() }).where("id", "=", holder.id).execute();
    return { person: holder, isNew: false };
  }
  if (holder) await tx.updateTable("person").set({ email: null, updated_at: new Date() }).where("id", "=", holder.id).execute();
  const person = await tx.insertInto("person").values({ email, email_verified_at: new Date() }).returning(["id", "full_name"]).executeTakeFirstOrThrow();
  return { person, isNew: true };
}

/**
 * Find or create the person for a Google account. The Google account's id is
 * remembered on first use; until then a Google-verified email is proof of
 * owning that address, exactly like an emailed code.
 */
async function personForGoogle(tx: Tx, g: GoogleProfile): Promise<{ person: Who; isNew: boolean }> {
  const linked = await tx.selectFrom("person").select(["id", "full_name"]).where("google_sub", "=", g.sub).executeTakeFirst();
  if (linked) return { person: linked, isNew: false };
  const { person, isNew } = await personForEmail(tx, g.email);
  const full_name = person.full_name ?? g.name;
  await tx
    .updateTable("person")
    .set({ google_sub: sql`coalesce(google_sub, ${g.sub})`, full_name, updated_at: new Date() })
    .where("id", "=", person.id)
    .execute();
  return { person: { ...person, full_name }, isNew };
}

// The browser carries the Google flow's state and PKCE verifier in a short-lived
// signed cookie, so nothing is stored server-side for an unfinished sign-in.
const GOOGLE_COOKIE = "daveup_google";
const GOOGLE_FLOW_SECONDS = 600;
const googleRedirectUri = () => `${config.appUrl}/api/auth/google/callback`;

function packFlow(flow: { state: string; verifier: string; exp: number }): string {
  const body = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${body}.${hmac(`google-flow:${body}`)}`;
}

function unpackFlow(value: string | undefined): { state: string; verifier: string; exp: number } | null {
  const [body, mac] = (value ?? "").split(".");
  if (!body || !mac || !safeEqualHex(mac, hmac(`google-flow:${body}`))) return null;
  try {
    const f = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof f.state === "string" && typeof f.verifier === "string" && f.exp > Date.now() ? f : null;
  } catch {
    return null;
  }
}

/** Back to the sign-in page with a reason it can explain. */
const googleFailed = (reply: FastifyReply, why: "cancelled" | "expired" | "unverified" | "failed" | "off") =>
  reply.redirect(`${config.appUrl}/signin?google=${why}`, 303);

function finishSignIn(reply: FastifyReply, token: string, result: Awaited<ReturnType<typeof openSession>>) {
  setSessionCookie(reply, token);
  // The token is also returned for the mobile app, which stores it in secure storage.
  return { ...result, token };
}

export async function sendEmailCode(email: string, code: string, ttlSeconds: number, purpose: "signin" | "change_email") {
  const minutes = Math.round(ttlSeconds / 60);
  try {
    await sendCodeEmail(email, code, minutes, purpose);
  } catch (err) {
    // Log the provider's reason for the operator; tell the person plainly.
    console.error("[email] could not send a code:", err instanceof Error ? err.message : err);
    throw new AppError(503, "EMAIL_UNAVAILABLE", "We could not send the email right now. Please try again in a few minutes.");
  }
}

async function sendCodeEmail(email: string, code: string, minutes: number, purpose: "signin" | "change_email") {
  await getEmailSender().send({
    to: email,
    ...renderEmail({
      subject: purpose === "signin" ? `Your DaveUp code: ${code}` : `Confirm your new email: ${code}`,
      title: purpose === "signin" ? "Your sign-in code" : "Confirm your new email address",
      lines: [
        purpose === "signin" ? "Enter this code in DaveUp to sign in." : "Enter this code in DaveUp to use this address for your account.",
        `It expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.`,
      ],
      code,
      footer: "Never share this code. DaveUp and your church will never ask you for it.",
    }),
  });
}

export async function authRoutes(app: FastifyInstance) {
  /** Which sign-in methods are available. */
  app.get("/auth/methods", async (): Promise<AuthMethodsDto> => ({ email: true, phone: true, phoneOtp: getOtpSender() !== null, google: getGoogle() !== null }));

  // ---- Google ----

  /** Start "Continue with Google": the browser is sent to Google's account chooser. */
  app.get("/auth/google/start", async (_req, reply) => {
    const google = getGoogle();
    if (!google) return googleFailed(reply, "off");
    const { verifier, challenge } = pkcePair();
    const state = randomBytes(16).toString("base64url");
    reply.setCookie(GOOGLE_COOKIE, packFlow({ state, verifier, exp: Date.now() + GOOGLE_FLOW_SECONDS * 1000 }), {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      path: "/",
      maxAge: GOOGLE_FLOW_SECONDS,
    });
    return reply.redirect(google.authUrl({ state, codeChallenge: challenge, redirectUri: googleRedirectUri() }), 303);
  });

  /** Google sends the browser back here. Sign in (or up), then carry on in the web app. */
  app.get("/auth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const flow = unpackFlow(req.cookies?.[GOOGLE_COOKIE]);
    reply.clearCookie(GOOGLE_COOKIE, { path: "/" });
    const google = getGoogle();
    if (!google) return googleFailed(reply, "off");
    if (q.error) return googleFailed(reply, "cancelled");
    if (!flow || !q.code || !q.state || q.state !== flow.state) return googleFailed(reply, "expired");
    let profile: GoogleProfile;
    try {
      profile = await google.exchange({ code: q.code, codeVerifier: flow.verifier, redirectUri: googleRedirectUri() });
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : err }, "google sign-in failed");
      return googleFailed(reply, "failed");
    }
    if (!profile.emailVerified) return googleFailed(reply, "unverified");
    const token = newSessionToken();
    await ownerDb.transaction().execute(async (tx) => {
      const { person, isNew } = await personForGoogle(tx, profile);
      return openSession(tx, person, isNew, token);
    });
    setSessionCookie(reply, token);
    return reply.redirect(`${config.appUrl}/start`, 303);
  });

  // ---- Email (primary) ----

  /** Send a sign-in code. The same reply whether or not an account exists, so addresses cannot be probed. */
  app.post("/auth/email/request", async (req) => {
    const { email } = parse(EmailRequestSchema, req.body);
    const { code, ttlSeconds } = await issueCode({ email });
    await sendEmailCode(email, code, ttlSeconds, "signin");
    return { sent: true, expiresInSeconds: ttlSeconds };
  });

  app.post("/auth/email/verify", async (req, reply) => {
    const { email, code } = parse(EmailVerifySchema, req.body);
    const token = newSessionToken();
    const result = await ownerDb.transaction().execute(async (tx) => {
      await consumeCode(tx, { email }, code);
      const { person, isNew } = await personForEmail(tx, email);
      return openSession(tx, person, isNew, token);
    });
    return finishSignIn(reply, token, result);
  });

  // ---- Phone ----

  /**
   * Sign in with a phone number alone. Only while SMS codes are switched off
   * (no message service configured); see config.otp.provider.
   */
  app.post("/auth/phone", async (req, reply) => {
    if (getOtpSender() !== null) throw badRequest("OTP_REQUIRED", "Sign in with the code we send to your phone.");
    const { phone } = parse(OtpRequestSchema, req.body);
    const token = newSessionToken();
    const result = await ownerDb.transaction().execute(async (tx) => {
      const { person, isNew } = await personForPhone(tx, phone);
      return openSession(tx, person, isNew, token);
    });
    return finishSignIn(reply, token, result);
  });

  app.post("/auth/otp/request", async (req) => {
    const { phone } = parse(OtpRequestSchema, req.body);
    const sender = getOtpSender();
    if (!sender) throw badRequest("OTP_DISABLED", "Codes are switched off. Sign in with your phone number.");
    const { code, ttlSeconds } = await issueCode({ phone });
    await sender.send(phone, code);
    return { sent: true, expiresInSeconds: ttlSeconds };
  });

  app.post("/auth/otp/verify", async (req, reply) => {
    const { phone, code } = parse(OtpVerifySchema, req.body);
    const token = newSessionToken();
    const result = await ownerDb.transaction().execute(async (tx) => {
      await consumeCode(tx, { phone }, code);
      const { person, isNew } = await personForPhone(tx, phone);
      return openSession(tx, person, isNew, token);
    });
    return finishSignIn(reply, token, result);
  });

  app.post("/auth/logout", async (req, reply) => {
    const auth = requireAuth(req);
    await ownerDb.updateTable("session").set({ revoked_at: new Date() }).where("id", "=", auth.sessionId).execute();
    clearSessionCookie(reply);
    return { ok: true };
  });
}
