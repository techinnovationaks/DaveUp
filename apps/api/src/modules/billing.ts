// Church plans and payments through Paystack (PRD 17.3 to 17.9; screens 63,
// 64, 70, 71, 72 and 164).
//
// How money moves:
// - Checkout: the administrator picks a plan, we record a pending payment and
//   send them to Paystack's payment page (card, bank transfer, USSD...).
// - A payment is confirmed in two independent ways, whichever comes first:
//   the administrator returning from Paystack (/billing/verify) and Paystack's
//   webhook. Both ask Paystack for the transaction and check the amount, so a
//   payment is applied exactly once and only for the amount we asked.
// - Renewals: a background job charges the saved card when a period ends.
//   Churches that paid another way are emailed to pay. A failed or unpaid
//   renewal gives 14 days of grace, then the church returns to Basic. Nothing
//   is deleted and nobody loses access; limits only stop new additions.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely, Selectable } from "kysely";
import {
  BillingContactSchema,
  BillingSelectionSchema,
  BillingVerifySchema,
  FOUNDING_LOCK_MONTHS,
  GRACE_DAYS,
  PLAN_NAME,
  PlanEnquirySchema,
  StaffPlanSchema,
  addInterval,
  changeStartsNow,
  isSelfServe,
  limitsFor,
  naira,
  periodPrice,
  unusedCredit,
  type BillingCheckoutDto,
  type BillingDto,
  type BillingInterval,
  type BillingPaymentDto,
  type BillingQuoteDto,
  type BillingSelection,
  type BillingVerifyDto,
  type ChurchPlan,
} from "@daveup/shared";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import type { ChurchBillingTable, DB } from "../db/types";
import { audit } from "../lib/audit";
import { requireAdmin, requireSuperAdmin } from "../lib/context";
import { AppError, badRequest, conflict, notFound, parse, tooMany } from "../lib/errors";
import { churchUsage } from "../lib/limits";
import { notify } from "../lib/notify";
import { getPaystack, PaystackError, validWebhookSignature, type PaystackTxn } from "../lib/paystack";
import { z } from "zod";

type Billing = Selectable<ChurchBillingTable>;
type Db = Kysely<DB>;

const DAY = 86_400_000;
/** Wait this long between charge attempts on one church. */
const RETRY_GAP_MS = 20 * 3_600_000;
const REMIND_DAYS_BEFORE = 3;

// ---------- Reading and writing the billing row ----------

/** The church's billing row, created on first use. Locks it when `lock` is set (inside a transaction). */
async function billingRow(db: Db, churchId: string, lock = false): Promise<Billing> {
  await db.insertInto("church_billing").values({ church_id: churchId }).onConflict((oc) => oc.column("church_id").doNothing()).execute();
  let q = db.selectFrom("church_billing").selectAll().where("church_id", "=", churchId);
  if (lock) q = q.forUpdate();
  return q.executeTakeFirstOrThrow();
}

/** What the church is entitled to under this billing row. */
function entitlement(b: Pick<Billing, "status" | "plan" | "extra_blocks">): { plan: ChurchPlan; extraBlocks: number } {
  return b.status === "free" ? { plan: "basic", extraBlocks: 0 } : { plan: b.plan, extraBlocks: b.extra_blocks };
}

/** Keep church.plan and church.extra_blocks (read by the limit checks) in step with billing. */
async function syncChurch(db: Db, churchId: string): Promise<void> {
  const b = await db.selectFrom("church_billing").select(["status", "plan", "extra_blocks"]).where("church_id", "=", churchId).executeTakeFirstOrThrow();
  const e = entitlement(b);
  await db.updateTable("church").set({ plan: e.plan, extra_blocks: e.extraBlocks }).where("id", "=", churchId).execute();
}

const FREE = {
  status: "free" as const,
  plan: "basic" as const,
  extra_blocks: 0,
  interval: null,
  period_start: null,
  period_end: null,
  period_price_kobo: 0,
  grace_until: null,
  granted_until: null,
  granted_note: null,
  next_plan: null,
  next_blocks: null,
  next_interval: null,
  last_attempt_at: null,
};

/** Founding Standard price for a period starting at `at`. */
function foundingAt(b: Pick<Billing, "founding_until">, at: Date): boolean {
  return b.founding_until ? at < b.founding_until : config.foundingPriceOpen;
}

async function adminIds(db: Db, churchId: string): Promise<string[]> {
  const rows = await db.selectFrom("membership").select("person_id").where("church_id", "=", churchId).where("is_admin", "=", true).where("status", "=", "approved").execute();
  return rows.map((r) => r.person_id);
}

