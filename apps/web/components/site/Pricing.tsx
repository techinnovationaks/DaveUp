"use client";
// Pricing on the website, from the same numbers checkout charges
// (packages/shared/src/billing.ts). Monthly or yearly, plan cards, add-ons and
// a comparison table.
import Link from "next/link";
import { useState } from "react";
import { COMING_ADDONS, MEMBER_PACK_MONTH_KOBO, MEMBER_PACK_SIZE, MEMBERS_PER_LEADER, NETWORK_TIERS, PLAN_INFO, naira, type ChurchPlan } from "@daveup/shared";

type Period = "month" | "year";

const Soon = () => <span className="ml-1.5 rounded-full bg-glow/15 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-glow-ink">Coming soon</span>;

interface Card {
  plan: ChurchPlan;
  name: string;
  who: string;
  cta: { label: string; href: string };
  featured?: boolean;
  points: { text: string; soon?: boolean }[];
}

const CARDS: Card[] = [
  {
    plan: "basic",
    name: "Basic",
    who: "Individuals, small groups and new organizations",
    cta: { label: "Start free", href: "/signup" },
    points: [{ text: "1 leader, up to 3 members" }, { text: "Unlimited departments and cells" }, { text: "Journal and assessments" }, { text: "Multiplication tracking", soon: true }, { text: "1 GB storage, no AI" }],
  },
  {
    plan: "standard",
    name: "Standard",
    who: "A growing church, fellowship or coaching organization",
    cta: { label: "Choose Standard", href: "/register-church" },
    featured: true,
    points: [
      { text: "Everything in Basic for every leader seat" },
      { text: `${MEMBERS_PER_LEADER} members per leader` },
      { text: "Leader insight and the weekly leader brief", soon: true },
      { text: "Group training", soon: true },
      { text: "2 GB storage per leader" },
      { text: "AI drafts as an add-on", soon: true },
    ],
  },
  {
    plan: "pro",
    name: "Pro",
    who: "Large churches and multi-site organizations",
    cta: { label: "Choose Pro", href: "/register-church" },
    points: [{ text: "Everything in Standard" }, { text: "5 GB storage per leader" }, { text: "Organization reports", soon: true }, { text: "Paid access for your programs", soon: true }],
  },
  {
    plan: "campus",
    name: "Campus",
    who: "Campus fellowships and student groups",
    cta: { label: "Talk to us", href: "/register-church" },
    points: [{ text: "Standard features at a student rate" }, { text: "Group training", soon: true }],
  },
  {
    plan: "network",
    name: "Network",
    who: "Denominations, ministries and training programs",
    cta: { label: "Talk to us", href: "/register-church" },
    points: [{ text: "Everything in Pro" }, { text: "Shared reporting across organizations", soon: true }, { text: "Annual contract" }],
  },
];

const TABLE: { group: string; rows: { label: string; values: (string | boolean)[] }[] }[] = [
  {
    group: "Core features",
    rows: [
      { label: "Journal and assessments", values: [true, true, true, true, true] },
      { label: "Spaces, chat and calls", values: [true, true, true, true, true] },
      { label: "Unlimited departments and cells", values: [true, true, true, true, true] },
      { label: "Multiple organizations", values: [true, true, true, true, true] },
      { label: "Resource Centre and training courses", values: [true, true, true, true, true] },
      { label: "Growth plans and monthly check", values: [true, true, true, true, true] },
      { label: "Group training with sessions and attendance (soon)", values: [false, true, true, true, true] },
    ],
  },
  {
    group: "Leadership (coming soon)",
    rows: [
      { label: "Leader insight and weekly leader brief", values: [false, true, true, true, true] },
      { label: "Organization reports", values: [false, false, true, false, true] },
      { label: "Shared reporting across organizations", values: [false, false, false, false, true] },
      { label: "Paid access to join", values: [false, false, true, false, true] },
      { label: "AI drafts", values: [false, "Add-on", "Add-on", "Add-on", "Add-on"] },
    ],
  },
];

