"use client";
// Paystack sends the administrator back here with ?reference=... after paying
// (or cancelling). We ask the API to confirm the payment with Paystack.
import { useEffect, useState } from "react";
import { PLAN_NAME, type BillingVerifyDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Card, H1, LinkButton, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useGuard } from "@/lib/session";

const CHECKS = 12; // about a minute of checking for slower methods like bank transfer

export default function PaymentReturn() {
  const { ready } = useGuard("admin");
  const [result, setResult] = useState<BillingVerifyDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(window.location.search);
    const reference = q.get("reference") || q.get("trxref");
    if (!reference) {
      setError("No payment reference was given.");
      return;
    }
    let live = true;
    let n = 0;
    const check = async () => {
      try {
        const r = await api<BillingVerifyDto>("/billing/verify", { method: "POST", body: { reference } });
        if (!live) return;
        setResult(r);
        if (r.status === "pending" && ++n < CHECKS) setTimeout(check, 5_000);
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : "We could not check the payment. Your plan will update as soon as Paystack confirms it.");
      }
    };
    void check();
    return () => {
      live = false;
    };
  }, [ready]);

  if (!ready || (!result && !error)) return <Loading />;

  const ok = result?.status === "success";
  const waiting = result?.status === "pending";
  return (
    <ConsoleScreen narrow>
      <H1>{ok ? "Thank you" : waiting ? "Waiting for Paystack" : "Payment not completed"}</H1>
      <Card className="mb-6">
        {ok && <p className="mb-2 text-[20px] font-extrabold text-ok">You are on {PLAN_NAME[result!.plan]}</p>}
        <p className="text-[16px] text-ink">{error ?? result!.message}</p>
        {waiting && <p className="mt-2 text-[14px] text-ink-muted">This page checks again by itself. You can also leave it; we will email you when it is confirmed.</p>}
      </Card>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/admin/billing">Back to billing</LinkButton>
        {!ok && !waiting && (
          <LinkButton href="/admin/billing/change" variant="secondary">
            Try again
          </LinkButton>
        )}
      </div>
    </ConsoleScreen>
  );
}
