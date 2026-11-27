"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, H1, LinkButton, Loading, AuthScreen } from "@/components/ui";
import { nextStep, useSession } from "@/lib/session";
import { takeJoinRedirect } from "@/components/OrgSwitcher";

export default function Start() {
  const { me, loading } = useSession();
  const router = useRouter();
  const step = nextStep(me);

  useEffect(() => {
    if (loading) return;
    // Signed in from an invite link: carry on to that organization.
    const invited = takeJoinRedirect(me);
    if (invited) router.replace(invited);
    else if (step !== "/start") router.replace(step);
  }, [loading, step, router, me]);

  if (loading || step !== "/start") return <Loading />;

  return (
    <AuthScreen>
      <H1 sub="DaveUp is provided through your organization.">Find your organization</H1>
      <Card className="mb-4">
        <p className="text-[17px] font-bold text-ink">Join your organization</p>
        <p className="mb-4 mt-1 text-[15px] text-ink-muted">Search by name or city, or use the code from your leaders, an invite link or a QR code.</p>
        <LinkButton href="/join">Find my organization</LinkButton>
      </Card>
      <Card>
        <p className="text-[17px] font-bold text-ink">Register your organization</p>
        <p className="mb-4 mt-1 text-[15px] text-ink-muted">For leaders and administrators setting DaveUp up for the first time. You become its administrator.</p>
        <LinkButton href="/register-church" variant="secondary">
          Register an organization
        </LinkButton>
      </Card>
    </AuthScreen>
  );
}
