"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalisePhone, type AuthMethodsDto, type MeDto } from "@daveup/shared";
import { AuthScreen, Button, ErrorText, Field, H1, Loading, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { nextStep, useSession } from "@/lib/session";

type Method = "email" | "phone";
type Stage = "enter" | "code";

/**
 * Sign up and sign in. Email is the default: a 6-digit code by email, no
 * password. Phone is the alternative; it asks for a code only once an SMS
 * service is configured.
 */
export default function SignIn() {
  const router = useRouter();
  const { reload } = useSession();
  const methods = useApi<AuthMethodsDto>("/auth/methods");
  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<Stage>("enter");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, setError, run } = useAction();

  if (methods.loading) return <Loading />;
  const phoneOtp = methods.data?.phoneOtp ?? true;

  const goOn = async () => {
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
      if (method === "email") {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter your email address, for example ada@example.com");
        await api("/auth/email/request", { method: "POST", body: { email } });
      } else {
        if (!normalisePhone(phone)) throw new Error("Enter your phone number, for example 0803 000 0000");
        if (!phoneOtp) {
          await api("/auth/phone", { method: "POST", body: { phone } });
          return goOn();
        }
        await api("/auth/otp/request", { method: "POST", body: { phone } });
      }
      setStage("code");
      setCode("");
    });

  const verify = () =>
    run(async () => {
      if (method === "email") await api("/auth/email/verify", { method: "POST", body: { email, code } });
      else await api("/auth/otp/verify", { method: "POST", body: { phone, code } });
      await goOn();
    });

  if (stage === "code") {
    const where = method === "email" ? email.trim().toLowerCase() : normalisePhone(phone);
    return (
      <AuthScreen>
        <TopBar back={true} />
        <form onSubmit={(e) => (e.preventDefault(), void verify())}>
          <H1 sub={`We sent a 6-digit code to ${where}. It expires in ${method === "email" ? "10" : "5"} minutes.${method === "email" ? " Check your spam folder if you cannot see it." : ""}`}>Enter your code</H1>
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
            {busy ? "Checking…" : "Continue"}
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

  return (
    <AuthScreen>
      <TopBar back="/" />
      <form onSubmit={(e) => (e.preventDefault(), void sendCode())}>
        {method === "email" ? (
          <>
            <H1 sub="We will email you a 6-digit code. New here? The same step creates your account.">Sign in with your email</H1>
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
                autoFocus
              />
            </Field>
          </>
        ) : (
          <>
            <H1 sub={phoneOtp ? "We will send a 6-digit code by text message." : "Enter the phone number you use with your church."}>Sign in with your phone</H1>
            <Field label="Phone number">
              <input className={inputClass} inputMode="tel" autoComplete="tel" placeholder="0803 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </Field>
          </>
        )}
        <ErrorText>{error ?? methods.error?.message}</ErrorText>
        <Button type="submit" disabled={busy || (method === "email" ? email.trim().length < 5 : phone.trim().length < 7)}>
          {busy ? "Sending…" : method === "phone" && !phoneOtp ? "Continue" : "Send code"}
        </Button>
      </form>
      <div className="mt-6 border-t border-surface-line pt-5 text-center">
        <button type="button" onClick={() => switchTo(method === "email" ? "phone" : "email")} className="text-[15px] font-semibold text-ink hover:text-brand">
          {method === "email" ? "Use phone number instead" : "Use email instead"}
        </button>
      </div>
    </AuthScreen>
  );
}
