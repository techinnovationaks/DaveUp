"use client";
import Link from "next/link";
import type { AdminOverviewDto } from "@daveup/shared";
import { ConsoleScreen, useSignOut } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, Eyebrow, H1, Loading, Row } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { contactsOf } from "@/lib/labels";
import { useGuard } from "@/lib/session";
import { NotifyToggle } from "@/components/EmailSettings";

/** Show or hide the organization in the public organization search. */
function ListingToggle() {
  const church = useApi<{ listed: boolean }>("/church");
  const { busy, error, run } = useAction();
  if (!church.data) return null;
  const listed = church.data.listed;
  const toggle = () =>
    run(async () => {
      const r = await api<{ listed: boolean }>("/church/listing", { method: "PUT", body: { listed: !listed } });
      church.setData({ ...church.data!, listed: r.listed });
    });
  return (
    <div className="mt-3 flex items-start gap-4 border-t border-surface-line pt-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">Show in organization search</p>
        <p className="text-[14px] text-ink-muted">
          {listed ? "People can find your organization by name or city and ask to join. You still approve everyone." : "Hidden from search. People join with your code, invite link or QR code."}
        </p>
        {error && <p className="mt-1 text-[14px] text-danger">{error}</p>}
      </div>
      <button
        role="switch"
        aria-checked={listed}
        aria-label="Show in organization search"
        disabled={busy}
        onClick={() => void toggle()}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${listed ? "bg-brand" : "bg-surface-line"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${listed ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

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
          <ListingToggle />
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
