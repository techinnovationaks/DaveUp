"use client";
// Choose a plan (design 63) and pay with Paystack (design 64).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAPACITY_BLOCK,
  MAX_EXTRA_BLOCKS,
  PRICE_KOBO,
  PLAN_LIMITS,
  naira,
  type BillingCheckoutDto,
  type BillingDto,
  type BillingInterval,
  type BillingQuoteDto,
  type SelfServePlan,
} from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Field, H1, Loading, Segmented, TopBar, inputClass } from "@/components/ui";
import { fmtDate, planTitle } from "@/components/console/billing";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

export default function ChangePlan() {
  const { me, ready } = useGuard("admin");
  const router = useRouter();
  const billing = useApi<BillingDto>(ready ? "/billing" : null);
  const { busy, error, run } = useAction();
  const [plan, setPlan] = useState<SelfServePlan>("standard");
  const [interval, setPeriod] = useState<BillingInterval>("month");
  const [blocks, setBlocks] = useState(0);
  const [quote, setQuote] = useState<BillingQuoteDto | null>(null);
  const [email, setEmail] = useState("");
  const [started, setStarted] = useState(false);

  // Start from the church's current choice.
  const b = billing.data;
  useEffect(() => {
    if (!b || started) return;
    setStarted(true);
    if (b.status !== "free" && (b.plan === "basic" || b.plan === "standard")) {
      setPlan(b.plan);
      setBlocks(b.extraBlocks);
      if (b.interval) setPeriod(b.interval);
    }
  }, [b, started]);

  // Price for the current choice, from the server (it knows the credit for unused time).
  useEffect(() => {
    if (!b) return;
    let live = true;
    api<BillingQuoteDto>("/billing/quote", { method: "POST", body: { plan, interval, extraBlocks: blocks } })
      .then((q) => live && setQuote(q))
      .catch(() => live && setQuote(null));
    return () => {
      live = false;
    };
  }, [b, plan, interval, blocks]);

  if (!ready || billing.loading) return <Loading />;
  if (!b) {
    return (
      <ConsoleScreen narrow>
        <TopBar back="/admin/billing" title="Choose a plan" />
        <ErrorText>{billing.error?.message}</ErrorText>
      </ConsoleScreen>
    );
  }

  const founding = b.foundingAvailable;
  const months = interval === "year" ? 10 : 1;
  const standardMonthly = founding ? PRICE_KOBO.standardFounding : PRICE_KOBO.standardList;
  const needEmail = !b.billingEmail && !me!.person.email;

  const go = () =>
    run(async () => {
      if (needEmail) await api("/billing/contact", { method: "PUT", body: { email } });
      const r = await api<BillingCheckoutDto>("/billing/checkout", { method: "POST", body: { plan, interval, extraBlocks: blocks } });
      if (r.mode === "pay" && r.authorizationUrl) window.location.assign(r.authorizationUrl);
      else router.push("/admin/billing");
    });

  const PlanCard = ({ id, title, price, note, body, onChoose, selected }: { id: string; title: string; price: string; note: string; body: string; onChoose?: () => void; selected?: boolean }) => (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={selected}
      className={`w-full rounded-card border bg-white p-5 text-left transition-colors ${selected ? "border-2 border-brand shadow-md" : "border-surface-line hover:border-brand-line"}`}
      id={`plan-${id}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[20px] font-extrabold text-ink">{title}</span>
        <span className="text-[18px] font-extrabold text-ink">{price}</span>
      </div>
      <p className="mt-1 text-[14px] font-semibold text-ok">{note}</p>
      <p className="mt-2 text-[15px] text-ink-muted">{body}</p>
    </button>
  );

  const basic = PLAN_LIMITS.basic;
  const std = PLAN_LIMITS.standard;
  const cta =
    quote?.mode === "pay"
      ? `Pay ${naira(quote.amountKobo)} with Paystack`
      : quote?.mode === "schedule"
        ? `Change on ${fmtDate(quote.effectiveAt)}`
        : "This is your current plan";

  return (
    <ConsoleScreen narrow>
      <TopBar back="/admin/billing" title="Choose a plan" />
      <H1 sub="Start free, or choose Standard. You can change plan any time.">Pick a plan</H1>

      <Segmented
        value={interval}
        onChange={setPeriod}
        options={[
          { value: "month", label: "Monthly" },
          { value: "year", label: "Yearly, 2 months free" },
        ]}
      />

      <div className="space-y-3">
        <PlanCard
          id="basic"
          title="Basic"
          price={blocks > 0 ? `${naira(blocks * PRICE_KOBO.block * months)} / ${interval}` : "Free forever"}
          note={blocks > 0 ? "Free plan, with the extra capacity below" : "No card, no time limit"}
          body={`${basic.disciplers} disciplers, ${basic.disciples} disciples, ${basic.cells} cells. Assessments, monthly checks, template growth plans, chat and calls. No AI.`}
          selected={plan === "basic"}
          onChoose={() => setPlan("basic")}
        />
        <PlanCard
          id="standard"
          title="Standard"
          price={`${naira(standardMonthly * months)} / ${interval}`}
          note={founding ? `Founding price, locked for 12 months. List price ${naira(PRICE_KOBO.standardList * months)} / ${interval}` : `List price`}
          body={`${std.disciplers} disciplers, ${std.disciples} disciples, unlimited cells, leadership dashboard. AI help as it arrives.`}
          selected={plan === "standard"}
          onChoose={() => setPlan("standard")}
        />
        <a href="/admin/billing/talk?plan=pro" className="block rounded-card border border-surface-line bg-white p-5 hover:border-brand-line">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[20px] font-extrabold text-ink">Pro</span>
            <span className="text-[18px] font-extrabold text-brand">Talk to us</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-ok">Up to 1,440 disciples and 120 disciplers</p>
          <p className="mt-2 text-[15px] text-ink-muted">Larger AI allowance, your own terminology, and onboarding help, agreed with you.</p>
        </a>
        <a href="/admin/billing/talk?plan=network" className="block rounded-card border border-surface-line bg-white p-5 hover:border-brand-line">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[20px] font-extrabold text-ink">Network</span>
            <span className="text-[18px] font-extrabold text-brand">Custom</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-ok">Many churches, one agreement</p>
          <p className="mt-2 text-[15px] text-ink-muted">Network view that respects each church&apos;s privacy, shared content and dedicated onboarding. At least 10 churches.</p>
        </a>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-ink">Extra capacity</p>
            <p className="mt-0.5 text-[14px] text-ink-muted">
              Each block adds {CAPACITY_BLOCK.disciplers} disciplers, {CAPACITY_BLOCK.disciples} disciples and {CAPACITY_BLOCK.cells} cells for {naira(PRICE_KOBO.block * months)} / {interval}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer blocks" disabled={blocks === 0} onClick={() => setBlocks((n) => Math.max(0, n - 1))} className="h-11 w-11 rounded-full border border-surface-line text-[22px] font-bold text-ink disabled:opacity-40">
              −
            </button>
            <span className="w-8 text-center text-[20px] font-extrabold text-ink" aria-live="polite">
              {blocks}
            </span>
            <button type="button" aria-label="More blocks" disabled={blocks >= MAX_EXTRA_BLOCKS} onClick={() => setBlocks((n) => Math.min(MAX_EXTRA_BLOCKS, n + 1))} className="h-11 w-11 rounded-full border border-surface-line text-[22px] font-bold text-ink disabled:opacity-40">
              +
            </button>
          </div>
        </div>
      </Card>

      <Card tone="soft" className="mt-4">
        <p className="text-[17px] font-bold text-ink">
          {planTitle(plan, blocks)}, {interval === "year" ? "yearly" : "monthly"}
        </p>
        {!quote ? (
          <p className="mt-1 text-[15px] text-ink-muted">Working out the price…</p>
        ) : quote.mode === "pay" ? (
          <p className="mt-1 text-[15px] text-ink">
            {naira(quote.amountKobo)} today
            {quote.creditKobo > 0 ? `, after ${naira(quote.creditKobo)} credit for the unused part of your current plan` : ""}. Paid to {fmtDate(quote.periodEnd)}, then {naira(quote.periodPriceKobo)} each {interval}. Cancel any time.
          </p>
        ) : quote.mode === "schedule" ? (
          <p className="mt-1 text-[15px] text-ink">
            Starts on {fmtDate(quote.effectiveAt)}, when your paid period ends. Nothing to pay now, and you keep what you have until then.
          </p>
        ) : (
          <p className="mt-1 text-[15px] text-ink-muted">{b.status === "free" ? "Basic is free. Nothing to do." : "This is your current plan."}</p>
        )}
      </Card>

      {quote?.mode === "pay" && needEmail && (
        <div className="mt-4">
          <Field label="Billing email" hint="Paystack sends the receipt here.">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@yourchurch.org" />
          </Field>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {quote?.mode === "pay" && !b.onlinePayments ? (
        <p className="mt-4 text-[15px] text-ink">
          Online payment is being set up.{" "}
          <a className="font-semibold text-brand underline" href="/admin/billing/talk?plan=pro">
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
        Billed in Naira through Paystack: card, bank transfer or USSD. You are not charged until Paystack confirms the payment, and a receipt is emailed. Prices are reviewed every 6 months.
      </p>
    </ConsoleScreen>
  );
}
