"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DisciplerCardDto, RelationshipDto } from "@daveup/shared";
import { Button, Card, ErrorText, H1, Initials, Loading, Screen, TopBar, inputClass } from "@/components/ui";
import { Disclosure } from "@/components/Disclosure";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

export default function ChooseDiscipler() {
  const router = useRouter();
  const { ready } = useGuard();
  const list = useApi<DisciplerCardDto[]>(ready ? "/disciplers" : null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<DisciplerCardDto | null>(null);
  const [agreed, setAgreed] = useState(false);
  const { busy, error, run } = useAction();

  if (!ready || list.loading) return <Loading />;

  if (picked) {
    const send = () =>
      run(async () => {
        const r = await api<RelationshipDto>("/relationships", { method: "POST", body: { disciplerId: picked.personId, disclosureConfirmed: true } });
        router.replace(`/relationships/${r.id}`);
      });
    return (
      <Screen narrow>
        <TopBar back={true} title="Send a request" />
        <Card className="mb-4 flex items-center gap-3">
          <Initials name={picked.fullName} />
          <div>
            <p className="text-[18px] font-bold text-ink">{picked.fullName}</p>
            <p className="text-[14px] text-ink-muted">
              {picked.placesFilled} of {picked.placesTotal} places filled
            </p>
          </div>
        </Card>
        <Disclosure checked={agreed} onChange={setAgreed} disciplerName={picked.fullName} />
        <ErrorText>{error}</ErrorText>
        <Button disabled={!agreed || busy} onClick={send}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </Screen>
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = (list.data ?? []).filter((d) => !needle || d.fullName.toLowerCase().includes(needle) || (d.department ?? "").toLowerCase().includes(needle));

  return (
    <Screen>
      <TopBar back="/home" title="Choose a discipler" />
      <H1 sub="These people are approved by your organization to disciple others.">Who would you like to walk with?</H1>
      <ErrorText>{list.error?.message}</ErrorText>
      {(list.data?.length ?? 0) > 3 && <input className={`${inputClass} mb-4 md:max-w-md`} placeholder="Search by name or department" value={q} onChange={(e) => setQ(e.target.value)} />}
      {list.data?.length === 0 && (
        <Card>
          <p className="text-[16px] text-ink">There are no approved disciplers in your organization yet.</p>
          <p className="mt-1 text-[14px] text-ink-muted">Ask your organization administrator, or wait for a discipler to invite you.</p>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((d) => {
          const full = d.placesFilled >= d.placesTotal;
          return (
            <button
              key={d.personId}
              disabled={full}
              onClick={() => (setPicked(d), setAgreed(false))}
              className="flex w-full items-center gap-3 rounded-card border border-surface-line bg-white p-4 text-left hover:border-brand-line disabled:opacity-60"
            >
              <Initials name={d.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold text-ink">{d.fullName}</p>
                <p className="text-[14px] text-ink-muted">{d.department ?? "No department"}</p>
              </div>
              <span className={`text-[13px] font-semibold ${full ? "text-brand" : "text-ok"}`}>
                {full ? "Full" : `${d.placesTotal - d.placesFilled} places open`}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
