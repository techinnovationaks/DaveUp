"use client";
// Journal home (N design 173): your streak, filters, and your entries. Private
// unless you share one with your discipler.
import Link from "next/link";
import { useState } from "react";
import { JOURNAL_KIND_LABEL, type JournalEntryDto, type JournalListDto } from "@daveup/shared";
import { Screen, Button, ErrorText, Loading, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

type Filter = "all" | "faith" | "impact" | "shared";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${t}`;
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

function Tag({ children, tone }: { children: React.ReactNode; tone: "faith" | "impact" | "private" | "shared" }) {
  const cls = { faith: "bg-brand-soft text-brand", impact: "bg-warn-soft text-warn", private: "bg-brand-soft text-ink", shared: "bg-ok-soft text-ok" }[tone];
  return <span className={`rounded-xl px-3 py-1 text-[14px] font-bold ${cls}`}>{children}</span>;
}

function Entry({ e, targets, onChange, onDelete }: { e: JournalEntryDto; targets: JournalListDto["shareTargets"]; onChange: (e: JournalEntryDto) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(e.body);
  const { busy, error, run } = useAction();
  const share = (relationshipId: string | null) => run(async () => onChange(await api<JournalEntryDto>(`/journal/${e.id}/share`, { method: "PUT", body: { relationshipId } })));
  const save = () =>
    run(async () => {
      onChange(await api<JournalEntryDto>(`/journal/${e.id}`, { method: "PUT", body: { kind: e.kind, aboutFaith: e.aboutFaith, aboutImpact: e.aboutImpact, title: e.title, body } }));
      setEditing(false);
    });
  const remove = () =>
    run(async () => {
      if (!confirm("Delete this entry? This cannot be undone.")) return;
      await api(`/journal/${e.id}`, { method: "DELETE" });
      onDelete();
    });

  return (
    <article className="rounded-[28px] border border-surface-line bg-card p-5">
      <button onClick={() => setOpen((v) => !v)} className="block w-full text-left" aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] text-ink-muted">{when(e.createdAt)}</p>
          <span className="rounded-xl bg-brand-soft px-3 py-1 text-[14px] font-bold text-brand">{JOURNAL_KIND_LABEL[e.kind]}</span>
        </div>
        {e.title && <h2 className="mt-1 font-display text-[20px] font-extrabold text-ink">{e.title}</h2>}
        {!editing && <p className={`mt-1 whitespace-pre-wrap text-[16px] leading-relaxed text-ink ${open ? "" : "line-clamp-3"}`}>{e.body}</p>}
      </button>
      {editing && (
        <textarea className={`${inputClass} mt-2 min-h-[140px] py-3`} value={body} onChange={(x) => setBody(x.target.value)} autoFocus />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {e.aboutFaith && <Tag tone="faith">Faith</Tag>}
        {e.aboutImpact && <Tag tone="impact">Impact</Tag>}
        {e.sharedWith ? <Tag tone="shared">Shared with {e.sharedWith.disciplerName.split(" ")[0]}</Tag> : <Tag tone="private">Private</Tag>}
      </div>
      {open && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-line pt-3">
          {editing ? (
            <>
              <Button className="!min-h-[40px] !px-4 text-[14px]" disabled={busy || !body.trim()} onClick={() => void save()}>
                Save
              </Button>
              <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" onClick={() => (setEditing(false), setBody(e.body))}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {e.sharedWith ? (
            <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" disabled={busy} onClick={() => void share(null)}>
              Stop sharing
            </Button>
          ) : (
            targets.map((t) => (
              <Button key={t.relationshipId} variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" disabled={busy} onClick={() => void share(t.relationshipId)}>
                Share with {t.disciplerName.split(" ")[0]}
              </Button>
            ))
          )}
          <span className="flex-1" />
          <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px] !text-danger" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </article>
  );
}

export default function Journal() {
  const { ready } = useGuard();
  const list = useApi<JournalListDto>(ready ? "/journal" : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState<string | null>(null);
  const [older, setOlder] = useState<JournalEntryDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined);
  const { busy, run } = useAction();

  if (!ready || list.loading) return <Loading />;
  const data = list.data!;
  const all = [...data.entries, ...older.filter((o) => !data.entries.some((e) => e.id === o.id))];
  const term = (q ?? "").trim().toLowerCase();
  const entries = all.filter(
    (e) =>
      (filter === "all" || (filter === "faith" && e.aboutFaith) || (filter === "impact" && e.aboutImpact) || (filter === "shared" && !!e.sharedWith)) &&
      (!term || `${e.title ?? ""} ${e.body}`.toLowerCase().includes(term)),
  );
  const more = nextBefore === undefined ? data.nextBefore : nextBefore;
  const replace = (e: JournalEntryDto) => {
    list.setData({ ...data, entries: data.entries.map((x) => (x.id === e.id ? e : x)) });
    setOlder((o) => o.map((x) => (x.id === e.id ? e : x)));
  };
  const drop = (id: string) => {
    list.setData({ ...data, entries: data.entries.filter((x) => x.id !== id) });
    setOlder((o) => o.filter((x) => x.id !== id));
  };
  const loadMore = () =>
    run(async () => {
      const r = await api<JournalListDto>(`/journal?before=${encodeURIComponent(more!)}`);
      setOlder((o) => [...o, ...r.entries]);
      setNextBefore(r.nextBefore);
    });
  const dayLetters = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000).toLocaleDateString("en", { weekday: "narrow" }));

  return (
    <Screen nav narrow>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[16px] text-ink-muted">Private. Follows you everywhere.</p>
          <h1 className="font-display text-[40px] font-extrabold leading-tight tracking-tight text-ink">Journal</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setQ((v) => (v === null ? "" : null))} aria-label="Search your journal" className="flex h-14 w-14 items-center justify-center rounded-full border border-surface-line bg-card text-ink hover:border-brand-line">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          <Link href="/account" aria-label="Journal privacy" title="Only you can read your journal unless you share an entry" className="flex h-14 w-14 items-center justify-center rounded-full border border-surface-line bg-card text-ink hover:border-brand-line">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </Link>
        </div>
      </div>

      {q !== null && <input className={`${inputClass} mb-4`} type="search" placeholder="Search your entries" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}

      {/* Streak */}
      <div className="rounded-[32px] bg-brand p-6 text-on-brand">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-extrabold tracking-[0.12em]">{data.stats.streak > 0 ? `${data.stats.streak} DAY STREAK` : "START A STREAK"}</p>
          <p className="text-[15px] font-semibold">
            {data.stats.thisMonth} {data.stats.thisMonth === 1 ? "entry" : "entries"} this month
          </p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-2 text-center">
          {data.stats.lastSeven.map((on, i) => (
            <div key={i}>
              <p className="text-[13px] font-bold opacity-80">{dayLetters[i]}</p>
              <span className={`mx-auto mt-1 block h-10 w-10 rounded-full ${on ? "bg-[#0B2566]" : "bg-white/45"}`} aria-label={on ? "Wrote that day" : "No entry"} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[18px] font-bold">What did God show you today?</p>
        <Link href="/journal/new" className="mt-3 block rounded-[20px] bg-[#0B2566] py-4 text-center text-[18px] font-bold text-brand transition-transform hover:-translate-y-0.5">
          Write today&apos;s entry
        </Link>
      </div>

      <div className="-mx-4 my-5 flex gap-2 overflow-x-auto px-4">
        {(["all", "faith", "impact", "shared"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full px-5 py-2.5 text-[16px] font-bold capitalize ${filter === f ? "bg-brand text-on-brand" : "border border-surface-line bg-card text-ink"}`}>
            {f}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-ink-muted">{all.length === 0 ? "Your entries will appear here. Only you can read them unless you share one." : "Nothing matches."}</p>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <Entry key={e.id} e={e} targets={data.shareTargets} onChange={replace} onDelete={() => drop(e.id)} />
          ))}
        </div>
      )}
      {more && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" disabled={busy} onClick={() => void loadMore()}>
            {busy ? "Loading…" : "Show older entries"}
          </Button>
        </div>
      )}
      <div className="mt-5 rounded-[28px] border-2 border-brand-line bg-brand-soft p-5 opacity-80">
        <p className="text-[14px] font-extrabold tracking-[0.12em] text-brand">MONTHLY LOOK-BACK</p>
        <p className="mt-1 text-[17px] text-ink">See what changed this month. Coming soon.</p>
      </div>
    </Screen>
  );
}
