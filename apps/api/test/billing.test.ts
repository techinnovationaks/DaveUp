// Plans and Paystack payments, end to end through the HTTP API against the
// daveup_test database. Paystack itself is replaced by a recorder that plays
// its part (payment page, verify, card charges); everything else is real.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../src/config";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setOtpSender } from "../src/lib/otp-sender";
import { setEmailSender, type EmailMessage } from "../src/lib/email";
import { deliverPending } from "../src/lib/notify";
import { setPaystack, type Paystack, type PaystackTxn } from "../src/lib/paystack";
import { runBilling } from "../src/modules/billing";

let app: FastifyInstance;
const sentCodes = new Map<string, string>();
const emails: EmailMessage[] = [];
let phoneSeq = 500;

const SECRET = "sk_test_billing_suite";

// ---------- Paystack stand-in ----------
const txns = new Map<string, PaystackTxn>();
const initialized: Parameters<Paystack["initialize"]>[0][] = [];
const charges: Parameters<Paystack["chargeAuthorization"]>[0][] = [];
let declineCharges = false;

function txn(reference: string, amountKobo: number, status: string, channel = "card"): PaystackTxn {
  return {
    id: Math.floor(Math.random() * 1e9),
    status,
    reference,
    amountKobo,
    currency: "NGN",
    paidAt: status === "success" ? new Date().toISOString() : null,
    channel,
    gatewayResponse: status === "success" ? "Approved" : "Declined",
    customerCode: "CUS_test",
    authorization: channel === "card" ? { code: "AUTH_test", reusable: true, label: "Visa ending 4081" } : null,
  };
}

const paystack: Paystack = {
  initialize: async (p) => {
    initialized.push(p);
    return { authorizationUrl: `https://checkout.paystack.com/${p.reference}` };
  },
  verify: async (reference) => txns.get(reference) ?? null,
  chargeAuthorization: async (p) => {
    charges.push(p);
    const t = txn(p.reference, p.amountKobo, declineCharges ? "failed" : "success");
    txns.set(p.reference, t);
    return t;
  },
};

/** The person pays on Paystack's page. */
function payOnPaystack(reference: string, opts: { amountKobo?: number; channel?: string } = {}) {
  const init = initialized.find((i) => i.reference === reference)!;
  txns.set(reference, txn(reference, opts.amountKobo ?? init.amountKobo, "success", opts.channel));
}

// ---------- HTTP helpers ----------
type Res = { status: number; body: any };
type Person = { token: string; personId: string };

