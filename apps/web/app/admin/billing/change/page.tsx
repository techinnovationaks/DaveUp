"use client";
// Choose a plan and pay with Paystack. Priced per leader: each leader seat
// includes 12 members; more members come in packs of 12.
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_MEMBER_PACKS,
  MAX_SEATS,
  MEMBER_PACK_MONTH_KOBO,
  MEMBER_PACK_SIZE,
  MEMBERS_PER_LEADER,
  MONTHS_CHARGED_PER_YEAR,
  PLAN_INFO,
  naira,
  subscriptionLabel,
  type BillingCheckoutDto,
  type BillingDto,
  type BillingInterval,
  type BillingQuoteDto,
  type SelfServePlan,
} from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Field, H1, Loading, Segmented, TopBar, inputClass } from "@/components/ui";
import { fmtDate } from "@/components/console/billing";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : min)));
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => set(value - 1)} className="h-11 w-11 rounded-full border border-surface-line text-[22px] font-bold text-ink disabled:opacity-40">
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || min)}
        className="h-11 w-16 rounded-xl border border-surface-line text-center text-[18px] font-extrabold text-ink"
      />
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)} className="h-11 w-11 rounded-full border border-surface-line text-[22px] font-bold text-ink disabled:opacity-40">
        +
      </button>
    </div>
  );
}