export function Pricing() {
  const [period, setPeriod] = useState<Period>("month");
  const yearly = period === "year";
  const price = (p: ChurchPlan) => (yearly ? PLAN_INFO[p].leaderYearKobo : PLAN_INFO[p].leaderMonthKobo);
  const order: ChurchPlan[] = ["basic", "standard", "pro", "campus", "network"];

  return (
    <div>
      <div className="mt-8 inline-flex rounded-full border border-white/15 bg-white/5 p-1" role="tablist" aria-label="Billing period">
        {(["month", "year"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-5 py-2.5 text-[14px] font-bold transition-colors ${period === p ? "bg-white text-night" : "text-night-muted hover:text-white"}`}
          >
            {p === "month" ? "Monthly" : "Yearly, 2 months free"}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {CARDS.map((c) => {
          const info = PLAN_INFO[c.plan];
          return (
            <div
              key={c.plan}
              data-reveal
              className={`relative flex flex-col rounded-[24px] border p-6 ${c.featured ? "border-glow/60 bg-white/[0.09] shadow-[0_0_0_1px_rgba(1,253,255,.25),0_30px_60px_-20px_rgba(1,253,255,.35)]" : "border-white/[0.12] bg-white/[0.05]"}`}
            >
              {c.featured && <span className="absolute -top-3 left-6 rounded-full bg-glow px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-night">Most popular</span>}
              <p className="font-display text-[22px] font-extrabold text-white">{c.name}</p>
              <p className="mt-1 min-h-[42px] text-[14px] text-night-muted">{c.who}</p>
              <div className="mt-5">
                {c.plan === "basic" ? (
                  <>
                    <p className="font-display text-[34px] font-extrabold leading-none text-white">Free</p>
                    <p className="mt-1 text-[13px] text-night-muted">forever · no card needed</p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-[34px] font-extrabold leading-none text-white">
                      {c.plan === "network" && <span className="mr-1 text-[15px] font-bold text-night-muted">from</span>}
                      {naira(price(c.plan))}
                    </p>
                    <p className="mt-1 text-[13px] text-night-muted">
                      per leader per {period}
                      {c.plan === "network" ? ", annual contract" : ""}
                    </p>
                    <p className="mt-2 text-[13px] font-semibold text-glow">Minimum {info.minLeaders} leaders</p>
                  </>
                )}
              </div>
              <ul className="mt-5 flex-1 space-y-2.5 text-[14px] text-white/90">
                {c.points.map((pt) => (
                  <li key={pt.text} className="flex gap-2">
                    <span aria-hidden className="mt-0.5 text-glow">
                      ✓
                    </span>
                    <span>
                      {pt.text}
                      {pt.soon && <Soon />}
                    </span>
                  </li>
                ))}
              </ul>
              {c.plan === "network" && (
                <p className="mt-4 text-[12px] text-night-muted">
                  {NETWORK_TIERS.slice(1)
                    .map((t) => `${naira(t.leaderMonthKobo)} from ${t.fromLeaders.toLocaleString("en-NG")} leaders`)
                    .join(", ")}
                  .
                </p>
              )}
              <Link
                href={c.cta.href}
                className={`mt-6 rounded-full py-3 text-center text-[15px] font-bold transition-transform hover:-translate-y-0.5 ${c.featured ? "bg-white text-night" : "border border-white/25 text-white hover:bg-white/10"}`}
              >
                {c.cta.label}
              </Link>
            </div>
          );
        })}
      </div>

      <div data-reveal className="mt-6 grid gap-3 rounded-[20px] border border-white/[0.12] bg-white/[0.04] p-5 text-[14px] text-white/90 md:grid-cols-3">
        <p>
          <strong className="text-white">More members:</strong> packs of {MEMBER_PACK_SIZE} for {naira(MEMBER_PACK_MONTH_KOBO * (yearly ? 10 : 1))} per pack per {period}
        </p>
        <p>
          <strong className="text-white">AI drafts:</strong> packs of {COMING_ADDONS.aiPack.size} for {naira(COMING_ADDONS.aiPack.kobo)}
          <Soon />
        </p>
        <p>
          <strong className="text-white">Extra storage:</strong> packs of {COMING_ADDONS.storagePack.gb} GB for {naira(COMING_ADDONS.storagePack.monthKobo)} a month
          <Soon />
        </p>
      </div>
      <p className="mt-4 text-[14px] text-night-muted">Owners and admins who only manage settings are free. Departments and cells are unlimited on every plan. Pay with Paystack by card, bank transfer or USSD.</p>

      <details className="group mt-8 rounded-[20px] border border-white/[0.12] bg-white/[0.04] [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-display text-[18px] font-bold text-white">
          Compare plans
          <span aria-hidden className="text-glow transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="overflow-x-auto px-2 pb-4 md:px-6">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead>
              <tr className="text-white">
                <th className="py-3 pr-4 font-semibold text-night-muted">Pricing and seats</th>
                {order.map((p) => (
                  <th key={p} className="py-3 pr-4 font-display font-bold">
                    {CARDS.find((c) => c.plan === p)!.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-white/90">
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Price per leader ({period === "month" ? "monthly" : "yearly"})</td>
                {order.map((p) => (
                  <td key={p} className="py-2.5 pr-4">
                    {p === "basic" ? "Free" : p === "network" ? (yearly ? "Annual contract" : `From ${naira(price(p))}`) : naira(price(p))}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Minimum leaders</td>
                {order.map((p) => (
                  <td key={p} className="py-2.5 pr-4">
                    {PLAN_INFO[p].minLeaders}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Members included</td>
                {order.map((p) => (
                  <td key={p} className="py-2.5 pr-4">
                    {p === "basic" ? "Up to 3" : `${MEMBERS_PER_LEADER} per leader`}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Extra members</td>
                {order.map((p) => (
                  <td key={p} className="py-2.5 pr-4">
                    {p === "basic" ? "–" : `Packs of ${MEMBER_PACK_SIZE}`}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Storage</td>
                {order.map((p) => (
                  <td key={p} className="py-2.5 pr-4">
                    {p === "basic" ? "1 GB" : `${PLAN_INFO[p].storageGb} GB per leader`}
                  </td>
                ))}
              </tr>
              {TABLE.map((g) => (
                <FragmentRows key={g.group} group={g.group} rows={g.rows} />
              ))}
              <tr className="border-t border-white/10">
                <td className="py-2.5 pr-4 text-night-muted">Admins who only manage settings</td>
                <td colSpan={5} className="py-2.5 pr-4">
                  Free on every plan
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function FragmentRows({ group, rows }: { group: string; rows: { label: string; values: (string | boolean)[] }[] }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="pb-1 pt-5 text-[12px] font-bold uppercase tracking-widest text-glow">
          {group}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.label} className="border-t border-white/10">
          <td className="py-2.5 pr-4 text-night-muted">{r.label}</td>
          {r.values.map((v, i) => (
            <td key={i} className="py-2.5 pr-4">
              {v === true ? <span className="text-glow">✓</span> : v === false ? <span className="text-white/30">–</span> : v}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
