"use client";
import Link from "next/link";
import type { AdminOverviewDto } from "@daveup/shared";
import { ConsoleScreen, useSignOut } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Eyebrow, H1, Loading, Row } from "@/components/ui";
import { useAction, useApi } from "@/lib/api";
import { contactsOf } from "@/lib/labels";
import { useGuard } from "@/lib/session";
import { NotifyToggle } from "@/components/EmailSettings";

export default function Settings() {
  const { me, ready } = useGuard("admin");
  const ov = useApi<AdminOverviewDto>(ready ? "/admin/overview" : null);
  const signOut = useSignOut();
  const { busy, run } = useAction();

  if (!ready || ov.loading) return <Loading />;
  const c = ov.data?.church;

  return (
    <ConsoleScreen narrow>
      <H1 sub="Your organization and your administrator account.">Settings</H1>
      <ErrorText>{ov.error?.message}</ErrorText>

      {c && (
        <Card className="mb-4">
          <Eyebrow className="mb-1">Organization</Eyebrow>
          <div className="divide-y divide-surface-line">
            <Row title={c.name} sub={c.city} />
            <Row title="Organization code" sub={<span className="font-mono font-bold tracking-[0.2em] text-ink">{c.joinCode}</span>} />
            <Row title="Verification" sub={c.status === "verified" ? "Verified by DaveUp" : c.status === "suspended" ? "Suspended" : "Waiting for DaveUp verification"} />
            <Row href="/admin/billing" title="Plan and billing" sub={<span className="capitalize">{c.plan}</span>} />
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <Eyebrow className="mb-1">Your account</Eyebrow>
        <div className="divide-y divide-surface-line">
          <Row href="/profile" title={me!.person.fullName} sub={contactsOf(me!.person)} />
          <Row title="Role" sub="Administrator" />
        </div>
        <div className="mt-3 border-t border-surface-line pt-4">
          <NotifyToggle me={me!} />
        </div>
      </Card>

      <Card className="mb-6">
        <Eyebrow className="mb-1">Member app</Eyebrow>
        <p className="mb-3 text-[14px] text-ink-muted">If you also disciple people or want to be discipled, use the member app. It is separate from the console.</p>
        <Link href="/home" className="text-[15px] font-semibold text-brand hover:underline">
          Open the member app
        </Link>
      </Card>

      <Button variant="secondary" disabled={busy} onClick={() => run(signOut)}>
        Sign out
      </Button>
    </ConsoleScreen>
  );
}
