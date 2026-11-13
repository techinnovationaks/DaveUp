"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeDto } from "@daveup/shared";
import type { ReactNode } from "react";
import { Button, ErrorText, Field, H1, Loading, AuthScreen, Screen, TopBar, inputClass } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { nextStep, useSession } from "@/lib/session";
import { ConsoleScreen } from "@/components/ConsoleShell";

export default function Profile() {
  const router = useRouter();
  const { me, loading, reload } = useSession();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!loading && !me) router.replace("/signin");
    if (me) {
      setFullName(me.person.fullName ?? "");
      setEmail(me.person.email ?? "");
    }
  }, [loading, me, router]);

  if (!me) return <Loading />;
  // Onboarding uses the sign-in layout; editing later happens inside the app.
  // Administrators edit inside the Church console.
  const editing = me.membership?.status === "approved";
  const admin = editing && !!me.membership?.isAdmin;
  const back = admin ? "/admin/settings" : "/account";
  const Wrap = !editing
    ? AuthScreen
    : admin
      ? ({ children }: { children: ReactNode }) => <ConsoleScreen narrow>{children}</ConsoleScreen>
      : ({ children }: { children: ReactNode }) => <Screen narrow>{children}</Screen>;

  const save = () =>
    run(async () => {
      const updated = await api<MeDto>("/me", { method: "PATCH", body: { fullName, email } });
      await reload();
      router.replace(editing ? back : nextStep(updated));
    });

  return (
    <Wrap>
      <TopBar title={editing ? "Your profile" : "Create your account"} back={editing ? back : undefined} />
      <form onSubmit={(e) => (e.preventDefault(), void save())}>
        <H1 sub="This is how your church and your discipler will know you.">{editing ? "Your profile" : "About you"}</H1>
        <Field label="Full name">
          <input className={inputClass} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email (optional)" hint="Used for account recovery and the weekly summary.">
          <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || fullName.trim().length < 2}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </Wrap>
  );
}
