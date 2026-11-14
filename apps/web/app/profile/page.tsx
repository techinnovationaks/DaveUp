"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeDto } from "@daveup/shared";
import { AuthScreen, Button, Card, ErrorText, Field, H1, Loading, Screen, TopBar, inputClass } from "@/components/ui";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { EmailSettings } from "@/components/EmailSettings";
import { api, useAction } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { nextStep, useSession } from "@/lib/session";

export default function Profile() {
  const router = useRouter();
  const { me, loading, reload } = useSession();
  const [fullName, setFullName] = useState("");
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!loading && !me) router.replace("/signin");
    if (me) setFullName(me.person.fullName ?? "");
  }, [loading, me, router]);

  if (!me) return <Loading />;
  // Onboarding uses the sign-in layout; editing later happens inside the app,
  // and administrators edit inside the Church console.
  const editing = me.membership?.status === "approved";
  const admin = editing && !!me.membership?.isAdmin;
  const back = admin ? "/admin/settings" : "/account";

  const save = () =>
    run(async () => {
      const updated = await api<MeDto>("/me", { method: "PATCH", body: { fullName } });
      await reload();
      router.replace(editing ? back : nextStep(updated));
    });

  const body = (
    <>
      <TopBar title={editing ? "Your profile" : "Create your account"} back={editing ? back : undefined} />
      <form onSubmit={(e) => (e.preventDefault(), void save())}>
        <H1 sub="This is how your church and your discipler will know you.">{editing ? "Your profile" : "About you"}</H1>
        <Field label="Full name">
          <input className={inputClass} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || fullName.trim().length < 2}>
          {busy ? "Saving…" : editing ? "Save" : "Continue"}
        </Button>
      </form>

      {/* Email is changed separately: it needs a code sent to the new address. */}
      <Card className="mt-6">
        <EmailSettings me={me} />
        {me.person.phone && (
          <div className="mt-4 border-t border-surface-line pt-4">
            <p className="mb-1 text-[14px] font-semibold text-ink">Phone</p>
            <p className="text-[16px] text-ink">{formatPhone(me.person.phone)}</p>
          </div>
        )}
      </Card>
    </>
  );

  // Choose the layout without defining components during render, so inputs keep focus while typing.
  if (!editing) return <AuthScreen>{body}</AuthScreen>;
  return admin ? <ConsoleScreen narrow>{body}</ConsoleScreen> : <Screen narrow>{body}</Screen>;
}
