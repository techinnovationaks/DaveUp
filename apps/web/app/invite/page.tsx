"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RelationshipDto } from "@daveup/shared";
import { Card, ErrorText, H1, Initials, Loading, Screen, TopBar, inputClass } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { useGuard } from "@/lib/session";

interface MemberHit {
  personId: string;
  fullName: string | null;
  department: string | null;
}

export default function Invite() {
  const router = useRouter();
  const { me, ready } = useGuard();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MemberHit[] | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      api<MemberHit[]>(`/members/search?q=${encodeURIComponent(term)}`).then(setHits, () => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!ready) return <Loading />;
  if (me?.disciplerStatus !== "approved") {
    return (
      <Screen>
        <TopBar back="/home" />
        <H1 sub="Only church-approved disciplers can invite someone.">Invite someone</H1>
      </Screen>
    );
  }

  const invite = (m: MemberHit) =>
    run(async () => {
      const r = await api<RelationshipDto>("/relationships", { method: "POST", body: { discipleId: m.personId } });
      router.replace(`/relationships/${r.id}`);
    });

  return (
    <Screen>
      <TopBar back="/home" title="Invite someone" />
      <H1 sub="They will be asked to accept. Nobody is added without agreeing.">Who would you like to disciple?</H1>
      <input className={`${inputClass} mb-4 md:max-w-md`} placeholder="Search members by name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ErrorText>{error}</ErrorText>
      {hits?.length === 0 && <p className="text-[15px] text-ink-muted">No approved members match that name.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {hits?.map((m) => (
          <Card key={m.personId} className="flex items-center gap-3 !p-4">
            <Initials name={m.fullName ?? ""} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold text-ink">{m.fullName}</p>
              <p className="text-[14px] text-ink-muted">{m.department ?? "No department"}</p>
            </div>
            <button disabled={busy} onClick={() => invite(m)} className="rounded-xl bg-brand-soft px-4 py-2 text-[14px] font-bold text-brand disabled:opacity-50">
              Invite
            </button>
          </Card>
        ))}
      </div>
    </Screen>
  );
}