async function call(token: string | null, method: string, url: string, payload?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const res = await app.inject({ method: method as "GET", url, payload: payload as any, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  let body: any = null;
  try {
    body = res.body ? JSON.parse(res.body) : null;
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body };
}

async function signIn(name: string): Promise<Person> {
  const phone = `0806${String(++phoneSeq).padStart(7, "0")}`;
  await call(null, "POST", "/auth/otp/request", { phone });
  const v = await call(null, "POST", "/auth/otp/verify", { phone, code: sentCodes.get("+234" + phone.slice(1))! });
  expect(v.status).toBe(200);
  await call(v.body.token, "PATCH", "/me", { fullName: name });
  return { token: v.body.token, personId: v.body.personId };
}

async function church(name: string, memberNames: string[]) {
  const admin = await signIn(`${name} Admin`);
  // Billing emails go to administrators' verified email addresses.
  await ownerDb.updateTable("person").set({ email: `admin-${phoneSeq}@church.example`, email_verified_at: new Date() }).where("id", "=", admin.personId).execute();
  const c = await call(admin.token, "POST", "/churches", { name, city: "Uyo", participation: "both" });
  expect(c.status).toBe(201);
  const members: Person[] = [];
  for (const n of memberNames) {
    const p = await signIn(n);
    expect((await call(p.token, "POST", "/churches/join", { code: c.body.church.joinCode, participation: "grow" })).status).toBe(201);
    members.push(p);
  }
  for (const m of (await call(admin.token, "GET", "/admin/approvals")).body.members) {
    expect((await call(admin.token, "POST", `/admin/members/${m.membershipId}/approve`, {})).status).toBe(200);
  }
  return { admin, members, churchId: c.body.church.id as string };
}

async function deliveredTo(subjectPart: string): Promise<EmailMessage[]> {
  await deliverPending(100);
  return emails.filter((e) => e.subject.includes(subjectPart));
}

const setBilling = (churchId: string, values: Record<string, unknown>) => ownerDb.updateTable("church_billing").set(values as any).where("church_id", "=", churchId).execute();

beforeAll(async () => {
  await migrate({ reset: true });
  setOtpSender({ send: async (phone, code) => void sentCodes.set(phone, code) });
  setEmailSender({ send: async (m) => void emails.push(m) });
  (config.paystack as { secretKey: string }).secretKey = SECRET;
  setPaystack(paystack);
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  setPaystack(null);
  await app?.close();
  await closeDbs();
});

let grace: Awaited<ReturnType<typeof church>>;

/** Ask for discipler status and have the administrator approve it (uses a leader seat). */
async function makeLeader(p: Person) {
  await call(p.token, "POST", "/discipler-status/request");
  const reqs = (await call(grace.admin.token, "GET", "/admin/approvals")).body.disciplerRequests;
  const r = reqs.find((x: any) => x.personId === p.personId) ?? reqs[0];
  return call(grace.admin.token, "POST", `/admin/discipler-status/${r.id}/approve`, {});
}

const STD5 = { plan: "standard", interval: "month", seats: 5, memberPacks: 0 };

describe("Basic plan", () => {
  it("starts every organization free on Basic: 1 leader, 3 members, unlimited cells", async () => {
    grace = await church("Grace Billing", ["Ada Pay", "Ben Pay", "Cy Pay"]);
    const b = await call(grace.admin.token, "GET", "/billing");
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ plan: "basic", status: "free", seats: 1, memberPacks: 0, onlinePayments: true, limits: { disciplers: 1, disciples: 3, cells: null } });
    for (const n of [1, 2, 3, 4]) {
      expect((await call(grace.admin.token, "POST", "/cells", { name: `Cell ${n}` })).status).toBe(201);
    }
  });

  it("is only for administrators", async () => {
    expect((await call(grace.members[0]!.token, "GET", "/billing")).status).toBe(403);
    expect((await call(grace.members[0]!.token, "POST", "/billing/checkout", STD5)).status).toBe(403);
  });

  it("stops a second leader, with a clear reason", async () => {
    expect((await makeLeader(grace.members[0]!)).status).toBe(200);
    const r = await makeLeader(grace.members[1]!);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("PLAN_LIMIT");
    expect(r.body.error.message).toContain("Basic plan allows 1 leaders");
  });
});

describe("paying for Standard", () => {
  let reference: string;

  it("quotes per leader, with member packs, and yearly prices", async () => {
    const m = await call(grace.admin.token, "POST", "/billing/quote", STD5);
    expect(m.body).toMatchObject({ mode: "pay", amountKobo: 25_000_00 });
    const y = await call(grace.admin.token, "POST", "/billing/quote", { ...STD5, interval: "year", memberPacks: 1 });
    expect(y.body.amountKobo).toBe(250_000_00 + 18_000_00);
    expect((await call(grace.admin.token, "POST", "/billing/quote", { plan: "basic", interval: "month", seats: 1, memberPacks: 0 })).body.mode).toBe("none");
    expect((await call(grace.admin.token, "POST", "/billing/quote", { ...STD5, seats: 4 })).status).toBe(400);
  });

  it("needs a billing email for the receipt", async () => {
    await ownerDb.updateTable("person").set({ email: null, email_verified_at: null }).where("id", "=", grace.admin.personId).execute();
    const r = await call(grace.admin.token, "POST", "/billing/checkout", STD5);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("NO_BILLING_EMAIL");
    expect((await call(grace.admin.token, "PUT", "/billing/contact", { email: "Accounts@Grace.example" })).body.billingEmail).toBe("accounts@grace.example");
    await ownerDb.updateTable("person").set({ email: "admin@grace.example", email_verified_at: new Date() }).where("id", "=", grace.admin.personId).execute();
  });

  it("sends the administrator to Paystack with the right amount", async () => {
    const r = await call(grace.admin.token, "POST", "/billing/checkout", STD5);
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe("pay");
    reference = r.body.reference;
    expect(r.body.authorizationUrl).toBe(`https://checkout.paystack.com/${reference}`);
    const init = initialized.at(-1)!;
    expect(init).toMatchObject({ email: "accounts@grace.example", amountKobo: 25_000_00, reference });
    expect(init.callbackUrl).toMatch(/\/admin\/billing\/return$/);
    // Nothing changes until Paystack confirms.
    expect((await call(grace.admin.token, "GET", "/billing")).body.plan).toBe("basic");
  });

  it("does not activate a payment Paystack has not confirmed", async () => {
    const v = await call(grace.admin.token, "POST", "/billing/verify", { reference });
    expect(v.body.status).toBe("pending");
    expect((await call(grace.admin.token, "GET", "/billing")).body.plan).toBe("basic");
  });

  it("activates Standard once paid, and emails a receipt", async () => {
    payOnPaystack(reference);
    const v = await call(grace.admin.token, "POST", "/billing/verify", { reference });
    expect(v.body).toMatchObject({ status: "success", plan: "standard" });
    const b = (await call(grace.admin.token, "GET", "/billing")).body;
    expect(b).toMatchObject({ plan: "standard", seats: 5, status: "active", interval: "month", card: "Visa ending 4081", periodPriceKobo: 25_000_00, limits: { disciplers: 5, disciples: 60, cells: null } });
    expect(b.payments[0]).toMatchObject({ reference, status: "success", amountKobo: 25_000_00, seats: 5 });
    expect((await makeLeader(grace.members[1]!)).status).toBe(200);
    const receipts = await deliveredTo("Receipt: ₦25,000");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.text).toContain(reference);
  });

  it("applies a payment once, however often it is confirmed", async () => {
    expect((await call(grace.admin.token, "POST", "/billing/verify", { reference })).body.status).toBe("success");
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference } }));
    const sig = createHmac("sha512", SECRET).update(body).digest("hex");
    const w = await call(null, "POST", "/billing/paystack/webhook", body, { "content-type": "application/json", "x-paystack-signature": sig });
    expect(w.status).toBe(200);
    expect(await deliveredTo("Receipt: ₦25,000")).toHaveLength(1);
    const paid = await ownerDb.selectFrom("billing_payment").select("id").where("church_id", "=", grace.churchId).where("status", "=", "success").execute();
    expect(paid).toHaveLength(1);
  });

  it("rejects webhooks without Paystack's signature", async () => {
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference } }));
    const w = await call(null, "POST", "/billing/paystack/webhook", body, { "content-type": "application/json", "x-paystack-signature": "00".repeat(64) });
    expect(w.status).toBe(401);
  });

  it("will not see another organization's payment", async () => {
    const other = await church("Other Billing", []);
    expect((await call(other.admin.token, "POST", "/billing/verify", { reference })).status).toBe(404);
  });
});

