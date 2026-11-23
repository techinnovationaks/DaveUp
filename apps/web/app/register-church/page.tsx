"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Participation } from "@daveup/shared";
import { Button, Card, ErrorText, Field, H1, AuthScreen, Loading, TopBar, inputClass } from "@/components/ui";
import { ParticipationPicker } from "@/components/ParticipationPicker";
import { api, useAction } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Registered {
  church: { id: string; name: string; city: string; joinCode: string; status: string };
}

export default function RegisterChurch() {
  const router = useRouter();
  const { me, loading, reload } = useSession();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [done, setDone] = useState<Registered | null>(null);
  const { busy, error, run } = useAction();

  const submit = () =>
    run(async () => {
      setDone(await api<Registered>("/churches", { method: "POST", body: { name: name.trim(), city: city.trim(), participation } }));
      await reload();
    });

  // The homepage's "Create an organization" links here; signed-out visitors create an account first.
  useEffect(() => {
    if (!loading && !me) router.replace("/signup");
  }, [loading, me, router]);

  if (loading || !me) return <Loading />;

  if (done) {
    return (
      <AuthScreen>
        <H1 sub="You are the administrator. Share this code so members can join.">Your church is set up</H1>
        <Card className="mb-4 text-center">
          <p className="text-[14px] text-ink-muted">{done.church.name}</p>
          <p className="mt-2 font-mono text-[34px] font-extrabold tracking-[0.25em] text-ink">{done.church.joinCode}</p>
          <p className="mt-2 text-[13px] text-ink-muted">Church code. You can find it later under Church.</p>
        </Card>
        <Card tone="soft" className="mb-6">
          <p className="text-[15px] text-ink">
            DaveUp will verify your church before it appears in the church directory. Members with your code can join in the meantime.
          </p>
        </Card>
        <Button onClick={() => router.replace("/admin")}>Open the church console</Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <TopBar back="/start" title="Register your church" />
      <form onSubmit={(e) => (e.preventDefault(), void submit())}>
        <H1 sub="Start on the free Basic plan. Paid plans can be added later.">About your church</H1>
        <Field label="Church name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="City">
          <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <ParticipationPicker value={participation} onChange={setParticipation} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || name.trim().length < 3 || city.trim().length < 2 || !participation}>
          {busy ? "Registering…" : "Register church"}
        </Button>
      </form>
    </AuthScreen>
  );
}
