"use client";
import { useState } from "react";
import type { MeDto } from "@daveup/shared";
import { Button, ErrorText, Field, Pill, inputClass } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Show, add or change the account email. A new address only takes effect once
 * the code sent to it is entered, so nobody can claim an email they do not own.
 */
export function EmailSettings({ me }: { me: MeDto }) {
  const { reload } = useSession();
  const [stage, setStage] = useState<"view" | "enter" | "code">("view");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  const current = me.person.email;

  const send = () =>
    run(async () => {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter a valid email address");
      await api("/me/email/request", { method: "POST", body: { email } });
      setCode("");
      setStage("code");
    });
  const confirm = () =>
    run(async () => {
      await api<MeDto>("/me/email/verify", { method: "POST", body: { email, code } });
      await reload();
      setStage("view");
      setDone(true);
    });

  if (stage === "view") {
    return (
      <div>
        <p className="mb-1.5 text-[14px] font-semibold text-ink">Email</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[16px] text-ink">{current ?? <span className="text-ink-muted">No email yet</span>}</p>
          {current && (me.person.emailVerified ? <Pill tone="green">Verified</Pill> : <Pill tone="amber">Not verified</Pill>)}
          <button type="button" onClick={() => (setDone(false), setError(null), setEmail(""), setStage("enter"))} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-brand hover:bg-brand-soft">
            {current ? "Change" : "Add email"}
          </button>
        </div>
        {done && <p className="mt-2 text-[14px] font-semibold text-ok">Email confirmed. You can sign in with it.</p>}
        {!current && <p className="mt-1 text-[13px] text-ink-muted">Add an email to sign in with it and get notifications.</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      {stage === "enter" ? (
        <>
          <Field label={current ? "New email address" : "Email address"}>
            <input className={inputClass} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-col gap-2 md:flex-row md:gap-3">
            <Button type="button" disabled={busy || email.trim().length < 5} onClick={send}>
              {busy ? "Sending…" : "Send code"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStage("view")}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-ink-muted">We sent a 6-digit code to {email.trim().toLowerCase()}. It expires in 10 minutes.</p>
          <Field label="6-digit code">
            <input className={`${inputClass} text-center text-[22px] tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-col gap-2 md:flex-row md:gap-3">
            <Button type="button" disabled={busy || code.length !== 6} onClick={confirm}>
              {busy ? "Checking…" : "Confirm"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStage("enter")}>
              Back
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Email notifications on or off. Only meaningful with a verified email. */
export function NotifyToggle({ me }: { me: MeDto }) {
  const { reload } = useSession();
  const { busy, error, run } = useAction();
  // Flip at once; roll back if saving fails.
  const [on, setOn] = useState(me.person.notifyEmail);
  const usable = !!me.person.email && me.person.emailVerified;
  const change = (next: boolean) =>
    run(async () => {
      setOn(next);
      try {
        await api("/me", { method: "PATCH", body: { notifyEmail: next } });
        await reload();
      } catch (e) {
        setOn(!next);
        throw e;
      }
    });
  return (
    <div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          className="mt-1 h-5 w-5 shrink-0 accent-brand"
          checked={on}
          disabled={busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          <span className="block text-[16px] font-semibold text-ink">Email notifications</span>
          <span className="block text-[14px] text-ink-muted">
            {usable
              ? `Requests, approvals, plans, meetings and checks, sent to ${me.person.email}. Never your answers or scores.`
              : "Add and confirm an email in your profile to get notifications."}
          </span>
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
