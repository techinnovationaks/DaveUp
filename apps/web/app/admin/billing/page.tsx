"use client";
// Plan and billing (design 70), with "If a payment fails" (design 71).
import { useState } from "react";
import { GRACE_DAYS, PLAN_NAME, naira, type BillingDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Eyebrow, Field, H1, LinkButton, Loading, Pill, inputClass } from "@/components/ui";
import { fmtDate, planTitle, standing, UsageBar } from "@/components/console/billing";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

const STATUS_TONE = { success: "green", pending: "amber", failed: "red", abandoned: "grey" } as const;
const STATUS_TEXT = { success: "Paid", pending: "Waiting", failed: "Failed", abandoned: "Not completed" } as const;
const CHANNEL: Record<string, string> = { card: "Card", bank: "Bank", bank_transfer: "Bank transfer", ussd: "USSD", mobile_money: "Mobile money", qr: "QR" };

export default function Billing() {
  const { me, ready } = useGuard("admin");
  const billing = useApi<BillingDto>(ready ? "/billing" : null);
  const { busy, error, run } = useAction();
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!ready || billing.loading) return <Loading />;
  const b = billing.data;
  if (!b) {
    return (
      <ConsoleScreen narrow>
        <H1>Plan and billing</H1>
        <ErrorText>{billing.error?.message}</ErrorText>
      </ConsoleScreen>
    );
  }
  const s = standing(b);
  const post = (path: string, body?: unknown) =>
    run(async () => {
      billing.setData(await api<BillingDto>(path, { method: path === "/billing/contact" ? "PUT" : "POST", body }));
      setEditingEmail(false);
      setConfirmCancel(false);
    });

  return (
    <ConsoleScreen narrow>
      <H1 sub="Only organization administrators see this. Billing is separate from discipler approval.">Plan and billing</H1>
      <ErrorText>{error}</ErrorText>

      {b.status === "grace" && (
        <section className="mb-4 rounded-card border border-danger-line bg-danger-soft p-5">
          <p className="text-[17px] font-bold text-danger">Payment needed by {fmtDate(b.graceUntil)}</p>
          <p className="mt-1 text-[15px] text-ink">
            The last renewal was not paid. Everything keeps working until then. After that your organization returns to Basic: nothing is deleted and nobody already in loses access.
          </p>
          <div className="mt-3">
            <LinkButton href="/admin/billing/change">Pay now</LinkButton>
          </div>
        </section>
      )}

      {!b.onlinePayments && b.status !== "granted" && (
        <Card tone="soft" className="mb-4">
          <p className="text-[15px] text-ink">Online payment is being set up. To move to Standard now, <a className="font-semibold text-brand underline" href="/admin/billing/talk?plan=pro">contact DaveUp</a>.</p>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[22px] font-extrabold text-ink">{planTitle(b.plan, b.extraBlocks)}</p>
            <p className="mt-1 text-[15px] text-ink-muted">{s.line}</p>
            {b.plan === "standard" && b.foundingUntil && b.status !== "free" && (
              <p className="mt-1 text-[14px] font-semibold text-ok">Founding price locked to {fmtDate(b.foundingUntil)}. List price {naira(100_000_00)} / month after that.</p>
            )}
            {b.nextChange && (
              <p className="mt-2 text-[14px] text-ink">
                Changes to <strong>{planTitle(b.nextChange.plan, b.nextChange.extraBlocks)}</strong>, paid {b.nextChange.interval === "year" ? "yearly" : "monthly"}, on {fmtDate(b.periodEnd)}.{" "}
                <button className="font-semibold text-brand underline" disabled={busy} onClick={() => void post("/billing/resume")}>
                  Keep the current plan
                </button>
              </p>
            )}
          </div>
          <Pill tone={s.tone}>{s.pill}</Pill>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton href="/admin/billing/change">{b.status === "free" ? "Choose a plan" : "Change plan"}</LinkButton>
          {b.status === "canceling" && (
            <Button variant="secondary" disabled={busy} onClick={() => void post("/billing/resume")}>
              Keep my plan
            </Button>
          )}
          {b.status === "active" && !confirmCancel && (
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmCancel(true)}>
              Cancel renewal
            </Button>
          )}
        </div>
        {confirmCancel && (
          <div className="mt-4 rounded-[12px] border border-surface-line bg-surface p-4">
            <p className="text-[15px] text-ink">
              {PLAN_NAME[b.plan]} stays until {fmtDate(b.periodEnd)}, then your organization moves to Basic. Nothing is deleted, and everyone already in keeps their access.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="danger" disabled={busy} onClick={() => void post("/billing/cancel")}>
                Cancel renewal
              </Button>
              <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-1">What you are using</Eyebrow>
        <div className="divide-y divide-surface-line">
          <UsageBar label="Disciples" used={b.usage.disciples} limit={b.limits.disciples} />
          <UsageBar label="Approved disciplers" used={b.usage.disciplers} limit={b.limits.disciplers} />
          <UsageBar label="Cells" used={b.usage.cells} limit={b.limits.cells} />
        </div>
        <p className="mt-2 text-[14px] text-ink-muted">
          At a limit, no more can be added until you add capacity or change plan. Nobody already in DaveUp is affected. Extra capacity is {naira(30_000_00)} a month for 3 disciplers, 36 disciples and 3 cells.
        </p>
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-1">Payment details</Eyebrow>
        <div className="divide-y divide-surface-line">
          <div className="py-3">
            <p className="text-[15px] font-semibold text-ink">Billing email</p>
            {editingEmail ? (
              <form
                className="mt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void post("/billing/contact", { email });
                }}
              >
                <Field label="Receipts and payment notices go here">
                  <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@yourchurch.org" autoFocus />
                </Field>
                <div className="flex gap-3">
                  <Button type="submit" disabled={busy}>
                    Save
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingEmail(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-0.5 text-[14px] text-ink-muted">
                {b.billingEmail ?? (me!.person.email ? `${me!.person.email} (your email)` : "Not set")}{" "}
                <button
                  className="ml-1 font-semibold text-brand underline"
                  onClick={() => {
                    setEmail(b.billingEmail ?? me!.person.email ?? "");
                    setEditingEmail(true);
                  }}
                >
                  Change
                </button>
              </p>
            )}
          </div>
          <div className="py-3">
            <p className="text-[15px] font-semibold text-ink">Renewals</p>
            <p className="mt-0.5 text-[14px] text-ink-muted">
              {b.card ? (
                <>
                  Charged automatically to {b.card}.{" "}
                  <button className="ml-1 font-semibold text-brand underline" disabled={busy} onClick={() => void post("/billing/remove-card")}>
                    Remove card
                  </button>
                </>
              ) : (
                "No saved card. Pay by card to renew automatically; with bank transfer or USSD we email you before each renewal."
              )}
            </p>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-2">If a payment fails</Eyebrow>
        <ol className="space-y-2 text-[15px] text-ink">
          <li>
            <strong>Day 0.</strong> You are told by email, and we retry the card each day.
          </li>
          <li>
            <strong>Days 1 to {GRACE_DAYS}.</strong> Grace period. Everything keeps working.
          </li>
          <li>
            <strong>Day {GRACE_DAYS + 1} on.</strong> Your organization returns to Basic. No new disciples, disciplers or cells beyond the Basic limits. People already in keep their access, and assessments, care and approvals keep working.
          </li>
          <li>
            <strong>Always.</strong> Nothing is deleted, and nobody is locked out of their own journal.
          </li>
        </ol>
      </Card>

      <Card className="mb-6">
        <Eyebrow className="mb-1">Payments</Eyebrow>
        {b.payments.length === 0 ? (
          <p className="py-2 text-[15px] text-ink-muted">Receipts appear here after your first payment.</p>
        ) : (
          <div className="divide-y divide-surface-line">
            {b.payments.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {planTitle(p.plan, p.extraBlocks)}, {p.interval === "year" ? "yearly" : "monthly"}
                    {p.kind === "renewal" ? " renewal" : ""}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    {fmtDate(p.paidAt ?? p.createdAt)}
                    {p.channel ? ` · ${CHANNEL[p.channel] ?? p.channel}` : ""}
                    {p.status === "success" && p.periodEnd ? ` · to ${fmtDate(p.periodEnd)}` : ""}
                    {p.status === "failed" && p.failure ? ` · ${p.failure}` : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-ink-faint">{p.reference}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-bold text-ink">{naira(p.amountKobo)}</p>
                  <Pill tone={STATUS_TONE[p.status]}>{STATUS_TEXT[p.status]}</Pill>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[13px] text-ink-muted">Prices are in Naira. Need a tax invoice? Reply to any receipt email.</p>
      </Card>

      <p className="text-[14px] text-ink-muted">
        Pro, Network and larger organizations:{" "}
        <a className="font-semibold text-brand underline" href="/admin/billing/talk?plan=pro">
          talk to us
        </a>
        . Prices are reviewed every 6 months.
      </p>
    </ConsoleScreen>
  );
}
