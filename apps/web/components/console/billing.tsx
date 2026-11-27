"use client";
// Shared pieces of the Plan and billing screens (designs 63, 64, 70, 71, 164).
import Link from "next/link";
import { useApi } from "@/lib/api";
import { PLAN_NAME, naira, subscriptionLabel, type BillingDto, type BillingInterval, type ChurchPlan } from "@daveup/shared";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

export const per = (interval: BillingInterval | null) => (interval === "year" ? "year" : "month");

export function planTitle(plan: ChurchPlan, seats: number, memberPacks: number): string {
  return subscriptionLabel(plan, seats, memberPacks);
}

/** One line about where the plan stands, and the pill beside it. */
export function standing(b: BillingDto): { line: string; pill: string; tone: "green" | "amber" | "red" | "grey" } {
  const price = b.periodPriceKobo > 0 ? `${naira(b.periodPriceKobo)} / ${per(b.interval)}` : "";
  switch (b.status) {
    case "active":
      return { line: `${price}. Renews on ${fmtDate(b.periodEnd)}${b.card ? ` with ${b.card}` : ""}.`, pill: "Active", tone: "green" };
    case "canceling":
      return { line: `Paid to ${fmtDate(b.periodEnd)}. It does not renew; your organization then moves to Basic.`, pill: "Ending", tone: "amber" };
    case "grace":
      return { line: `Payment needed. Everything keeps working until ${fmtDate(b.graceUntil)}.`, pill: "Payment due", tone: "red" };
    case "granted":
      return { line: `Arranged with DaveUp${b.grantedUntil ? ` until ${fmtDate(b.grantedUntil)}` : ""}${b.grantedNote ? `: ${b.grantedNote}` : ""}.`, pill: "Arranged", tone: "green" };
    default:
      return { line: "Free forever: 1 leader and up to 3 members. No card, no time limit.", pill: "Free", tone: "grey" };
  }
}

export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = limit !== null && used >= limit;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        <span className={`text-[15px] font-bold ${full ? "text-danger" : "text-ink"}`}>
          {used} {limit === null ? <span className="font-semibold text-ink-muted">(no limit)</span> : <span className="font-semibold text-ink-muted">of {limit}</span>}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-line" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label={label}>
          <div className={`h-full rounded-full ${full ? "bg-danger" : pct >= 80 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** Console overview: a payment is due, or the church is at a plan limit. Nothing otherwise. */
export function BillingNotice() {
  const billing = useApi<BillingDto>("/billing");
  const b = billing.data;
  if (!b) return null;
  const full = (["disciples", "disciplers"] as const).filter((k) => b.limits[k] !== null && b.usage[k] >= b.limits[k]!);
  const noun = { disciples: "members", disciplers: "leaders" } as const;
  if (b.status !== "grace" && full.length === 0) return null;
  const grace = b.status === "grace";
  return (
    <Link href={grace ? "/admin/billing/change" : "/admin/billing"} className={`mb-4 block rounded-card border p-4 ${grace ? "border-danger-line bg-danger-soft" : "border-amber-200 bg-amber-50"}`}>
      <p className={`text-[16px] font-bold ${grace ? "text-danger" : "text-ink"}`}>
        {grace ? `Payment needed by ${fmtDate(b.graceUntil)}` : `Your organization is at its ${PLAN_NAME[b.plan]} limit for ${full.map((k) => noun[k]).join(" and ")}`}
      </p>
      <p className="mt-0.5 text-[14px] text-ink">
        {grace ? "Everything keeps working until then. Pay now to keep your plan." : "No more can be added until you add leaders or member packs. Nobody already in is affected."}
      </p>
    </Link>
  );
}
