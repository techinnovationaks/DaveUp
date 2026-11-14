// One-time codes for sign-in (phone or email) and for confirming a new email.
// Codes are stored only as an HMAC, expire, allow a few attempts, and are
// rate-limited per destination.
import { EMAIL_OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@daveup/shared";
import { ownerDb, type Tx } from "../db/pool";
import { hmac, newOtpCode, safeEqualHex } from "./crypto";
import { badRequest, tooMany } from "./errors";

const REQUESTS_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

export type Destination = { phone: string } | { email: string };
export type Purpose = "signin" | "change_email";

const key = (d: Destination, code: string) => ("phone" in d ? `${d.phone}:${code}` : `email:${d.email}:${code}`);

function forDestination<Q extends { where: (...a: any[]) => Q }>(q: Q, d: Destination): Q {
  return "phone" in d ? q.where("phone", "=", d.phone) : q.where("email", "=", d.email);
}

/** Create a code for a destination and return it so the caller can send it. */
export async function issueCode(d: Destination, purpose: Purpose = "signin", personId: string | null = null): Promise<{ code: string; ttlSeconds: number }> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const { count } = await forDestination(ownerDb.selectFrom("otp_challenge").select((eb) => eb.fn.countAll<string>().as("count")), d)
    .where("created_at", ">", since)
    .executeTakeFirstOrThrow();
  if (Number(count) >= REQUESTS_PER_WINDOW) throw tooMany(`Too many codes requested. Try again in ${WINDOW_MINUTES} minutes.`);

  const code = newOtpCode();
  const ttlSeconds = "email" in d ? EMAIL_OTP_TTL_SECONDS : OTP_TTL_SECONDS;
  await ownerDb
    .insertInto("otp_challenge")
    .values({
      phone: "phone" in d ? d.phone : null,
      email: "email" in d ? d.email : null,
      purpose,
      person_id: personId,
      code_hash: hmac(key(d, code)),
      expires_at: new Date(Date.now() + ttlSeconds * 1000),
    })
    .execute();
  return { code, ttlSeconds };
}

/**
 * Check a code and consume it inside `tx`, so the sign-in or email change and
 * the code's use commit together. Wrong codes count against the attempt limit.
 */
export async function consumeCode(tx: Tx, d: Destination, code: string, purpose: Purpose = "signin", personId: string | null = null): Promise<void> {
  let q = forDestination(ownerDb.selectFrom("otp_challenge").selectAll(), d)
    .where("purpose", "=", purpose)
    .where("consumed_at", "is", null)
    .where("expires_at", ">", new Date());
  if (personId) q = q.where("person_id", "=", personId);
  const challenge = await q.orderBy("created_at", "desc").limit(1).executeTakeFirst();
  if (!challenge) throw badRequest("OTP_EXPIRED", "That code has expired. Request a new one.");
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw tooMany("Too many wrong attempts. Request a new code.");

  if (!safeEqualHex(challenge.code_hash, hmac(key(d, code)))) {
    // Outside the transaction, so the failed attempt is counted even though the request fails.
    await ownerDb.updateTable("otp_challenge").set((eb) => ({ attempts: eb("attempts", "+", 1) })).where("id", "=", challenge.id).execute();
    throw badRequest("OTP_WRONG", "That code is not right. Check the message and try again.");
  }
  const consumed = await tx.updateTable("otp_challenge").set({ consumed_at: new Date() }).where("id", "=", challenge.id).where("consumed_at", "is", null).executeTakeFirst();
  if (Number(consumed.numUpdatedRows) !== 1) throw badRequest("OTP_EXPIRED", "That code was already used.");
}
