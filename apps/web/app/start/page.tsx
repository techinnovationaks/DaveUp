"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, H1, LinkButton, Loading, AuthScreen } from "@/components/ui";
import { nextStep, useSession } from "@/lib/session";

export default function Start() {
  const { me, loading } = useSession();
  const router = useRouter();
  const step = nextStep(me);

  useEffect(() => {
    if (!loading && step !== "/start") router.replace(step);
  }, [loading, step, router]);

  if (loading || step !== "/start") return <Loading />;

  return (
    <AuthScreen>
      <H1 sub="DaveUp is provided through your local church.">Find your church</H1>
      <Card className="mb-4">
        <p className="text-[17px] font-bold text-ink">Join your church</p>
        <p className="mb-4 mt-1 text-[15px] text-ink-muted">Use the church code from your church office, bulletin or an invite.</p>
        <LinkButton href="/join">I have a church code</LinkButton>
      </Card>
      <Card>
        <p className="text-[17px] font-bold text-ink">Register your church</p>
        <p className="mb-4 mt-1 text-[15px] text-ink-muted">For pastors and church administrators setting DaveUp up for the first time. You become its administrator.</p>
        <LinkButton href="/register-church" variant="secondary">
          Register a church
        </LinkButton>
      </Card>
    </AuthScreen>
  );
}
