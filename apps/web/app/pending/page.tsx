"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, H1, Loading, AuthScreen } from "@/components/ui";
import { nextStep, useSession } from "@/lib/session";
import { useAction } from "@/lib/api";
import { switchOrganization } from "@/components/OrgSwitcher";
import type { MeDto } from "@daveup/shared";

/** Other organizations the person belongs to, to carry on there meanwhile. */
function Elsewhere({ me }: { me: MeDto }) {
  const others = me.memberships.filter((m) => m.churchId !== me.membership?.churchId && m.status === "approved" && !m.suspended);
  if (!others.length) return null;
  return (
    <div className="mt-8">
      <p className="mb-2 text-[14px] font-semibold text-ink-muted">Meanwhile, go to</p>
      <div className="space-y-2">
        {others.map((m) => (
          <button key={m.churchId} onClick={() => void switchOrganization(m.churchId)} className="flex w-full items-center justify-between rounded-2xl border border-surface-line bg-card px-4 py-3 text-left hover:border-brand-line">
            <span>
              <span className="block text-[16px] font-bold text-ink">{m.churchName}</span>
              <span className="text-[14px] text-ink-muted">{m.churchCity}</span>
            </span>
            <span className="text-[14px] font-semibold text-brand">Open</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Pending() {
  const { me, loading, reload } = useSession();
  const router = useRouter();
  const { busy, run } = useAction();
  const step = nextStep(me);

  useEffect(() => {
    if (!loading && step !== "/pending") router.replace(step);
  }, [loading, step, router]);

  if (loading || step !== "/pending" || !me?.membership) return <Loading />;

  if (me.membership.churchStatus === "suspended") {
    return (
      <AuthScreen>
        <H1 sub="DaveUp has paused access for your organization. Your data is safe and nothing has been deleted.">Access paused</H1>
        <Card className="mb-6">
          <p className="text-[14px] text-ink-muted">Your organization</p>
          <p className="mt-1 text-[20px] font-extrabold text-ink">{me.membership.churchName}</p>
          <p className="text-[15px] text-ink-muted">{me.membership.churchCity}</p>
          <p className="mt-4 text-[15px] text-ink">Please speak with your organization administrator. They have been sent the details by email.</p>
        </Card>
        <Button variant="secondary" disabled={busy} onClick={() => run(reload)}>
          {busy ? "Checking…" : "Check again"}
        </Button>
        <Elsewhere me={me} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <H1 sub="Your organization administrator needs to approve you before you can start.">Waiting for approval</H1>
      <Card className="mb-6">
        <p className="text-[14px] text-ink-muted">Request sent to</p>
        <p className="mt-1 text-[20px] font-extrabold text-ink">{me.membership.churchName}</p>
        <p className="text-[15px] text-ink-muted">{me.membership.churchCity}</p>
      </Card>
      <Button variant="secondary" disabled={busy} onClick={() => run(reload)}>
        {busy ? "Checking…" : "Check again"}
      </Button>
      <Elsewhere me={me} />
    </AuthScreen>
  );
}