describe("changing plan", () => {
  it("charges only the difference when adding leaders mid-period", async () => {
    const q = (await call(grace.admin.token, "POST", "/billing/quote", { ...STD5, seats: 8 })).body;
    expect(q.mode).toBe("pay");
    expect(q.periodPriceKobo).toBe(40_000_00);
    expect(q.creditKobo).toBeGreaterThan(20_000_00);
    expect(q.amountKobo).toBe(40_000_00 - q.creditKobo);
  });

  it("schedules a smaller plan for the end of the paid period, and can undo it", async () => {
    const r = await call(grace.admin.token, "POST", "/billing/checkout", { plan: "basic", interval: "month", seats: 1, memberPacks: 0 });
    expect(r.body.mode).toBe("schedule");
    let b = (await call(grace.admin.token, "GET", "/billing")).body;
    expect(b).toMatchObject({ status: "canceling", plan: "standard" });
    b = (await call(grace.admin.token, "POST", "/billing/resume")).body;
    expect(b.status).toBe("active");
  });

  it("refuses a payment for the wrong amount", async () => {
    const r = await call(grace.admin.token, "POST", "/billing/checkout", { ...STD5, memberPacks: 2 });
    payOnPaystack(r.body.reference, { amountKobo: 100_00 });
    expect((await call(grace.admin.token, "POST", "/billing/verify", { reference: r.body.reference })).body.status).toBe("failed");
    expect((await call(grace.admin.token, "GET", "/billing")).body.memberPacks).toBe(0);
  });
});

