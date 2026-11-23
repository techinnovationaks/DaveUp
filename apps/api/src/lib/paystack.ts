// Paystack: the payment page, verifying a payment, charging a saved card for
// renewals, and checking webhook signatures. https://paystack.com/docs/api
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

export interface PaystackTxn {
  id: number | null;
  /** success, failed, abandoned, or a waiting state (ongoing, pending, processing, queued). */
  status: string;
  reference: string;
  amountKobo: number;
  currency: string;
  paidAt: string | null;
  channel: string | null;
  gatewayResponse: string | null;
  customerCode: string | null;
  authorization: { code: string; reusable: boolean; label: string } | null;
}

export interface Paystack {
  initialize(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ authorizationUrl: string }>;
  /** null when Paystack has no transaction with that reference (the person never reached the payment page). */
  verify(reference: string): Promise<PaystackTxn | null>;
  chargeAuthorization(p: { authorizationCode: string; email: string; amountKobo: number; reference: string; metadata: Record<string, unknown> }): Promise<PaystackTxn>;
}

export class PaystackError extends Error {}

function toTxn(d: any): PaystackTxn {
  const a = d?.authorization;
  const label = a
    ? a.channel === "card" || a.last4
      ? `${String(a.brand || a.card_type || "Card").trim().replace(/^\w/, (c: string) => c.toUpperCase())} ending ${a.last4}`
      : String(a.bank || a.channel || "Saved account")
    : "";
  return {
    id: typeof d?.id === "number" ? d.id : null,
    status: String(d?.status ?? "unknown"),
    reference: String(d?.reference ?? ""),
    amountKobo: Number(d?.amount ?? 0),
    currency: String(d?.currency ?? ""),
    paidAt: d?.paid_at ?? d?.paidAt ?? null,
    channel: d?.channel ?? null,
    gatewayResponse: d?.gateway_response ?? null,
    customerCode: d?.customer?.customer_code ?? null,
    authorization: a?.authorization_code ? { code: a.authorization_code, reusable: a.reusable === true, label } : null,
  };
}

class PaystackApi implements Paystack {
  constructor(
    private secretKey: string,
    private baseUrl: string,
  ) {}

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.secretKey}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && json?.status === true, status: res.status, json };
  }

  async initialize(p: Parameters<Paystack["initialize"]>[0]) {
    const r = await this.request("POST", "/transaction/initialize", {
      email: p.email,
      amount: p.amountKobo,
      currency: "NGN",
      reference: p.reference,
      callback_url: p.callbackUrl,
      metadata: p.metadata,
    });
    if (!r.ok || !r.json?.data?.authorization_url) throw new PaystackError(r.json?.message || `Paystack could not start the payment (HTTP ${r.status})`);
    return { authorizationUrl: String(r.json.data.authorization_url) };
  }

  async verify(reference: string) {
    const r = await this.request("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    if (r.ok) return toTxn(r.json.data);
    if (r.status === 400 || r.status === 404) return null;
    throw new PaystackError(r.json?.message || `Paystack could not check the payment (HTTP ${r.status})`);
  }

  async chargeAuthorization(p: Parameters<Paystack["chargeAuthorization"]>[0]) {
    const r = await this.request("POST", "/transaction/charge_authorization", {
      authorization_code: p.authorizationCode,
      email: p.email,
      amount: p.amountKobo,
      currency: "NGN",
      reference: p.reference,
      metadata: p.metadata,
    });
    // A declined card still comes back as a transaction with status "failed".
    if (r.json?.data?.reference) return toTxn(r.json.data);
    throw new PaystackError(r.json?.message || `Paystack could not charge the card (HTTP ${r.status})`);
  }
}

let client: Paystack | null = config.paystack.secretKey ? new PaystackApi(config.paystack.secretKey, config.paystack.baseUrl) : null;

/** Null when online payment is not set up (no secret key). */
export function getPaystack(): Paystack | null {
  return client;
}

/** Tests replace Paystack with a recorder. */
export function setPaystack(p: Paystack | null): void {
  client = p;
}

/** Paystack signs each webhook body with HMAC-SHA512 of the secret key. */
export function validWebhookSignature(rawBody: Buffer, signature: string | undefined, secretKey = config.paystack.secretKey): boolean {
  if (!secretKey || !signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
