import type { FastifyInstance, FastifyReply } from "fastify";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, OtpRequestSchema, OtpVerifySchema } from "@daveup/shared";
import { config } from "../config";
import { ownerDb, type Tx } from "../db/pool";
import { hmac, newOtpCode, newSessionToken, safeEqualHex } from "../lib/crypto";
import { badRequest, parse, tooMany } from "../lib/errors";
import { getOtpSender } from "../lib/otp-sender";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../lib/context";

const REQUESTS_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

/** Find or create the person for a verified phone number and open a session. */
async function startSession(tx: Tx, phone: string, token: string) {
  let person = await tx.selectFrom("person").select(["id", "full_name"]).where("phone", "=", phone).executeTakeFirst();
  const isNew = !person;
  if (!person) {
    person = await tx.insertInto("person").values({ phone }).returning(["id", "full_name"]).executeTakeFirstOrThrow();
  }
  await tx
    .insertInto("session")
    .values({ person_id: person.id, token_hash: hmac(token), expires_at: new Date(Date.now() + config.sessionDays * 86_400_000) })
    .execute();
  return { personId: person.id, isNew, needsProfile: !person.full_name };
}

function finishSignIn(reply: FastifyReply, token: string, result: Awaited<ReturnType<typeof startSession>>) {
  setSessionCookie(reply, token);
  // The token is also returned for the mobile app, which stores it in secure storage.
  return { ...result, token };
}

export async function authRoutes(app: FastifyInstance) {
  /** Tells the apps whether sign-in needs a code. */
  app.get("/auth/methods", async () => ({ otp: getOtpSender() !== null }));

  /**
   * Sign in with a phone number alone. Only available while codes are switched
   * off (no message service configured); see config.otp.provider.
   */
  app.post("/auth/phone", async (req, reply) => {
    if (getOtpSender() !== null) throw badRequest("OTP_REQUIRED", "Sign in with the code we send to your phone.");
    const { phone } = parse(OtpRequestSchema, req.body);
    const token = newSessionToken();
    const result = await ownerDb.transaction().execute((tx) => startSession(tx, phone, token));
    return finishSignIn(reply, token, result);
  });

  app.post("/auth/otp/request", async (req) => {
    const { phone } = parse(OtpRequestSchema, req.body);
    const sender = getOtpSender();
    if (!sender) throw badRequest("OTP_DISABLED", "Codes are switched off. Sign in with your phone number.");

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    const { count } = await ownerDb
      .selectFrom("otp_challenge")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("phone", "=", phone)
      .where("created_at", ">", since)
      .executeTakeFirstOrThrow();
    if (Number(count) >= REQUESTS_PER_WINDOW) {
      throw tooMany(`Too many codes requested. Try again in ${WINDOW_MINUTES} minutes.`);
    }

    const code = newOtpCode();
    await ownerDb
      .insertInto("otp_challenge")
      .values({ phone, code_hash: hmac(`${phone}:${code}`), expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
      .execute();
    await sender.send(phone, code);
    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS };
  });

  app.post("/auth/otp/verify", async (req, reply) => {
    const { phone, code } = parse(OtpVerifySchema, req.body);

    const challenge = await ownerDb
      .selectFrom("otp_challenge")
      .selectAll()
      .where("phone", "=", phone)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!challenge) throw badRequest("OTP_EXPIRED", "That code has expired. Request a new one.");
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw tooMany("Too many wrong attempts. Request a new code.");

    if (!safeEqualHex(challenge.code_hash, hmac(`${phone}:${code}`))) {
      await ownerDb.updateTable("otp_challenge").set((eb) => ({ attempts: eb("attempts", "+", 1) })).where("id", "=", challenge.id).execute();
      throw badRequest("OTP_WRONG", "That code is not right. Check the message and try again.");
    }

    const token = newSessionToken();
    const result = await ownerDb.transaction().execute(async (tx) => {
      const consumed = await tx
        .updateTable("otp_challenge")
        .set({ consumed_at: new Date() })
        .where("id", "=", challenge.id)
        .where("consumed_at", "is", null)
        .executeTakeFirst();
      if (Number(consumed.numUpdatedRows) !== 1) throw badRequest("OTP_EXPIRED", "That code was already used.");

      return startSession(tx, phone, token);
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
