import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config";

export function hmac(value: string): string {
  return createHmac("sha256", config.authSecret).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function newOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// No 0/O/1/I/L to avoid misreading codes said aloud or printed on a bulletin.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newJoinCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
}
