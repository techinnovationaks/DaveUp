"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalisePhone } from "@daveup/shared";
import { Button, ErrorText, Field, H1, AuthScreen, Loading, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { nextStep, useSession } from "@/lib/session";
import type { MeDto } from "@daveup/shared";

/**
 * Sign in. While no message service is set up the API switches codes off and
 * people sign in with their phone number alone; once SMS is configured the
 * code step comes back automatically.
 */
export default function SignIn() {
  const router = useRouter();
  const { reload } = useSession();
  const methods = useApi<{ otp: boolean }>("/auth/methods");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const { busy, error, setError, run } = useAction();

  if (methods.loading) return <Loading />;
  const otp = methods.data?.otp ?? true;

  const goOn = async () => {
    await reload();
    const me = await api<MeDto>("/me");
    router.replace(nextStep(me));
  };

  const submitPhone = () =>
    run(async () => {
      if (!normalisePhone(phone)) throw new Error("Enter your phone number, for example 0803 000 0000");
      if (!otp) {
        await api("/auth/phone", { method: "POST", body: { phone } });
        return goOn();
      }
      await api("/auth/otp/request", { method: "POST", body: { phone } });
      setStage("code");
      setCode("");
    });

  const verify = () =>
    run(async () => {
      await api("/auth/otp/verify", { method: "POST", body: { phone, code } });
      await goOn();
    });

  return (
    <AuthScreen>
      <TopBar back={stage === "code" ? true : "/"} />
      {stage === "phone" ? (
        <form onSubmit={(e) => (e.preventDefault(), void submitPhone())}>
          <H1 sub={otp ? "We will send a 6-digit code by text message." : "Enter the phone number you use with your church."}>Sign in with your phone</H1>
          <Field label="Phone number">
            <input className={inputClass} inputMode="tel" autoComplete="tel" placeholder="0803 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
          </Field>
          <ErrorText>{error ?? methods.error?.message}</ErrorText>
          <Button type="submit" disabled={busy || phone.trim().length < 7}>
            {busy ? (otp ? "Sending…" : "Signing in…") : otp ? "Send code" : "Continue"}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => (e.preventDefault(), void verify())}>
          <H1 sub={`Enter the code sent to ${normalisePhone(phone)}. It expires in 5 minutes.`}>Enter your code</H1>
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
          <Button type="button" variant="ghost" className="mt-2" disabled={busy} onClick={() => (setError(null), void submitPhone())}>
            Send a new code
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
