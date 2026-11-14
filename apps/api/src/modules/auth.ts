// Sign-in. Email is the primary method: a 6-digit code sent by email signs
// you up the first time and in every time after. Phone sign-in remains as an
// alternative (with SMS codes once a provider is configured).
import type { FastifyInstance, FastifyReply } from "fastify";
import { EmailRequestSchema, EmailVerifySchema, OtpRequestSchema, OtpVerifySchema, type AuthMethodsDto } from "@daveup/shared";
import { config } from "../config";
import { ownerDb, type Tx } from "../db/pool";
import { consumeCode, issueCode } from "../lib/codes";
import { hmac, newSessionToken } from "../lib/crypto";
import { badRequest, parse } from "../lib/errors";
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

function finishSignIn(reply: FastifyReply, token: string, result: Awaited<ReturnType<typeof openSession>>) {
  setSessionCookie(reply, token);
  // The token is also returned for the mobile app, which stores it in secure storage.
  return { ...result, token };
}

export async function sendEmailCode(email: string, code: string, ttlSeconds: number, purpose: "signin" | "change_email") {
  const minutes = Math.round(ttlSeconds / 60);
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
  app.get("/auth/methods", async (): Promise<AuthMethodsDto> => ({ email: true, phone: true, phoneOtp: getOtpSender() !== null }));

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