/** Where receipts and renewal emails go to Paystack: the billing contact, else an administrator's email. */
async function payerEmail(db: Db, b: Billing, fallbackPersonId?: string): Promise<string | null> {
  if (b.billing_email) return b.billing_email;
  const ids = fallbackPersonId ? [fallbackPersonId, ...(await adminIds(db, b.church_id))] : await adminIds(db, b.church_id);
  if (ids.length === 0) return null;
  const people = await db.selectFrom("person").select(["id", "email"]).where("id", "in", ids).where("email", "is not", null).execute();
  for (const id of ids) {
    const p = people.find((x) => x.id === id);
    if (p?.email) return p.email;
  }
  return null;
}

const newReference = () => `dvp_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

function paymentDto(p: Selectable<DB["billing_payment"]>): BillingPaymentDto {
  return {
    id: p.id,
    reference: p.reference,
    kind: p.kind,
    plan: p.plan,
    interval: p.interval,
    extraBlocks: p.extra_blocks,
    amountKobo: p.amount_kobo,
    status: p.status,
    channel: p.channel,
    paidAt: p.paid_at?.toISOString() ?? null,
    createdAt: p.created_at.toISOString(),
    periodStart: p.period_start?.toISOString() ?? null,
    periodEnd: p.period_end?.toISOString() ?? null,
    failure: p.failure,
  };
}

/** Is the church in a paid period right now (so an upgrade is credited)? */
const inPaidPeriod = (b: Billing, now: Date) => (b.status === "active" || b.status === "canceling") && !!b.period_start && !!b.period_end && b.period_end > now;

// ---------- Quotes ----------

interface Quote extends BillingQuoteDto {
  periodStartsAt: Date;
}

export function quoteFor(b: Billing, sel: BillingSelection, now: Date): Quote {
  const founding = sel.plan === "standard" && foundingAt(b, now);
  const price = periodPrice({ ...sel, founding });
  const none: Quote = { mode: "none", amountKobo: 0, creditKobo: 0, periodPriceKobo: price, founding, effectiveAt: null, periodEnd: null, periodStartsAt: now };

  if (inPaidPeriod(b, now)) {
    const from = { plan: b.plan, extraBlocks: b.extra_blocks, interval: b.interval };
    const same = from.plan === sel.plan && from.extraBlocks === sel.extraBlocks && from.interval === sel.interval;
    if (same) return none;
    if (changeStartsNow(from, sel)) {
      const credit = unusedCredit(b.period_price_kobo, b.period_start!, b.period_end!, now);
      const amount = Math.max(price - credit, 0);
      return { mode: "pay", amountKobo: amount, creditKobo: Math.min(credit, price), periodPriceKobo: price, founding, effectiveAt: now.toISOString(), periodEnd: addInterval(now, sel.interval).toISOString(), periodStartsAt: now };
    }
    return { ...none, mode: "schedule", effectiveAt: b.period_end!.toISOString() };
  }

  // Free, granted, in grace, or the paid period has run out: a new period starts when paid.
  if (price === 0) return none;
  return { mode: "pay", amountKobo: price, creditKobo: 0, periodPriceKobo: price, founding, effectiveAt: now.toISOString(), periodEnd: addInterval(now, sel.interval).toISOString(), periodStartsAt: now };
}

// ---------- Applying a payment ----------

/**
 * Apply a Paystack transaction to its payment. Idempotent: safe to call from
 * the return page, the webhook and the background check for the same payment.
 */
export async function settlePayment(reference: string, txn: PaystackTxn): Promise<BillingVerifyDto["status"] | "unknown"> {
  return ownerDb.transaction().execute(async (tx) => {
    const p = await tx.selectFrom("billing_payment").selectAll().where("reference", "=", reference).forUpdate().executeTakeFirst();
    if (!p) return "unknown";
    if (p.status === "success") return "success";

    if (txn.status === "success") {
      if (txn.amountKobo !== p.amount_kobo || txn.currency.toUpperCase() !== "NGN") {
        await tx.updateTable("billing_payment").set({ status: "failed", failure: `Paid ${txn.currency} ${txn.amountKobo / 100}, expected NGN ${p.amount_kobo / 100}` }).where("id", "=", p.id).execute();
        console.error(`[billing] amount mismatch on ${reference}: got ${txn.currency} ${txn.amountKobo}, expected ${p.amount_kobo}`);
        return "failed";
      }
      const paidAt = txn.paidAt ? new Date(txn.paidAt) : new Date();
      const b = await billingRow(tx, p.church_id, true);
      const start = p.period_start ?? paidAt;
      const end = addInterval(start, p.interval);
      const auth = txn.authorization?.reusable ? { auth_code: txn.authorization.code, auth_label: txn.authorization.label } : {};
      await tx
        .updateTable("church_billing")
        .set({
          ...FREE,
          status: "active",
          plan: p.plan,
          extra_blocks: p.extra_blocks,
          interval: p.interval,
          period_start: start,
          period_end: end,
          period_price_kobo: p.period_price_kobo,
          reminded_at: null,
          founding_until: p.plan === "standard" && p.founding && !b.founding_until ? addInterval(paidAt, "month", FOUNDING_LOCK_MONTHS) : b.founding_until,
          paystack_customer: txn.customerCode ?? b.paystack_customer,
          ...auth,
          updated_at: new Date(),
        })
        .where("church_id", "=", p.church_id)
        .execute();
      await tx
        .updateTable("billing_payment")
        .set({ status: "success", paid_at: paidAt, channel: txn.channel, paystack_id: txn.id, period_start: start, period_end: end, failure: null })
        .where("id", "=", p.id)
        .execute();
      await syncChurch(tx, p.church_id);
      await audit(tx, {
        churchId: p.church_id,
        actorId: p.created_by,
        action: "billing.paid",
        targetType: "payment",
        targetId: p.id,
        data: { plan: p.plan, interval: p.interval, extraBlocks: p.extra_blocks, amountKobo: p.amount_kobo, kind: p.kind, channel: txn.channel },
      });
      const church = await tx.selectFrom("church").select("name").where("id", "=", p.church_id).executeTakeFirstOrThrow();
      await notify(tx, p.church_id, await adminIds(tx, p.church_id), "billing.paid", {
        churchName: church.name,
        planName: planLabel(p.plan, p.extra_blocks),
        amount: naira(p.amount_kobo),
        interval: p.interval,
        periodEnd: end.toISOString(),
        reference: p.reference,
        renewal: p.kind === "renewal",
      });
      return "success";
    }

    if (["failed", "abandoned", "reversed"].includes(txn.status)) {
      await tx
        .updateTable("billing_payment")
        .set({ status: txn.status === "abandoned" ? "abandoned" : "failed", failure: txn.gatewayResponse ?? txn.status, channel: txn.channel })
        .where("id", "=", p.id)
        .where("status", "=", "pending")
        .execute();
      return txn.status === "abandoned" ? "abandoned" : "failed";
    }
    return "pending";
  });
}

function planLabel(plan: ChurchPlan, blocks: number): string {
  return blocks > 0 ? `${PLAN_NAME[plan]} with ${blocks} extra capacity block${blocks === 1 ? "" : "s"}` : PLAN_NAME[plan];
}

// ---------- The background job: renewals, grace and expiry ----------

/** Run every few minutes. Safe on several servers at once: each church is claimed with SKIP LOCKED. */
export async function runBilling(now = new Date()): Promise<void> {
  await checkPendingPayments(now);
  await renewDue(now);
  await expire(now);
  await remind(now);
}

/** Payments whose result never reached us (closed tab, missed webhook): ask Paystack. */
async function checkPendingPayments(now: Date): Promise<void> {
  const ps = getPaystack();
  const stale = await ownerDb
    .selectFrom("billing_payment")
    .select(["reference", "created_at"])
    .where("status", "=", "pending")
    .where("created_at", "<", new Date(now.getTime() - 5 * 60_000))
    .orderBy("created_at")
    .limit(50)
    .execute();
  for (const p of stale) {
    const tooOld = p.created_at < new Date(now.getTime() - 2 * DAY);
    try {
      const txn = ps ? await ps.verify(p.reference) : null;
      if (txn) {
        const r = await settlePayment(p.reference, txn);
        if (r !== "pending" || !tooOld) continue;
      } else if (!tooOld && ps) continue;
      await ownerDb.updateTable("billing_payment").set({ status: "abandoned", failure: "Not completed" }).where("reference", "=", p.reference).where("status", "=", "pending").execute();
    } catch (err) {
      console.error("[billing] could not check payment", p.reference, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Claim one church for a charge attempt: due renewals (active, period over)
 * and retries during grace. Returns the payment to charge, or null.
 */
async function claimCharge(now: Date): Promise<{ b: Billing; reference: string; amountKobo: number; email: string } | "again" | null> {
  return ownerDb.transaction().execute(async (tx) => {
    const b = await tx
      .selectFrom("church_billing")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([eb("status", "=", "active"), eb("period_end", "<=", now)]),
          eb.and([eb("status", "=", "grace"), eb("grace_until", ">", now), eb("auth_code", "is not", null)]),
        ]),
      )
      .where((eb) => eb.or([eb("last_attempt_at", "is", null), eb("last_attempt_at", "<", new Date(now.getTime() - RETRY_GAP_MS))]))
      .orderBy("period_end")
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!b) return null;
    await tx.updateTable("church_billing").set({ last_attempt_at: now }).where("church_id", "=", b.church_id).execute();

    const target = { plan: (b.next_plan ?? b.plan) as ChurchPlan, extraBlocks: b.next_blocks ?? b.extra_blocks, interval: (b.next_interval ?? b.interval ?? "month") as BillingInterval };
    const renewingOnTime = b.status === "active";
    const startsAt = renewingOnTime ? b.period_end! : now;
    if (!isSelfServe(target.plan)) {
      // Pro and Network are agreed with staff and should be granted, not renewed online.
      await toGrace(tx, b, now, "billing.renew_due");
      return "again";
    }
    const founding = target.plan === "standard" && foundingAt(b, startsAt);
    const price = periodPrice({ plan: target.plan, interval: target.interval, extraBlocks: target.extraBlocks, founding });
    if (price === 0) {
      // The church chose Basic (free) for the next period.
      await tx.updateTable("church_billing").set({ ...FREE, updated_at: now }).where("church_id", "=", b.church_id).execute();
      await syncChurch(tx, b.church_id);
      await audit(tx, { churchId: b.church_id, actorId: null, action: "billing.ended", targetType: "church", targetId: b.church_id, data: { reason: "moved to Basic" } });
      return "again";
    }
    const email = await payerEmail(tx, b);
    if (!b.auth_code || !email) {
      if (renewingOnTime) await toGrace(tx, b, now, "billing.renew_due");
      return "again";
    }
    const reference = newReference();
    await tx
      .insertInto("billing_payment")
      .values({
        church_id: b.church_id,
        reference,
        kind: "renewal",
        plan: target.plan,
        interval: target.interval,
        extra_blocks: target.extraBlocks,
        amount_kobo: price,
        period_price_kobo: price,
        founding,
        period_start: renewingOnTime ? b.period_end : null,
      })
      .execute();
    return { b, reference, amountKobo: price, email };
  });
}

/** Start the 14 days of grace and tell the administrators. */
async function toGrace(tx: Db, b: Billing, now: Date, kind: "billing.renew_due" | "billing.failed"): Promise<void> {
  if (b.status !== "active") return;
  const graceUntil = new Date(Math.max(b.period_end?.getTime() ?? now.getTime(), now.getTime() - DAY) + GRACE_DAYS * DAY);
  await tx.updateTable("church_billing").set({ status: "grace", grace_until: graceUntil, updated_at: now }).where("church_id", "=", b.church_id).where("status", "=", "active").execute();
  await audit(tx, { churchId: b.church_id, actorId: null, action: "billing.grace", targetType: "church", targetId: b.church_id, data: { graceUntil: graceUntil.toISOString(), reason: kind } });
  const church = await tx.selectFrom("church").select("name").where("id", "=", b.church_id).executeTakeFirstOrThrow();
  await notify(tx, b.church_id, await adminIds(tx, b.church_id), kind, { churchName: church.name, planName: PLAN_NAME[b.plan], graceUntil: graceUntil.toISOString() });
}

async function renewDue(now: Date): Promise<void> {
  const ps = getPaystack();
  for (let i = 0; i < 100; i++) {
    const c = await claimCharge(now);
    if (c === null) return;
    if (c === "again") continue;
    if (!ps) {
      // Online payment was turned off after this church subscribed.
      await ownerDb.updateTable("billing_payment").set({ status: "failed", failure: "Online payment is not set up" }).where("reference", "=", c.reference).execute();
      await ownerDb.transaction().execute((tx) => toGrace(tx, c.b, now, "billing.renew_due"));
      continue;
    }
    let result: Awaited<ReturnType<typeof settlePayment>>;
    try {
      const txn = await ps.chargeAuthorization({ authorizationCode: c.b.auth_code!, email: c.email, amountKobo: c.amountKobo, reference: c.reference, metadata: { church_id: c.b.church_id, kind: "renewal" } });
      result = await settlePayment(c.reference, txn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[billing] renewal charge error", c.b.church_id, msg);
      await ownerDb.updateTable("billing_payment").set({ status: "failed", failure: msg.slice(0, 300) }).where("reference", "=", c.reference).where("status", "=", "pending").execute();
      result = "failed";
    }
    // A waiting charge is settled later by checkPendingPayments; grace keeps everything working meanwhile.
    if (result !== "success") await ownerDb.transaction().execute((tx) => toGrace(tx, c.b, now, "billing.failed"));
  }
}

/** Grace over, a cancelled plan's period over, or a staff grant over: back to Basic. */
async function expire(now: Date): Promise<void> {
  const due = await ownerDb
    .selectFrom("church_billing")
    .select(["church_id", "status", "plan"])
    .where((eb) =>
      eb.or([
        eb.and([eb("status", "=", "grace"), eb("grace_until", "<=", now)]),
        eb.and([eb("status", "=", "canceling"), eb("period_end", "<=", now)]),
        eb.and([eb("status", "=", "granted"), eb("granted_until", "<=", now)]),
      ]),
    )
    .limit(200)
    .execute();
  for (const d of due) {
    await ownerDb.transaction().execute(async (tx) => {
      const b = await tx.selectFrom("church_billing").selectAll().where("church_id", "=", d.church_id).where("status", "=", d.status).forUpdate().skipLocked().executeTakeFirst();
      if (!b) return;
      await tx.updateTable("church_billing").set({ ...FREE, updated_at: now }).where("church_id", "=", b.church_id).execute();
      await syncChurch(tx, b.church_id);
      await audit(tx, { churchId: b.church_id, actorId: null, action: "billing.ended", targetType: "church", targetId: b.church_id, data: { from: b.status, plan: b.plan } });
      const church = await tx.selectFrom("church").select("name").where("id", "=", b.church_id).executeTakeFirstOrThrow();
      await notify(tx, b.church_id, await adminIds(tx, b.church_id), "billing.ended", { churchName: church.name, planName: PLAN_NAME[b.plan], reason: b.status as "grace" | "canceling" | "granted" });
    });
  }
}

/** A few days before a period ends, remind churches that pay by transfer or USSD (there is no card to charge). */
async function remind(now: Date): Promise<void> {
  const due = await ownerDb
    .selectFrom("church_billing")
    .selectAll()
    .where("status", "=", "active")
    .where("auth_code", "is", null)
    .where("period_end", ">", now)
    .where("period_end", "<=", new Date(now.getTime() + REMIND_DAYS_BEFORE * DAY))
    .where((eb) => eb.or([eb("reminded_at", "is", null), eb("reminded_at", "<", eb.ref("period_start"))]))
    .limit(200)
    .execute();
  for (const b of due) {
    await ownerDb.transaction().execute(async (tx) => {
      const n = await tx
        .updateTable("church_billing")
        .set({ reminded_at: now })
        .where("church_id", "=", b.church_id)
        .where((eb) => eb.or([eb("reminded_at", "is", null), eb("reminded_at", "<", eb.ref("period_start"))]))
        .executeTakeFirst();
      if (Number(n.numUpdatedRows) === 0) return;
      const church = await tx.selectFrom("church").select("name").where("id", "=", b.church_id).executeTakeFirstOrThrow();
      await notify(tx, b.church_id, await adminIds(tx, b.church_id), "billing.renew_soon", { churchName: church.name, planName: PLAN_NAME[b.plan], periodEnd: b.period_end!.toISOString() });
    });
  }
}

export function startBillingWorker(intervalMs = 5 * 60_000): () => Promise<void> {
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (running) return;
    running = runBilling()
      .catch((err) => console.error("[billing] job error:", err instanceof Error ? err.message : err))
      .finally(() => (running = null));
  };
  const first = setTimeout(tick, 30_000);
  first.unref();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return async () => {
    clearTimeout(first);
    clearInterval(timer);
    await running;
  };
}

// ---------- Routes ----------

const paymentsOff = () => conflict("PAYMENTS_OFF", "Online payment is not set up yet. Contact DaveUp to change your plan.");

async function billingDto(churchId: string): Promise<BillingDto> {
  const now = new Date();
  const b = await billingRow(ownerDb, churchId);
  const church = await ownerDb.selectFrom("church").select(["plan", "extra_blocks"]).where("id", "=", churchId).executeTakeFirstOrThrow();
  const payments = await ownerDb.selectFrom("billing_payment").selectAll().where("church_id", "=", churchId).orderBy("created_at", "desc").limit(24).execute();
  const paying = b.status === "active" || b.status === "canceling" || b.status === "grace";
  return {
    onlinePayments: !!getPaystack(),
    plan: church.plan,
    extraBlocks: church.extra_blocks,
    interval: b.interval,
    status: b.status,
    periodStart: b.period_start?.toISOString() ?? null,
    periodEnd: b.period_end?.toISOString() ?? null,
    graceUntil: b.grace_until?.toISOString() ?? null,
    grantedUntil: b.granted_until?.toISOString() ?? null,
    grantedNote: b.granted_note,
    foundingUntil: b.founding_until?.toISOString() ?? null,
    foundingAvailable: foundingAt(b, now),
    periodPriceKobo: paying ? b.period_price_kobo : 0,
    nextChange: b.next_plan && b.next_interval ? { plan: b.next_plan, extraBlocks: b.next_blocks ?? 0, interval: b.next_interval } : null,
    billingEmail: b.billing_email,
    card: b.auth_code ? b.auth_label || "Saved card" : null,
    usage: await churchUsage(ownerDb, churchId),
    limits: limitsFor(church.plan, church.extra_blocks),
    payments: payments.map(paymentDto),
  };
}

export async function billingRoutes(app: FastifyInstance) {
  /** Plan and billing (screen 70). Only church administrators. */
  app.get("/billing", async (req): Promise<BillingDto> => {
    const ctx = await requireAdmin(req);
    return billingDto(ctx.membership.churchId);
  });

  /** What a change would cost now, or when it would start. */
  app.post("/billing/quote", async (req): Promise<BillingQuoteDto> => {
    const ctx = await requireAdmin(req);
    const sel = parse(BillingSelectionSchema, req.body);
    const b = await billingRow(ownerDb, ctx.membership.churchId);
    const { periodStartsAt: _, ...q } = quoteFor(b, sel, new Date());
    return q;
  });

  /** Pay for a plan (screen 64), or schedule a smaller one for the end of the paid period. */
  app.post("/billing/checkout", async (req): Promise<BillingCheckoutDto> => {
    const ctx = await requireAdmin(req);
    const sel = parse(BillingSelectionSchema, req.body);
    const churchId = ctx.membership.churchId;
    const now = new Date();

    const prepared = await ownerDb.transaction().execute(async (tx) => {
      const b = await billingRow(tx, churchId, true);
      const q = quoteFor(b, sel, now);
      if (q.mode === "none") return { mode: "none" as const };
      if (q.mode === "schedule") {
        const toFree = sel.plan === "basic" && sel.extraBlocks === 0;
        await tx
          .updateTable("church_billing")
          .set(toFree ? { status: "canceling", next_plan: null, next_blocks: null, next_interval: null, updated_at: now } : { status: "active", next_plan: sel.plan, next_blocks: sel.extraBlocks, next_interval: sel.interval, updated_at: now })
          .where("church_id", "=", churchId)
          .execute();
        await audit(tx, { churchId, actorId: ctx.personId, action: toFree ? "billing.cancelled" : "billing.change_scheduled", targetType: "church", targetId: churchId, data: { ...sel, from: b.period_end?.toISOString() } });
        return { mode: "schedule" as const };
      }
      if (!getPaystack()) throw paymentsOff();
      const email = await payerEmail(tx, b, ctx.personId);
      if (!email) throw badRequest("NO_BILLING_EMAIL", "Add a billing email first. Paystack sends the receipt there.");
      const reference = newReference();
      const payment = await tx
        .insertInto("billing_payment")
        .values({
          church_id: churchId,
          reference,
          kind: "checkout",
          plan: sel.plan,
          interval: sel.interval,
          extra_blocks: sel.extraBlocks,
          amount_kobo: q.amountKobo,
          period_price_kobo: q.periodPriceKobo,
          founding: q.founding,
          created_by: ctx.personId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await audit(tx, { churchId, actorId: ctx.personId, action: "billing.checkout_started", targetType: "payment", targetId: payment.id, data: { ...sel, amountKobo: q.amountKobo } });
      return { mode: "pay" as const, reference, email, amountKobo: q.amountKobo, paymentId: payment.id };
    });

    if (prepared.mode !== "pay") return { mode: prepared.mode, authorizationUrl: null, reference: null };
    try {
      const { authorizationUrl } = await getPaystack()!.initialize({
        email: prepared.email,
        amountKobo: prepared.amountKobo,
        reference: prepared.reference,
        callbackUrl: `${config.appUrl}/admin/billing/return`,
        metadata: { church_id: churchId, payment_id: prepared.paymentId, cancel_action: `${config.appUrl}/admin/billing/return?reference=${prepared.reference}` },
      });
      return { mode: "pay", authorizationUrl, reference: prepared.reference };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ownerDb.updateTable("billing_payment").set({ status: "failed", failure: msg.slice(0, 300) }).where("reference", "=", prepared.reference).execute();
      req.log.error({ err: msg }, "paystack initialize failed");
      throw new AppError(502, "PAYSTACK_UNAVAILABLE", "Paystack could not start the payment. Please try again in a minute.");
    }
  });

  /** The administrator is back from Paystack: confirm the payment with Paystack. */
  app.post("/billing/verify", async (req): Promise<BillingVerifyDto> => {
    const ctx = await requireAdmin(req);
    const { reference } = parse(BillingVerifySchema, req.body);
    const churchId = ctx.membership.churchId;
    const p = await ownerDb.selectFrom("billing_payment").select(["status", "church_id", "plan"]).where("reference", "=", reference).executeTakeFirst();
    if (!p || p.church_id !== churchId) throw notFound("We could not find that payment");
    let status: BillingVerifyDto["status"] = p.status;
    if (status === "pending") {
      const ps = getPaystack();
      if (!ps) throw paymentsOff();
      try {
        const txn = await ps.verify(reference);
        if (txn) {
          const r = await settlePayment(reference, txn);
          status = r === "unknown" ? "pending" : r;
        }
      } catch (err) {
        if (!(err instanceof PaystackError)) throw err;
        req.log.warn({ err: err.message }, "paystack verify failed");
      }
    }
    const church = await ownerDb.selectFrom("church").select("plan").where("id", "=", churchId).executeTakeFirstOrThrow();
    const message =
      status === "success"
        ? "Payment received. Your plan is active and a receipt is on its way."
        : status === "pending"
          ? "Paystack has not confirmed the payment yet. Bank transfers can take a few minutes. We will update your plan as soon as it is confirmed."
          : status === "abandoned"
            ? "The payment was not completed. Nothing was charged."
            : "The payment did not go through. Nothing was charged. You can try again or use another payment method.";
    return { status, message, plan: church.plan };
  });

  /** Stop renewing: the plan stays until the end of the paid period, then Basic. */
  app.post("/billing/cancel", async (req): Promise<BillingDto> => {
    const ctx = await requireAdmin(req);
    const churchId = ctx.membership.churchId;
    await ownerDb.transaction().execute(async (tx) => {
      const b = await billingRow(tx, churchId, true);
      if (b.status !== "active") throw conflict("NOT_RENEWING", "There is no renewing plan to cancel");
      await tx.updateTable("church_billing").set({ status: "canceling", next_plan: null, next_blocks: null, next_interval: null, updated_at: new Date() }).where("church_id", "=", churchId).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "billing.cancelled", targetType: "church", targetId: churchId, data: { until: b.period_end?.toISOString() } });
    });
    return billingDto(churchId);
  });

  /** Undo a cancellation or a scheduled change before the period ends. */
  app.post("/billing/resume", async (req): Promise<BillingDto> => {
    const ctx = await requireAdmin(req);
    const churchId = ctx.membership.churchId;
    await ownerDb.transaction().execute(async (tx) => {
      const b = await billingRow(tx, churchId, true);
      if (b.status !== "canceling" && !(b.status === "active" && b.next_plan)) throw conflict("NOTHING_TO_UNDO", "Nothing is scheduled to change");
      if (b.period_end && b.period_end <= new Date()) throw conflict("PERIOD_OVER", "This period has ended. Choose a plan instead.");
      await tx.updateTable("church_billing").set({ status: "active", next_plan: null, next_blocks: null, next_interval: null, updated_at: new Date() }).where("church_id", "=", churchId).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "billing.resumed", targetType: "church", targetId: churchId });
    });
    return billingDto(churchId);
  });

  app.put("/billing/contact", async (req): Promise<BillingDto> => {
    const ctx = await requireAdmin(req);
    const { email } = parse(BillingContactSchema, req.body);
    const churchId = ctx.membership.churchId;
    await billingRow(ownerDb, churchId);
    await ownerDb.updateTable("church_billing").set({ billing_email: email, updated_at: new Date() }).where("church_id", "=", churchId).execute();
    await audit(ownerDb, { churchId, actorId: ctx.personId, action: "billing.contact_changed", targetType: "church", targetId: churchId });
    return billingDto(churchId);
  });

  /** Forget the saved card. Renewals then need paying by hand. */
  app.post("/billing/remove-card", async (req): Promise<BillingDto> => {
    const ctx = await requireAdmin(req);
    const churchId = ctx.membership.churchId;
    await billingRow(ownerDb, churchId);
    await ownerDb.updateTable("church_billing").set({ auth_code: null, auth_label: null, updated_at: new Date() }).where("church_id", "=", churchId).execute();
    await audit(ownerDb, { churchId, actorId: ctx.personId, action: "billing.card_removed", targetType: "church", targetId: churchId });
    return billingDto(churchId);
  });

  /** "Talk to us" about Pro or Network (screen 72). Emails DaveUp staff. */
  app.post("/billing/enquiry", async (req): Promise<{ ok: true }> => {
    const ctx = await requireAdmin(req);
    const body = parse(PlanEnquirySchema, req.body);
    const churchId = ctx.membership.churchId;
    const recent = await ownerDb
      .selectFrom("audit_log")
      .select("id")
      .where("church_id", "=", churchId)
      .where("action", "=", "billing.enquiry")
      .where("created_at", ">", new Date(Date.now() - 10 * 60_000))
      .executeTakeFirst();
    if (recent) throw tooMany("We have your message. Please wait a few minutes before sending another.");
    const [church, me, usage] = await Promise.all([
      ownerDb.selectFrom("church").select(["name", "city", "plan"]).where("id", "=", churchId).executeTakeFirstOrThrow(),
      ownerDb.selectFrom("person").select(["full_name", "email", "phone"]).where("id", "=", ctx.personId).executeTakeFirstOrThrow(),
      churchUsage(ownerDb, churchId),
    ]);
    const staff = await ownerDb
      .selectFrom("person")
      .select("id")
      .where((eb) => {
        const parts = [eb("is_super_admin", "=", true)];
        if (config.superAdminEmails.length) parts.push(eb.and([eb("email", "in", config.superAdminEmails), eb("email_verified_at", "is not", null)]));
        return eb.or(parts);
      })
      .execute();
    await ownerDb.transaction().execute(async (tx) => {
      await audit(tx, { churchId, actorId: ctx.personId, action: "billing.enquiry", targetType: "church", targetId: churchId, data: { plan: body.plan } });
      await notify(
        tx,
        churchId,
        staff.map((s) => s.id),
        "staff.plan_enquiry",
        {
          planName: PLAN_NAME[body.plan],
          churchName: church.name,
          city: church.city,
          currentPlan: PLAN_NAME[church.plan],
          fromName: me.full_name ?? "An administrator",
          email: me.email,
          phone: body.phone || me.phone,
          message: body.message,
          usage: `${usage.disciplers} disciplers, ${usage.disciples} disciples, ${usage.cells} cells`,
          churchId,
        },
      );
    });
    if (staff.length === 0) req.log.warn("plan enquiry received but no DaveUp staff are set up to receive it");
    return { ok: true };
  });

  /** Paystack's webhook. The body must be the exact bytes Paystack signed, so JSON is not parsed here. */
  await app.register(async (raw) => {
    raw.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    raw.post("/billing/paystack/webhook", async (req, reply) => {
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || !validWebhookSignature(body, req.headers["x-paystack-signature"] as string | undefined)) {
        return reply.code(401).send({ ok: false });
      }
      let event: { event?: string; data?: { reference?: string } };
      try {
        event = JSON.parse(body.toString("utf8"));
      } catch {
        return reply.code(400).send({ ok: false });
      }
      const reference = event.data?.reference;
      if ((event.event === "charge.success" || event.event === "charge.failed") && reference) {
        const ps = getPaystack();
        // Ask Paystack for the transaction rather than trusting the event body alone.
        const txn = ps ? await ps.verify(reference) : null;
        if (txn) await settlePayment(reference, txn);
      }
      return { ok: true };
    });
  });

  // ---------- DaveUp staff ----------

  /**
   * Set a church's plan by hand: pilots, Pro and Network agreements, or back
   * to Basic. Replaces any online subscription (it stops renewing).
   */
  app.post("/staff/churches/:id/plan", async (req): Promise<BillingDto> => {
    const auth = await requireSuperAdmin(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(StaffPlanSchema, req.body);
    const until = body.until ? new Date(`${body.until}T23:59:59+01:00`) : null;
    if (until && until <= new Date()) throw badRequest("UNTIL_PAST", "Choose an end date in the future");
    await ownerDb.transaction().execute(async (tx) => {
      const c = await tx.selectFrom("church").select("plan").where("id", "=", id).executeTakeFirst();
      if (!c) throw notFound("Church not found");
      const b = await billingRow(tx, id, true);
      const free = body.plan === "basic" && body.extraBlocks === 0;
      await tx
        .updateTable("church_billing")
        .set(free ? { ...FREE, updated_at: new Date() } : { ...FREE, status: "granted", plan: body.plan, extra_blocks: body.extraBlocks, granted_until: until, granted_note: body.note || null, updated_at: new Date() })
        .where("church_id", "=", id)
        .execute();
      await syncChurch(tx, id);
      await audit(tx, {
        churchId: id,
        actorId: auth.personId,
        action: "staff.church_plan",
        targetType: "church",
        targetId: id,
        data: { from: c.plan, to: body.plan, extraBlocks: body.extraBlocks, until: until?.toISOString() ?? null, note: body.note || null, replacedOnline: b.status === "active" || b.status === "canceling" || b.status === "grace" },
      });
    });
    return billingDto(id);
  });

  app.get("/staff/churches/:id/billing", async (req): Promise<BillingDto> => {
    await requireSuperAdmin(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const c = await ownerDb.selectFrom("church").select("id").where("id", "=", id).executeTakeFirst();
    if (!c) throw notFound("Church not found");
    return billingDto(id);
  });
}

