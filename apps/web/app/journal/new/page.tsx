"use client";
// New journal entry (N design 174): kind, the words, what it is about, and who
// can see it. Private by default.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { JOURNAL_BODY_MAX, JOURNAL_KINDS, JOURNAL_KIND_LABEL, JOURNAL_KIND_PROMPT, type JournalKind, type JournalListDto } from "@daveup/shared";
import { Button, ErrorText, Loading, Screen, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

const chip = (on: boolean) => `shrink-0 rounded-full px-5 py-2.5 text-[16px] font-bold transition-colors ${on ? "bg-brand text-on-brand" : "border border-surface-line bg-card text-ink hover:border-brand-line"}`;

export default function NewEntry() {
  const router = useRouter();
  const { ready } = useGuard();
  const list = useApi<JournalListDto>(ready ? "/journal" : null);
  const [kind, setKind] = useState<JournalKind>("reflection");
  const [body, setBody] = useState("");
  const [faith, setFaith] = useState(false);
  const [impact, setImpact] = useState(false);
  const [shareWith, setShareWith] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (!ready || list.loading) return <Loading />;
  const targets = list.data?.shareTargets ?? [];

  const save = () =>
    run(async () => {
      await api("/journal", { method: "POST", body: { kind, body, aboutFaith: faith, aboutImpact: impact, shareWith } });
      router.push("/journal");
    });

  return (
    <Screen narrow>
      <TopBar back="/journal" title="New entry" />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {JOURNAL_KINDS.map((k) => (
          <button key={k} onClick={() => setKind(k)} className={chip(kind === k)}>
            {JOURNAL_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="mb-2 block text-[18px] font-bold text-ink" htmlFor="entry">
        {JOURNAL_KIND_PROMPT[kind]}
      </label>
      <textarea
        id="entry"
        className={`${inputClass} min-h-[220px] rounded-[24px] py-4 text-[17px] leading-relaxed`}
        value={body}
        maxLength={JOURNAL_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
        placeholder="Write freely. Only you can read this."
      />

      <p className="mb-2 mt-6 text-[18px] font-bold text-ink">This is about</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFaith((v) => !v)} aria-pressed={faith} className={chip(faith)}>
          Faith
        </button>
        <button onClick={() => setImpact((v) => !v)} aria-pressed={impact} className={chip(impact)}>
          Impact
        </button>
      </div>

      <p className="mb-2 mt-6 text-[18px] font-bold text-ink">Who can see this?</p>
      <div className="flex rounded-[20px] bg-brand-soft p-1.5" role="radiogroup">
        <button role="radio" aria-checked={shareWith === null} onClick={() => setShareWith(null)} className={`flex-1 rounded-2xl py-3.5 text-[16px] font-bold ${shareWith === null ? "bg-card text-ink" : "text-ink-muted"}`}>
          Private
        </button>
        {targets.map((t) => (
          <button
            key={t.relationshipId}
            role="radio"
            aria-checked={shareWith === t.relationshipId}
            onClick={() => setShareWith(t.relationshipId)}
            className={`flex-1 truncate rounded-2xl px-2 py-3.5 text-[16px] font-bold ${shareWith === t.relationshipId ? "bg-card text-ink" : "text-ink-muted"}`}
          >
            Share with {t.disciplerName.split(" ")[0]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[15px] text-ink-muted">
        {targets.length ? "Private by default. You can share or unshare any entry later." : "Private. Once you walk with a discipler you can choose to share an entry with them."}
      </p>

      <ErrorText>{error}</ErrorText>
      <Button full className="mt-8 !min-h-[60px] !rounded-[24px] text-[18px]" disabled={busy || !body.trim()} onClick={() => void save()}>
        {busy ? "Saving…" : "Save entry"}
      </Button>
    </Screen>
  );
}
