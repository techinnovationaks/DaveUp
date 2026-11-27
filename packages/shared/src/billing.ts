// Plans, limits and prices. One source for the website, the web app and the
// API, so the price an organization is shown is the price it is charged.
//
// Pricing is per leader (a person who disciples others). Each leader seat
// includes 12 members; more members come in packs of 12. Basic is free for 1
// leader and up to 3 members. Departments and cells are unlimited everywhere.
//
// Amounts are in kobo (₦1 = 100 kobo), as Paystack expects.
import { z } from "zod";
import type { ChurchPlan } from "./chat";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Plans an administrator can buy online. Campus and Network are agreed with DaveUp and set by staff. */
export const SELF_SERVE_PLANS = ["basic", "standard", "pro"] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

export const PLAN_NAME: Record<ChurchPlan, string> = { basic: "Basic", standard: "Standard", pro: "Pro", campus: "Campus", network: "Network" };
const PLAN_RANK: Record<ChurchPlan, number> = { basic: 0, campus: 1, standard: 2, pro: 3, network: 4 };

/** Members each leader seat includes, and the size of an extra member pack. */
export const MEMBERS_PER_LEADER = 12;
export const MEMBER_PACK_SIZE = 12;
export const MAX_SEATS = 5000;
export const MAX_MEMBER_PACKS = 1000;

/** Yearly billing is two months free: 10 months' price for 12. */
export const MONTHS_CHARGED_PER_YEAR = 10;
export const GRACE_DAYS = 14;

export interface PlanInfo {
  /** Price per leader seat, per month and per year, in kobo. */
  leaderMonthKobo: number;
  leaderYearKobo: number;
  /** Fewest leader seats on this plan. */
  minLeaders: number;
  /** Storage, in GB: total for Basic, per leader otherwise. */
  storageGb: number;
  /** Bought online (otherwise: talk to DaveUp). */
  selfServe: boolean;
}

export const PLAN_INFO: Record<ChurchPlan, PlanInfo> = {
  basic: { leaderMonthKobo: 0, leaderYearKobo: 0, minLeaders: 1, storageGb: 1, selfServe: true },
  standard: { leaderMonthKobo: 5_000_00, leaderYearKobo: 50_000_00, minLeaders: 5, storageGb: 2, selfServe: true },
  pro: { leaderMonthKobo: 6_500_00, leaderYearKobo: 65_000_00, minLeaders: 25, storageGb: 5, selfServe: true },
  campus: { leaderMonthKobo: 2_500_00, leaderYearKobo: 25_000_00, minLeaders: 10, storageGb: 2, selfServe: false },
  network: { leaderMonthKobo: 4_000_00, leaderYearKobo: 40_000_00, minLeaders: 100, storageGb: 5, selfServe: false },
};

/** Network's lower per-leader prices for larger agreements (monthly, kobo). */
export const NETWORK_TIERS = [
  { fromLeaders: 100, leaderMonthKobo: 4_000_00 },
  { fromLeaders: 500, leaderMonthKobo: 3_500_00 },
  { fromLeaders: 2000, leaderMonthKobo: 3_000_00 },
] as const;

/** An extra pack of 12 members, per month (yearly: 10 months). */
export const MEMBER_PACK_MONTH_KOBO = 1_800_00;

/** Add-ons that are not sold yet (shown on the pricing page as coming soon). */
export const COMING_ADDONS = {
  aiPack: { size: 100, kobo: 7_500_00 },
  storagePack: { gb: 30, monthKobo: 3_000_00 },
} as const;

export interface PlanLimits {
  /** Leaders: approved disciplers. null = no limit. */
  disciplers: number | null;
  /** Members: people in a current discipleship relationship as the disciple. */
  disciples: number | null;
  /** Cells and departments: unlimited on every plan (kept for older screens). */
  cells: number | null;
}

/** Room an organization has: Basic 1 leader and 3 members; paid plans by seats and packs; Network unlimited. */
export function limitsFor(plan: ChurchPlan, seats: number, memberPacks: number): PlanLimits {
  if (plan === "basic") return { disciplers: 1, disciples: 3, cells: null };
  if (plan === "network" && seats === 0) return { disciplers: null, disciples: null, cells: null };
  return { disciplers: seats, disciples: seats * MEMBERS_PER_LEADER + memberPacks * MEMBER_PACK_SIZE, cells: null };
}