function PlanCard({ title, price, note, children, selected, onChoose }: { title: string; price: string; note: string; children: ReactNode; selected?: boolean; onChoose?: () => void }) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={selected}
      className={`w-full rounded-card border bg-card p-5 text-left transition-colors ${selected ? "border-2 border-brand shadow-md" : "border-surface-line hover:border-brand-line"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[20px] font-extrabold text-ink">{title}</span>
        <span className="text-[18px] font-extrabold text-ink">{price}</span>
      </div>
      <p className="mt-1 text-[14px] font-semibold text-ok">{note}</p>
      <div className="mt-2 text-[15px] text-ink-muted">{children}</div>
    </button>
  );
}

export default function ChangePlan() {
  const { me, ready } = useGuard("admin");
  const router = useRouter();
  const billing = useApi<BillingDto>(ready ? "/billing" : null);
  const { busy, error, run } = useAction();
  const [plan, setPlan] = useState<SelfServePlan>("standard");
  const [interval, setPeriod] = useState<BillingInterval>("month");
  const [seats, setSeats] = useState(PLAN_INFO.standard.minLeaders);
  const [packs, setPacks] = useState(0);
  const [quote, setQuote] = useState<BillingQuoteDto | null>(null);
  const [email, setEmail] = useState("");
  const [started, setStarted] = useState(false);

  // Start from the organization's current choice, or enough leaders for the leaders it already has.
  const b = billing.data;
  useEffect(() => {
    if (!b || started) return;
    setStarted(true);
    if (b.status !== "free" && (b.plan === "standard" || b.plan === "pro")) {
      setPlan(b.plan);
      setSeats(b.seats);
      setPacks(b.memberPacks);
      if (b.interval) setPeriod(b.interval);
    } else {
      setSeats(Math.max(PLAN_INFO.standard.minLeaders, b.usage.disciplers));
    }
  }, [b, started]);

  const choose = (p: SelfServePlan) => {
    setPlan(p);
    if (p === "basic") {
      setSeats(1);
      setPacks(0);
    } else setSeats((n) => Math.max(n, PLAN_INFO[p].minLeaders));
  };

  // Price for the current choice, from the server (it knows the credit for unused time).
  useEffect(() => {
    if (!b) return;
    let live = true;
    api<BillingQuoteDto>("/billing/quote", { method: "POST", body: { plan, interval, seats, memberPacks: packs } })
      .then((q) => live && setQuote(q))
      .catch(() => live && setQuote(null));
    return () => {
      live = false;
    };
  }, [b, plan, interval, seats, packs]);

  if (!ready || billing.loading) return <Loading />;
  if (!b) {
    return (
      <ConsoleScreen narrow>
        <TopBar back="/admin/billing" title="Choose a plan" />
        <ErrorText>{billing.error?.message}</ErrorText>
      </ConsoleScreen>
    );
  }

  const yearly = interval === "year";
  const per = (p: "standard" | "pro") => naira(yearly ? PLAN_INFO[p].leaderYearKobo : PLAN_INFO[p].leaderMonthKobo);
  const packPrice = naira(MEMBER_PACK_MONTH_KOBO * (yearly ? MONTHS_CHARGED_PER_YEAR : 1));
  const needEmail = !b.billingEmail && !me!.person.email;
  const members = seats * MEMBERS_PER_LEADER + packs * MEMBER_PACK_SIZE;

  const go = () =>
    run(async () => {
      if (needEmail) await api("/billing/contact", { method: "PUT", body: { email } });
      const r = await api<BillingCheckoutDto>("/billing/checkout", { method: "POST", body: { plan, interval, seats, memberPacks: packs } });
      if (r.mode === "pay" && r.authorizationUrl) window.location.assign(r.authorizationUrl);
      else router.push("/admin/billing");
    });

  const cta =
    quote?.mode === "pay" ? `Pay ${naira(quote.amountKobo)} with Paystack` : quote?.mode === "schedule" ? `Change on ${fmtDate(quote.effectiveAt)}` : "This is your current plan";

  return (
    <ConsoleScreen narrow>
      <TopBar back="/admin/billing" title="Choose a plan" />
      <H1 sub="Pay only for the leaders who disciple. Each leader includes 12 members. Owners and admins who only manage settings are free.">Pick a plan</H1>

      <Segmented
        value={interval}
        onChange={setPeriod}
        options={[
          { value: "month", label: "Monthly" },
          { value: "year", label: "Yearly, 2 months free" },
        ]}
      />

      <div className="space-y-3">
        <PlanCard title="Basic" price="Free forever" note="No card needed" selected={plan === "basic"} onChoose={() => choose("basic")}>
          1 leader and up to 3 members. Unlimited departments and cells, journal and assessments. 1 GB storage.
        </PlanCard>
        <PlanCard title="Standard" price={`${per("standard")} / leader / ${interval}`} note={`From ${PLAN_INFO.standard.minLeaders} leaders`} selected={plan === "standard"} onChoose={() => choose("standard")}>
          For a growing church, fellowship or coaching organization. 12 members per leader, 2 GB storage per leader. Group training and the weekly leader brief are coming soon.
        </PlanCard>
        <PlanCard title="Pro" price={`${per("pro")} / leader / ${interval}`} note={`From ${PLAN_INFO.pro.minLeaders} leaders`} selected={plan === "pro"} onChoose={() => choose("pro")}>
          For large churches and multi-site organizations. Everything in Standard, 5 GB storage per leader. Organization reports and paid access to join are coming soon.
        </PlanCard>
        <a href="/admin/billing/talk?plan=campus" className="block rounded-card border border-surface-line bg-card p-5 hover:border-brand-line">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[20px] font-extrabold text-ink">Campus</span>
            <span className="text-[18px] font-extrabold text-brand">Talk to us</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-ok">
            {naira(PLAN_INFO.campus.leaderMonthKobo)} per leader a month, from {PLAN_INFO.campus.minLeaders} leaders
          </p>
          <p className="mt-2 text-[15px] text-ink-muted">Standard features at a student rate, for campus fellowships and student groups.</p>
        </a>
        <a href="/admin/billing/talk?plan=network" className="block rounded-card border border-surface-line bg-card p-5 hover:border-brand-line">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[20px] font-extrabold text-ink">Network</span>
            <span className="text-[18px] font-extrabold text-brand">Talk to us</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-ok">
            From {naira(PLAN_INFO.network.leaderMonthKobo)} per leader a month, from {PLAN_INFO.network.minLeaders} leaders
          </p>
          <p className="mt-2 text-[15px] text-ink-muted">Denominations, ministries and training programs, on an annual contract.</p>
        </a>
      </div>

      {plan !== "basic" && (
        <>
          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-ink">Leaders</p>
                <p className="mt-0.5 text-[14px] text-ink-muted">
                  People who disciple others. You have {b.usage.disciplers} now. At least {PLAN_INFO[plan].minLeaders} on {plan === "pro" ? "Pro" : "Standard"}.
                </p>
              </div>
              <Stepper label="leaders" value={seats} min={PLAN_INFO[plan].minLeaders} max={MAX_SEATS} onChange={setSeats} />
            </div>
          </Card>
          <Card className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-ink">Extra members</p>
                <p className="mt-0.5 text-[14px] text-ink-muted">
                  Packs of {MEMBER_PACK_SIZE} for {packPrice} / {interval}. Room for {members.toLocaleString("en-NG")} members in discipleship ({b.usage.disciples} now).
                </p>
              </div>
              <Stepper label="member packs" value={packs} min={0} max={MAX_MEMBER_PACKS} onChange={setPacks} />
            </div>
          </Card>
        </>
      )}

      <Card tone="soft" className="mt-4">
        <p className="text-[17px] font-bold text-ink">
          {subscriptionLabel(plan, seats, packs)}, {yearly ? "yearly" : "monthly"}
        </p>
        {!quote ? (
          <p className="mt-1 text-[15px] text-ink-muted">Working out the price…</p>
        ) : quote.mode === "pay" ? (
          <p className="mt-1 text-[15px] text-ink">
            {naira(quote.amountKobo)} today
            {quote.creditKobo > 0 ? `, after ${naira(quote.creditKobo)} credit for the unused part of your current plan` : ""}. Paid to {fmtDate(quote.periodEnd)}, then {naira(quote.periodPriceKobo)} each {interval}. Cancel any time.
          </p>
        ) : quote.mode === "schedule" ? (
          <p className="mt-1 text-[15px] text-ink">Starts on {fmtDate(quote.effectiveAt)}, when your paid period ends. Nothing to pay now, and you keep what you have until then.</p>
        ) : (
          <p className="mt-1 text-[15px] text-ink-muted">{b.status === "free" ? "Basic is free. Nothing to do." : "This is your current plan."}</p>
        )}
      </Card>

      {quote?.mode === "pay" && needEmail && (
        <div className="mt-4">
          <Field label="Billing email" hint="Paystack sends the receipt here.">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@yourorganization.org" />
          </Field>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {quote?.mode === "pay" && !b.onlinePayments ? (
        <p className="mt-4 text-[15px] text-ink">
          Online payment is being set up.{" "}
          <a className="font-semibold text-brand underline" href="/admin/billing/talk">
            Contact DaveUp
          </a>{" "}
          to change plan now.
        </p>
      ) : (
        <div className="mt-5">
          <Button full disabled={busy || !quote || quote.mode === "none" || (quote.mode === "pay" && needEmail && !email)} onClick={() => void go()}>
            {busy && quote?.mode === "pay" ? "Opening Paystack…" : cta}
          </Button>
        </div>
      )}
      <p className="mt-4 text-[14px] text-ink-muted">
        Billed in Naira through Paystack: card, bank transfer or USSD. You are not charged until Paystack confirms the payment, and a receipt is emailed. Departments and cells are unlimited on every plan.
      </p>
    </ConsoleScreen>
  );
}
