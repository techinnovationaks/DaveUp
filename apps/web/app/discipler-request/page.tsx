"use client";
import { MAX_ACTIVE_DISCIPLES } from "@daveup/shared";
import { Button, Card, ErrorText, H1, LinkButton, Loading, Screen, TopBar } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";

export default function DisciplerRequest() {
  const { me, ready } = useGuard();
  const { reload } = useSession();
  const { busy, error, run } = useAction();

  if (!ready || !me) return <Loading />;

  const status = me.disciplerStatus;

  return (
    <Screen narrow>
      <TopBar back="/home" title="Discipler status" />
      <H1 sub="Your organization administrator approves every discipler.">Disciple others</H1>
      <Card className="mb-6">
        <ul className="list-disc space-y-2 pl-5 text-[15px] text-ink">
          <li>You can walk with up to {MAX_ACTIVE_DISCIPLES} disciples at a time.</li>
          <li>You complete a 12-area assessment about each disciple.</li>
          <li>You see only what each disciple chooses to share. Journals stay private.</li>
          <li>You keep your own discipler and your own growth record.</li>
        </ul>
      </Card>
      <ErrorText>{error}</ErrorText>
      {status === "requested" ? (
        <Card tone="soft">
          <p className="text-[16px] font-semibold text-ink">Request sent. Your administrator will review it.</p>
        </Card>
      ) : status === "approved" ? (
        <LinkButton href="/home">You are approved. Go to My disciples</LinkButton>
      ) : (
        <Button
          disabled={busy || status === "suspended"}
          onClick={() =>
            run(async () => {
              await api("/discipler-status/request", { method: "POST" });
              await reload();
            })
          }
        >
          {busy ? "Sending…" : status === "rejected" ? "Ask again" : "Ask for discipler status"}
        </Button>
      )}
    </Screen>
  );
}