/** Price of one billing period, in kobo. Basic is free. */
export function periodPrice(o: { plan: ChurchPlan; interval: BillingInterval; seats: number; memberPacks: number }): number {
  if (o.plan === "basic") return 0;
  const info = PLAN_INFO[o.plan];
  const leaders = o.seats * (o.interval === "year" ? info.leaderYearKobo : info.leaderMonthKobo);
  const packs = o.memberPacks * MEMBER_PACK_MONTH_KOBO * (o.interval === "year" ? MONTHS_CHARGED_PER_YEAR : 1);
  return leaders + packs;
}

export function isSelfServe(plan: ChurchPlan): plan is SelfServePlan {
  return (SELF_SERVE_PLANS as readonly string[]).includes(plan);
}

export interface Subscription {
  plan: ChurchPlan;
  seats: number;
  memberPacks: number;
  interval: BillingInterval | null;
}

/**
 * Whether moving from one subscription to another takes effect now (and is
 * paid now) or waits for the end of the paid period. Anything that adds room,
 * or moves to yearly, starts now; anything smaller waits, so an organization
 * never loses what it already paid for.
 */
export function changeStartsNow(from: Subscription, to: Subscription & { interval: BillingInterval }): boolean {
  if (from.interval === "year" && to.interval === "month") return false;
  if (PLAN_RANK[to.plan] !== PLAN_RANK[from.plan]) return PLAN_RANK[to.plan] > PLAN_RANK[from.plan];
  if (to.seats < from.seats || to.memberPacks < from.memberPacks) return false;
  if (to.seats > from.seats || to.memberPacks > from.memberPacks) return true;
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

/** "Standard, 8 leaders and 2 member packs" */
export function subscriptionLabel(plan: ChurchPlan, seats: number, memberPacks: number): string {
  if (plan === "basic") return "Basic";
  if (plan === "network" && seats === 0) return "Network";
  const parts = [`${seats} leader${seats === 1 ? "" : "s"}`];
  if (memberPacks > 0) parts.push(`${memberPacks} member pack${memberPacks === 1 ? "" : "s"}`);
  return `${PLAN_NAME[plan]}, ${parts.join(" and ")}`;
}

// ---------- API shapes ----------

export const BillingSelectionSchema = z
  .object({
    plan: z.enum(SELF_SERVE_PLANS),
    interval: z.enum(BILLING_INTERVALS),
    seats: z.number().int().min(1).max(MAX_SEATS),
    memberPacks: z.number().int().min(0).max(MAX_MEMBER_PACKS),
  })
  .superRefine((s, ctx) => {
    if (s.plan === "basic") {
      if (s.seats !== 1 || s.memberPacks !== 0) ctx.addIssue({ code: "custom", path: ["seats"], message: "Basic is 1 leader and up to 3 members" });
    } else if (s.seats < PLAN_INFO[s.plan].minLeaders) {
      ctx.addIssue({ code: "custom", path: ["seats"], message: `${PLAN_NAME[s.plan]} starts at ${PLAN_INFO[s.plan].minLeaders} leaders` });
    }
  });
export type BillingSelection = z.infer<typeof BillingSelectionSchema>;

export const BillingContactSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
export const BillingVerifySchema = z.object({ reference: z.string().trim().min(6).max(100) });
export const PlanEnquirySchema = z.object({
  plan: z.enum(["campus", "network", "pro"]),
  message: z.string().trim().min(10, "Tell us a little about your organization or network").max(2000),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

/** Staff set any plan by hand: pilots, Campus and Network agreements. */
export const StaffPlanSchema = z.object({
  plan: z.enum(["basic", "standard", "pro", "campus", "network"]),
  /** Leader seats. 0 on Network means no limit. */
  seats: z.number().int().min(0).max(100_000).default(1),
  memberPacks: z.number().int().min(0).max(100_000).default(0),
  /** ISO date. When it passes the organization returns to Basic. Omit for no end. */
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
  seats: number;
  memberPacks: number;
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
  seats: number;
  memberPacks: number;
  interval: BillingInterval | null;
  status: BillingStatus;
  periodStart: string | null;
  periodEnd: string | null;
  graceUntil: string | null;
  grantedUntil: string | null;
  grantedNote: string | null;
  /** What the organization pays per period now, in kobo (0 when free or granted). */
  periodPriceKobo: number;
  nextChange: { plan: ChurchPlan; seats: number; memberPacks: number; interval: BillingInterval } | null;
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
