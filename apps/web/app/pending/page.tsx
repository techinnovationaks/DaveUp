"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, H1, Loading, AuthScreen } from "@/components/ui";
import { nextStep, useSession } from "@/lib/session";
import { useAction } from "@/lib/api";

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
        <H1 sub="DaveUp has paused access for your church. Your data is safe and nothing has been deleted.">Access paused</H1>
        <Card className="mb-6">
          <p className="text-[14px] text-ink-muted">Your church</p>
          <p className="mt-1 text-[20px] font-extrabold text-ink">{me.membership.churchName}</p>
          <p className="text-[15px] text-ink-muted">{me.membership.churchCity}</p>
          <p className="mt-4 text-[15px] text-ink">Please speak with your church administrator. They have been sent the details by email.</p>
        </Card>
        <Button variant="secondary" disabled={busy} onClick={() => run(reload)}>
          {busy ? "Checking…" : "Check again"}
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <H1 sub="Your church administrator needs to approve you before you can start.">Waiting for approval</H1>
      <Card className="mb-6">
        <p className="text-[14px] text-ink-muted">Request sent to</p>
        <p className="mt-1 text-[20px] font-extrabold text-ink">{me.membership.churchName}</p>
        <p className="text-[15px] text-ink-muted">{me.membership.churchCity}</p>
      </Card>
      <Button variant="secondary" disabled={busy} onClick={() => run(reload)}>
        {busy ? "Checking…" : "Check again"}
      </Button>
    </AuthScreen>
  );
}
