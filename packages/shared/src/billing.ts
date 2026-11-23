// Plans, limits and prices (PRD 17.3 to 17.9). One source for the web app and
// the API, so the price a church is shown is the price it is charged.
//
// Amounts are in kobo (₦1 = 100 kobo), as Paystack expects.
import { z } from "zod";
import type { ChurchPlan } from "./chat";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Plans a church administrator can buy online. Pro and Network are agreed with DaveUp and set by staff. */
export const SELF_SERVE_PLANS = ["basic", "standard"] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

export const PLAN_NAME: Record<ChurchPlan, string> = { basic: "Basic", standard: "Standard", pro: "Pro", network: "Network" };
const PLAN_RANK: Record<ChurchPlan, number> = { basic: 0, standard: 1, pro: 2, network: 3 };

export interface PlanLimits {
  /** Approved disciplers. null = no limit. */
  disciplers: number | null;
  /** People in a current discipleship relationship as the disciple. */
  disciples: number | null;
  /** Cells (departments count here too once they exist). */
  cells: number | null;
}

export const PLAN_LIMITS: Record<ChurchPlan, PlanLimits> = {
  basic: { disciplers: 3, disciples: 36, cells: 3 },
  standard: { disciplers: 12, disciples: 144, cells: null },
  pro: { disciplers: 120, disciples: 1440, cells: null },
  network: { disciplers: null, disciples: null, cells: null },
};

/** One block of extra capacity: 3 disciplers, 36 disciples, 3 cells. */
export const CAPACITY_BLOCK: Required<{ [K in keyof PlanLimits]: number }> = { disciplers: 3, disciples: 36, cells: 3 };
export const MAX_EXTRA_BLOCKS = 20;

export const PRICE_KOBO = {
  standardFounding: 70_000_00,
  standardList: 100_000_00,
  block: 30_000_00,
} as const;

/** Yearly billing is two months free: 10 months' price for 12. */
export const MONTHS_CHARGED_PER_YEAR = 10;
export const GRACE_DAYS = 14;
export const FOUNDING_LOCK_MONTHS = 12;

export function limitsFor(plan: ChurchPlan, extraBlocks: number): PlanLimits {
  const base = PLAN_LIMITS[plan];
  const add = (v: number | null, per: number) => (v === null ? null : v + per * extraBlocks);
  return {
    disciplers: add(base.disciplers, CAPACITY_BLOCK.disciplers),
    disciples: add(base.disciples, CAPACITY_BLOCK.disciples),
    cells: add(base.cells, CAPACITY_BLOCK.cells),
  };
}

/** Price of one billing period, in kobo. Basic with no extra capacity is free. */
export function periodPrice(o: { plan: SelfServePlan; interval: BillingInterval; extraBlocks: number; founding: boolean }): number {
  const monthly = (o.plan === "standard" ? (o.founding ? PRICE_KOBO.standardFounding : PRICE_KOBO.standardList) : 0) + o.extraBlocks * PRICE_KOBO.block;
  return o.interval === "year" ? monthly * MONTHS_CHARGED_PER_YEAR : monthly;
}

export function isSelfServe(plan: ChurchPlan): plan is SelfServePlan {
  return (SELF_SERVE_PLANS as readonly string[]).includes(plan);
}

/**
 * Whether moving from one subscription to another takes effect now (and is
 * paid now) or waits for the end of the paid period. Anything that adds
 * capacity, or moves to yearly, starts now; anything smaller waits, so a
 * church never loses what it already paid for.
 */
export function changeStartsNow(from: { plan: ChurchPlan; extraBlocks: number; interval: BillingInterval | null }, to: { plan: ChurchPlan; extraBlocks: number; interval: BillingInterval }): boolean {
  if (from.interval === "year" && to.interval === "month") return false;
  if (PLAN_RANK[to.plan] !== PLAN_RANK[from.plan]) return PLAN_RANK[to.plan] > PLAN_RANK[from.plan];
  if (to.extraBlocks !== from.extraBlocks) return to.extraBlocks > from.extraBlocks;
  return from.interval === "month" && to.interval === "year";
}

