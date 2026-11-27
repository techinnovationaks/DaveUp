"use client";
// Journal: private entries. Each one can be shared with your discipler.
import { useState } from "react";
import { JOURNAL_BODY_MAX, JOURNAL_PROMPTS, type JournalEntryDto, type JournalListDto } from "@daveup/shared";
import { Screen, Button, Card, ErrorText, H1, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Composer({ initial, onSaved, onCancel }: { initial?: JournalEntryDto; onSaved: (e: JournalEntryDto) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      const payload = { title: title.trim() || null, body };
      const e = initial ? await api<JournalEntryDto>(`/journal/${initial.id}`, { method: "PUT", body: payload }) : await api<JournalEntryDto>("/journal", { method: "POST", body: payload });
      onSaved(e);
      if (!initial) {
        setTitle("");
        setBody("");
      }
    });
  return (
    <form onSubmit={(e) => (e.preventDefault(), void save())}>
      <input className={`${inputClass} mb-3 font-semibold`} placeholder="Title (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${inputClass} min-h-[160px] resize-y py-3 leading-relaxed`}
        placeholder="Write what is on your heart…"
        value={body}
        maxLength={JOURNAL_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        autoFocus={!!initial}
      />
      {!initial && !body && (
        <div className="mt-3 flex flex-wrap gap-2">
          {JOURNAL_PROMPTS.map((p) => (
            <button key={p} type="button" onClick={() => setTitle(p)} className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-muted hover:bg-brand-soft hover:text-brand">
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Saving…" : initial ? "Save changes" : "Save entry"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function Entry({ e, targets, onChange, onDelete }: { e: JournalEntryDto; targets: JournalListDto["shareTargets"]; onChange: (e: JournalEntryDto) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useAction();
  const long = e.body.length > 320;

  const share = (relationshipId: string | null) => run(async () => onChange(await api<JournalEntryDto>(`/journal/${e.id}/share`, { method: "PUT", body: { relationshipId } })));
  const remove = () =>
    run(async () => {
      await api(`/journal/${e.id}`, { method: "DELETE" });
      onDelete();
    });

  if (editing) {
    return (
      <Card>
        <Composer initial={e} onSaved={(x) => (onChange(x), setEditing(false))} onCancel={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
        <span className="font-semibold">{fmt(e.createdAt)}</span>
        <span>{time(e.createdAt)}</span>
        {e.sharedWith ? <Pill tone="green">Shared with {e.sharedWith.disciplerName}</Pill> : <Pill>Private</Pill>}
      </div>
      {e.title && <h2 className="mb-1 text-[18px] font-bold text-ink">{e.title}</h2>}
      <p className={`whitespace-pre-wrap text-[16px] leading-relaxed text-ink ${long && !open ? "line-clamp-5" : ""}`}>{e.body}</p>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[14px] font-semibold text-brand hover:underline">
          {open ? "Show less" : "Read more"}
        </button>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-line pt-3">
        <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {e.sharedWith ? (
          <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" disabled={busy} onClick={() => void share(null)}>
            Stop sharing
          </Button>
        ) : (
          targets.map((t) => (
            <Button key={t.relationshipId} variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" disabled={busy} onClick={() => void share(t.relationshipId)}>
              Share with {t.disciplerName}
              {targets.length > 1 ? ` (${t.churchName})` : ""}
            </Button>
          ))
        )}
        <span className="flex-1" />
        {confirm ? (
          <>
            <span className="text-[14px] text-ink-muted">Delete this entry?</span>
            <Button variant="danger" className="!min-h-[40px] !px-3 text-[14px]" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px]" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="!min-h-[40px] !px-3 text-[14px] !text-ink-muted" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Journal() {
  const { ready } = useGuard();
  const list = useApi<JournalListDto>(ready ? "/journal" : null);
  const [older, setOlder] = useState<JournalEntryDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined);
  const { busy, run } = useAction();

  if (!ready || list.loading) return <Loading />;
  const data = list.data!;
  const entries = [...data.entries, ...older.filter((o) => !data.entries.some((e) => e.id === o.id))];
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

  return (
    <Screen nav narrow>
      <H1 sub="Private to you. You can share any entry with your discipler, one at a time.">Journal</H1>
      <Card className="mb-6">
        <Composer onSaved={(e) => list.setData({ ...data, entries: [e, ...data.entries] })} />
      </Card>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-ink-muted">Your entries will appear here.</p>
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
    </Screen>
  );
}