describe("renewals, grace and Basic", () => {
  it("charges the saved card when the period ends", async () => {
    await setBilling(grace.churchId, { period_end: new Date(Date.now() - 60_000) });
    await runBilling();
    expect(charges.at(-1)).toMatchObject({ authorizationCode: "AUTH_test", email: "accounts@grace.example", amountKobo: 25_000_00 });
    const b = (await call(grace.admin.token, "GET", "/billing")).body;
    expect(b.status).toBe("active");
    expect(new Date(b.periodEnd).getTime()).toBeGreaterThan(Date.now() + 20 * 86_400_000);
    expect(b.payments[0]).toMatchObject({ kind: "renewal", status: "success" });
  });

  it("renews with a scheduled smaller number of leaders", async () => {
    // Seven leaders now, five from the next period.
    const up = await call(grace.admin.token, "POST", "/billing/checkout", { ...STD5, seats: 7 });
    payOnPaystack(up.body.reference);
    await call(grace.admin.token, "POST", "/billing/verify", { reference: up.body.reference });
    expect((await call(grace.admin.token, "POST", "/billing/checkout", STD5)).body.mode).toBe("schedule");
    expect((await call(grace.admin.token, "GET", "/billing")).body.nextChange).toMatchObject({ plan: "standard", seats: 5 });
    await setBilling(grace.churchId, { period_end: new Date(Date.now() - 60_000), last_attempt_at: null });
    await runBilling();
    expect(charges.at(-1)!.amountKobo).toBe(25_000_00);
    expect((await call(grace.admin.token, "GET", "/billing")).body).toMatchObject({ seats: 5, nextChange: null });
  });

  it("gives 14 days of grace when the card is declined", async () => {
    declineCharges = true;
    await setBilling(grace.churchId, { period_end: new Date(Date.now() - 60_000), last_attempt_at: null });
    await runBilling();
    const b = (await call(grace.admin.token, "GET", "/billing")).body;
    expect(b.status).toBe("grace");
    expect(b.plan).toBe("standard");
    const days = (new Date(b.graceUntil).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThanOrEqual(14);
    expect(await deliveredTo("Payment failed")).toHaveLength(1);
    // Retried once a day, not on every run.
    const before = charges.length;
    await runBilling();
    expect(charges.length).toBe(before);
  });

  it("returns the organization to Basic after grace, keeping everyone it has", async () => {
    await setBilling(grace.churchId, { grace_until: new Date(Date.now() - 60_000) });
    await runBilling();
    const b = (await call(grace.admin.token, "GET", "/billing")).body;
    expect(b).toMatchObject({ status: "free", plan: "basic", limits: { disciplers: 1 } });
    expect(b.usage.disciplers).toBe(2);
    expect((await makeLeader(grace.members[2]!)).status).toBe(409);
    expect(await deliveredTo("is now on DaveUp Basic")).toHaveLength(1);
  });

  it("reminds organizations without a saved card before the period ends", async () => {
    declineCharges = false;
    const r = await call(grace.admin.token, "POST", "/billing/checkout", STD5);
    payOnPaystack(r.body.reference, { channel: "bank_transfer" });
    expect((await call(grace.admin.token, "POST", "/billing/verify", { reference: r.body.reference })).body.status).toBe("success");
    await call(grace.admin.token, "POST", "/billing/remove-card");
    await setBilling(grace.churchId, { period_end: new Date(Date.now() + 2 * 86_400_000) });
    await runBilling();
    await runBilling();
    expect(await deliveredTo("renews on")).toHaveLength(1);
  });
});

describe("DaveUp staff", () => {
  it("can grant a plan until a date, and it ends by itself", async () => {
    const staff = await signIn("Staff Person");
    await ownerDb.updateTable("person").set({ is_super_admin: true }).where("id", "=", staff.personId).execute();
    expect((await call(grace.admin.token, "POST", `/staff/churches/${grace.churchId}/plan`, { plan: "campus" })).status).toBe(403);
    const until = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const r = await call(staff.token, "POST", `/staff/churches/${grace.churchId}/plan`, { plan: "campus", seats: 10, memberPacks: 2, until, note: "Pilot" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "granted", plan: "campus", grantedNote: "Pilot", limits: { disciplers: 10, disciples: 144 } });
    const net = await call(staff.token, "POST", `/staff/churches/${grace.churchId}/plan`, { plan: "network", seats: 0 });
    expect(net.body.limits).toEqual({ disciplers: null, disciples: null, cells: null });
    await call(staff.token, "POST", `/staff/churches/${grace.churchId}/plan`, { plan: "campus", seats: 10, until });
    await setBilling(grace.churchId, { granted_until: new Date(Date.now() - 1000) });
    await runBilling();
    expect((await call(grace.admin.token, "GET", "/billing")).body).toMatchObject({ status: "free", plan: "basic" });
  });

  it("receives Campus and Network enquiries by email", async () => {
    const staffEmail = "staff@daveup.example";
    const s = await ownerDb.selectFrom("person").select("id").where("is_super_admin", "=", true).executeTakeFirstOrThrow();
    await ownerDb.updateTable("person").set({ email: staffEmail, email_verified_at: new Date() }).where("id", "=", s.id).execute();
    const r = await call(grace.admin.token, "POST", "/billing/enquiry", { plan: "network", message: "We are a network of 14 churches in Akwa Ibom." });
    expect(r.status).toBe(200);
    const mail = (await deliveredTo("Network enquiry")).find((m) => m.to === staffEmail);
    expect(mail?.text).toContain("14 churches in Akwa Ibom");
    expect((await call(grace.admin.token, "POST", "/billing/enquiry", { plan: "campus", message: "Second message straight away" })).status).toBe(429);
  });
});