/** Unused value of the current period, in kobo, credited against an upgrade paid now. */
export function unusedCredit(periodPriceKobo: number, periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  const left = periodEnd.getTime() - now.getTime();
  if (total <= 0 || left <= 0) return 0;
  return Math.floor((periodPriceKobo * Math.min(left, total)) / total);
}

export function addInterval(d: Date, interval: BillingInterval, count = 1): Date {
  const out = new Date(d);
  if (interval === "year") out.setUTCFullYear(out.getUTCFullYear() + count);
  else out.setUTCMonth(out.getUTCMonth() + count);
  return out;
}

export function naira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

// ---------- API shapes ----------

export const BillingSelectionSchema = z.object({
  plan: z.enum(SELF_SERVE_PLANS),
  interval: z.enum(BILLING_INTERVALS),
  extraBlocks: z.number().int().min(0).max(MAX_EXTRA_BLOCKS),
});
export type BillingSelection = z.infer<typeof BillingSelectionSchema>;

export const BillingContactSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
export const BillingVerifySchema = z.object({ reference: z.string().trim().min(6).max(100) });
export const PlanEnquirySchema = z.object({
  plan: z.enum(["pro", "network"]),
  message: z.string().trim().min(10, "Tell us a little about your church or network").max(2000),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

/** Staff set any plan by hand: pilots, Pro and Network agreements. */
export const StaffPlanSchema = z.object({
  plan: z.enum(["basic", "standard", "pro", "network"]),
  extraBlocks: z.number().int().min(0).max(1000).default(0),
  /** ISO date. When it passes the church returns to Basic. Omit for no end. */
  until: z.string().date().optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/**
 * free: Basic, nothing to pay. active: paid and renewing. canceling: paid,
 * ends at the period end. grace: a renewal failed or is unpaid; everything
 * keeps working until graceUntil. granted: set by DaveUp staff (pilot or agreement).
 */
export type BillingStatus = "free" | "active" | "canceling" | "grace" | "granted";

export interface BillingPaymentDto {
  id: string;
  reference: string;
  kind: "checkout" | "renewal";
  plan: ChurchPlan;
  interval: BillingInterval;
  extraBlocks: number;
  amountKobo: number;
  status: "pending" | "success" | "failed" | "abandoned";
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  failure: string | null;
}

export interface BillingDto {
  /** False until Paystack keys are set on the server. */
  onlinePayments: boolean;
  plan: ChurchPlan;
  extraBlocks: number;
  interval: BillingInterval | null;
  status: BillingStatus;
  periodStart: string | null;
  periodEnd: string | null;
  graceUntil: string | null;
  grantedUntil: string | null;
  grantedNote: string | null;
  /** The founding price applies to periods that start before this. */
  foundingUntil: string | null;
  /** Whether a church starting Standard today gets the founding price. */
  foundingAvailable: boolean;
  /** What the church pays per period now, in kobo (0 when free or granted). */
  periodPriceKobo: number;
  nextChange: { plan: ChurchPlan; extraBlocks: number; interval: BillingInterval } | null;
  billingEmail: string | null;
  /** e.g. "Visa ending 4081"; renewals are charged to it automatically. */
  card: string | null;
  usage: { disciplers: number; disciples: number; cells: number };
  limits: PlanLimits;
  payments: BillingPaymentDto[];
}

export interface BillingQuoteDto {
  /** pay: pay amountKobo now. schedule: takes effect at periodEnd, nothing to pay now. none: no change. */
  mode: "pay" | "schedule" | "none";
  amountKobo: number;
  creditKobo: number;
  periodPriceKobo: number;
  founding: boolean;
  /** When a scheduled change starts, or when the new period would end. */
  effectiveAt: string | null;
  periodEnd: string | null;
}

export interface BillingCheckoutDto {
  mode: "pay" | "schedule" | "none";
  /** Paystack's payment page; send the browser here. */
  authorizationUrl: string | null;
  reference: string | null;
}

export interface BillingVerifyDto {
  status: "success" | "pending" | "failed" | "abandoned";
  message: string;
  plan: ChurchPlan;
}
