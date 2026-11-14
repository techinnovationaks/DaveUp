"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalisePhone, type AuthMethodsDto, type MeDto } from "@daveup/shared";
import { AuthScreen, Button, ErrorText, Field, H1, LinkButton, Loading, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { nextStep, useSession } from "@/lib/session";

type Mode = "signin" | "signup";
type Method = "email" | "phone";
type Stage = "enter" | "code";

/**
 * Sign in and sign up. Both use a 6-digit code (no password): email by
 * default, phone as the alternative. Sign-up also asks for your name, so the
 * next step is finding your church.
 */
export function AuthFlow({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { reload } = useSession();
  const methods = useApi<AuthMethodsDto>("/auth/methods");
  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<Stage>("enter");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, setError, run } = useAction();

  if (methods.loading) return <Loading />;
  const phoneOtp = methods.data?.phoneOtp ?? true;
  const signup = mode === "signup";

  type SignedIn = { isNew: boolean; needsProfile: boolean };
  const goOn = async (r: SignedIn) => {
    // Save the name given on the sign-up form (an existing account keeps its name).
    if (signup && r.needsProfile && fullName.trim().length >= 2) {
      await api("/me", { method: "PATCH", body: { fullName: fullName.trim() } });
    }
    await reload();
    const me = await api<MeDto>("/me");
    router.replace(nextStep(me));
  };

  const switchTo = (m: Method) => {
    setMethod(m);
    setStage("enter");
    setCode("");
    setError(null);
  };

  const sendCode = () =>
    run(async () => {
      if (signup && fullName.trim().length < 2) throw new Error("Enter your full name");
      if (method === "email") {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter your email address, for example ada@example.com");
        await api("/auth/email/request", { method: "POST", body: { email } });
      } else {
        if (!normalisePhone(phone)) throw new Error("Enter your phone number, for example 0803 000 0000");
        if (!phoneOtp) return goOn(await api<SignedIn>("/auth/phone", { method: "POST", body: { phone } }));
        await api("/auth/otp/request", { method: "POST", body: { phone } });
      }
      setStage("code");
      setCode("");
    });

  const verify = () =>
    run(async () => {
      const r =
        method === "email"
          ? await api<SignedIn>("/auth/email/verify", { method: "POST", body: { email, code } })
          : await api<SignedIn>("/auth/otp/verify", { method: "POST", body: { phone, code } });
      await goOn(r);
    });

  if (stage === "code") {
    const where = method === "email" ? email.trim().toLowerCase() : normalisePhone(phone);
    return (
      <AuthScreen>
        <TopBar back={true} />
        <form onSubmit={(e) => (e.preventDefault(), void verify())}>
          <H1 sub={`We sent a 6-digit code to ${where}. It expires in ${method === "email" ? "10" : "5"} minutes.${method === "email" ? " Check your spam folder if you cannot see it." : ""}`}>
            Enter your code
          </H1>
          <Field label="6-digit code">
            <input
              className={`${inputClass} text-center text-[24px] tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : signup ? "Create account" : "Sign in"}
          </Button>
          <Button type="button" variant="ghost" className="mt-2" disabled={busy} onClick={() => (setError(null), void sendCode())}>
            Send a new code
          </Button>
          <Button type="button" variant="ghost" className="mt-1" disabled={busy} onClick={() => switchTo(method)}>
            {method === "email" ? "Use a different email" : "Use a different number"}
          </Button>
        </form>
      </AuthScreen>
    );
  }

  const valid = (method === "email" ? email.trim().length >= 5 : phone.trim().length >= 7) && (!signup || fullName.trim().length >= 2);

  return (
    <AuthScreen>
      <TopBar back="/" />
      <form onSubmit={(e) => (e.preventDefault(), void sendCode())}>
        <H1
          sub={
            signup
              ? method === "email"
                ? "Join your church on DaveUp. We will email you a 6-digit code to confirm it is you."
                : phoneOtp
                  ? "Join your church on DaveUp. We will text you a 6-digit code to confirm it is you."
                  : "Join your church on DaveUp with your phone number."
              : method === "email"
                ? "Enter your email and we will send you a 6-digit code."
                : phoneOtp
                  ? "Enter your phone number and we will text you a 6-digit code."
                  : "Enter the phone number you use with your church."
          }
        >
          {signup ? "Create your account" : "Sign in"}
        </H1>
        {signup && (
          <Field label="Full name">
            <input className={inputClass} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </Field>
        )}
        {method === "email" ? (
          <Field label="Email address">
            <input
              className={inputClass}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!signup}
            />
          </Field>
        ) : (
          <Field label="Phone number">
            <input className={inputClass} inputMode="tel" autoComplete="tel" placeholder="0803 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus={!signup} />
          </Field>
        )}
        <ErrorText>{error ?? methods.error?.message}</ErrorText>
        <Button type="submit" disabled={busy || !valid}>
          {busy ? "Sending…" : method === "phone" && !phoneOtp ? (signup ? "Create account" : "Sign in") : "Send code"}
        </Button>
        <button type="button" onClick={() => switchTo(method === "email" ? "phone" : "email")} className="mt-3 w-full py-2 text-center text-[15px] font-semibold text-ink-muted hover:text-brand">
          {method === "email" ? "Use phone number instead" : "Use email instead"}
        </button>
      </form>

      <div className="mt-6 border-t border-surface-line pt-6 text-center">
        {signup ? (
          <p className="text-[15px] text-ink-muted">
            Already have an account?{" "}
            <Link href="/signin" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        ) : (
          <>
            <p className="mb-3 text-[15px] text-ink-muted">New to DaveUp?</p>
            <LinkButton href="/signup" variant="secondary">
              Create an account
            </LinkButton>
          </>
        )}
      </div>
    </AuthScreen>
  );
}
