"use client";
import { useRouter } from "next/navigation";
import { Button, Card, H1, Loading, Row, Screen } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";
import { contactsOf } from "@/lib/labels";
import { NotifyToggle } from "@/components/EmailSettings";

const participationLabel = { grow: "I want to grow", disciple: "I disciple others", both: "Both" } as const;

export default function Account() {
  const router = useRouter();
  const { me, ready } = useGuard();
  const { reload } = useSession();
  const { busy, run } = useAction();

  if (!ready || !me) return <Loading />;
  const m = me.membership!;

  return (
    <Screen nav narrow>
      <H1>Account settings</H1>
      <Card className="mb-4">
        <div className="divide-y divide-surface-line">
          <Row href="/profile" title={me.person.fullName} sub={contactsOf(me.person) || "Add an email in your profile"} />
          <Row title={m.churchName} sub={`${m.churchCity}${m.department ? ` · ${m.department}` : ""}${m.isAdmin ? " · Administrator" : ""}`} />
          <Row title="How I use DaveUp" sub={participationLabel[m.participation]} />
          <Row
            href="/discipler-request"
            title="Discipler status"
            sub={me.disciplerStatus === "approved" ? "Approved" : me.disciplerStatus === "requested" ? "Waiting for approval" : "Not a discipler"}
          />
          {me.person.isSuperAdmin && <Row href="/staff" title="DaveUp staff console" sub="Organizations, verification and staff access" />}
        </div>
      </Card>
      <Card className="mb-4">
        <NotifyToggle me={me} />
      </Card>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await api("/auth/logout", { method: "POST" });
            await reload();
            router.replace("/");
          })
        }
      >
        Sign out
      </Button>
    </Screen>
  );
}
