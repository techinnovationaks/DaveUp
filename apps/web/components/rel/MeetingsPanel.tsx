"use client";
import { useState } from "react";
import { MEETING_STEPS, type MeetingDto, type MeetingsDto } from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, Field, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/labels";

/** datetime-local value for a Date, in local time. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Meetings for one relationship (PRD 8.4, 38.3). */
export function MeetingsPanel({ relationshipId, canRecord }: { relationshipId: string; canRecord: boolean }) {
  const list = useApi<MeetingsDto>(`/relationships/${relationshipId}/meetings`);
  const [open, setOpen] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  if (list.loading) return <Loading />;
  if (!list.data) return <ErrorText>{list.error?.message}</ErrorText>;
  const m = list.data;
  const set = (next: MeetingsDto) => list.setData(next);
  const needsRecord = m.past.filter((x) => x.status === "scheduled");

  return (
    <div className="space-y-4">
      {open ? (
        <MeetingMode meeting={[...m.upcoming, ...m.past].find((x) => x.id === open)!} lastCommitment={m.lastCommitment} onClose={() => setOpen(null)} onSaved={(next) => (set(next), setOpen(null))} />
      ) : (
        <>
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>Upcoming</Eyebrow>
              {!scheduling && (
                <button onClick={() => setScheduling(true)} className="rounded-xl px-3 py-1.5 text-[14px] font-semibold text-brand hover:bg-brand-soft">
                  + Schedule a meeting
                </button>
              )}
            </div>
            {scheduling && <ScheduleForm rel={relationshipId} onDone={(next) => (next && set(next), setScheduling(false))} />}
            {m.upcoming.length === 0 && !scheduling && <p className="py-2 text-[15px] text-ink-muted">Nothing scheduled. Agree a time and add it here.</p>}
            <div className="divide-y divide-surface-line">
              {m.upcoming.map((x) => (
                <MeetingRow key={x.id} m={x} onOpen={canRecord ? () => setOpen(x.id) : undefined} onChange={set} openLabel="Start meeting" />
              ))}
            </div>
          </Card>

          {needsRecord.length > 0 && (
            <Card tone="soft">
              <Eyebrow className="mb-1">Needs a record</Eyebrow>
              <p className="mb-1 text-[14px] text-ink-muted">One short record per meeting. It takes about a minute.</p>
              <div className="divide-y divide-brand-line/60">
                {needsRecord.map((x) => (
                  <MeetingRow key={x.id} m={x} onOpen={canRecord ? () => setOpen(x.id) : undefined} onChange={set} openLabel="Record it" />
                ))}
              </div>
            </Card>
          )}

          <Card>
            <Eyebrow className="mb-1">Past meetings</Eyebrow>
            {m.past.filter((x) => x.status !== "scheduled").length === 0 && <p className="py-2 text-[15px] text-ink-muted">No meetings recorded yet.</p>}
            <div className="divide-y divide-surface-line">
              {m.past
                .filter((x) => x.status !== "scheduled")
                .map((x) => (
                  <PastMeeting key={x.id} m={x} onEdit={canRecord && x.record?.editable ? () => setOpen(x.id) : undefined} />
                ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ScheduleForm({ rel, onDone }: { rel: string; onDone: (m: MeetingsDto | null) => void }) {
  const next = new Date(Date.now() + 86_400_000);
  next.setHours(18, 0, 0, 0);
  const [when, setWhen] = useState(localInput(next));
  const [place, setPlace] = useState("");
  const [agenda, setAgenda] = useState("");
  const { busy, error, run } = useAction();
  return (
    <form
      className="mb-3 rounded-2xl bg-surface p-4"
      onSubmit={(e) => (
        e.preventDefault(),
        void run(async () =>
          onDone(await api<MeetingsDto>(`/relationships/${rel}/meetings`, { method: "POST", body: { scheduledAt: new Date(when).toISOString(), place: place || undefined, agenda: agenda || undefined } })),
        )
      )}
    >
      <div className="grid gap-x-3 md:grid-cols-2">
        <Field label="When">
          <input type="datetime-local" required className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Where (optional)">
          <input className={inputClass} placeholder="Church hall, a call, a home" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} />
        </Field>
      </div>
      <Field label="Agenda (optional)">
        <input className={inputClass} placeholder="For example: review the growth plan, prayer" value={agenda} onChange={(e) => setAgenda(e.target.value)} maxLength={500} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-2 md:flex-row md:gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Schedule"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MeetingRow({ m, onOpen, onChange, openLabel }: { m: MeetingDto; onOpen?: () => void; onChange: (m: MeetingsDto) => void; openLabel: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{fmtDateTime(m.scheduledAt)}</p>
          <p className="text-[14px] text-ink-muted">{[m.place, m.agenda].filter(Boolean).join(" · ") || "No place or agenda set"}</p>
        </div>
        <div className="flex gap-2">
          {onOpen && (
            <button onClick={onOpen} className="rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-white hover:bg-brand-dark">
              {openLabel}
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => run(async () => onChange(await api<MeetingsDto>(`/meetings/${m.id}/cancel`, { method: "POST" })))}
            className="rounded-xl border border-surface-line bg-white px-4 py-2 text-[14px] font-semibold text-ink hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function PastMeeting({ m, onEdit }: { m: MeetingDto; onEdit?: () => void }) {
  const r = m.record;
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[15px] font-semibold text-ink">{fmtDateTime(m.scheduledAt)}</p>
        <Pill tone={m.status === "held" ? "green" : m.status === "missed" ? "amber" : "grey"}>{m.status === "held" ? "Held" : m.status === "missed" ? "Did not happen" : "Cancelled"}</Pill>
        {onEdit && (
          <button onClick={onEdit} className="text-[13px] font-semibold text-brand hover:underline">
            Edit
          </button>
        )}
      </div>
      {r && (
        <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-[14px] md:grid-cols-2">
          {r.discussed && <Item label="Discussed" v={r.discussed} />}
          {r.commitment && <Item label="Commitment" v={r.commitment} />}
          {r.prayer && <Item label="Prayer" v={r.prayer} />}
          {r.win && <Item label="Win" v={r.win} />}
          <p className="text-[12px] text-ink-faint md:col-span-2">Recorded by {r.recordedBy}</p>
        </dl>
      )}
    </div>
  );
}

function Item({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <dt className="inline text-ink-muted">{label}: </dt>
      <dd className="inline text-ink">{v}</dd>
    </div>
  );
}

/** Guided meeting: the PRD 8.4 sequence, then the one-minute record. */
function MeetingMode({ meeting, lastCommitment, onClose, onSaved }: { meeting: MeetingDto; lastCommitment: string | null; onClose: () => void; onSaved: (m: MeetingsDto) => void }) {
  const r = meeting.record;
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [tookPlace, setTookPlace] = useState(r?.tookPlace ?? true);
  const [form, setForm] = useState({ discussed: r?.discussed ?? "", commitment: r?.commitment ?? "", prayer: r?.prayer ?? "", win: r?.win ?? "" });
  const nextDefault = new Date(new Date(meeting.scheduledAt).getTime() + 7 * 86_400_000);
  const [next, setNext] = useState(r ? "" : localInput(nextDefault));
  const { busy, error, run } = useAction();
  const started = new Date(meeting.scheduledAt).getTime() <= Date.now() + 3_600_000;

  const save = () =>
    run(async () =>
      onSaved(
        await api<MeetingsDto>(`/meetings/${meeting.id}/record`, {
          method: "POST",
          body: {
            tookPlace,
            ...(tookPlace ? { discussed: form.discussed || undefined, commitment: form.commitment || undefined, prayer: form.prayer || undefined, win: form.win || undefined } : {}),
            nextMeetingAt: next ? new Date(next).toISOString() : undefined,
          },
        }),
      ),
    );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-4">
      <Card className="mb-4 lg:mb-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Eyebrow>Meeting, {fmtDateTime(meeting.scheduledAt)}</Eyebrow>
          <button onClick={onClose} className="text-[14px] font-semibold text-ink-muted hover:text-ink">
            Close
          </button>
        </div>
        {meeting.agenda && <p className="mb-3 text-[14px] text-ink-muted">Agenda: {meeting.agenda}</p>}
        <ol className="space-y-1">
          {MEETING_STEPS.map((s, i) => {
            const on = ticked.has(i);
            return (
              <li key={s.title}>
                <button
                  onClick={() =>
                    setTicked((t) => {
                      const next = new Set(t);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left ${on ? "bg-ok-soft" : "hover:bg-surface"}`}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${on ? "bg-ok text-white" : "bg-surface text-ink-muted"}`}>{on ? "✓" : i + 1}</span>
                  <span>
                    <span className="block text-[15px] font-semibold text-ink">{s.title}</span>
                    <span className="block text-[13px] text-ink-muted">{i === 1 && lastCommitment ? `Last time: "${lastCommitment}"` : s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <Eyebrow className="mb-1">Meeting record</Eyebrow>
        <p className="mb-3 text-[14px] text-ink-muted">About a minute. Only the two of you see it. It can be edited for 24 hours.</p>
        {!started && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-[14px] text-warn">You can save the record once the meeting has started.</p>}
        <p className="mb-2 text-[14px] font-semibold text-ink">Did it take place?</p>
        <div className="mb-4 flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={tookPlace === v}
              onClick={() => setTookPlace(v)}
              className={`rounded-xl border px-5 py-2 text-[14px] font-semibold ${tookPlace === v ? "border-brand bg-brand-soft text-brand" : "border-surface-line bg-white text-ink"}`}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
        {tookPlace && (
          <div className="grid gap-x-3 md:grid-cols-2">
            {(
              [
                ["discussed", "What you discussed", 1500],
                ["commitment", "New commitment", 500],
                ["prayer", "One prayer or care item", 500],
                ["win", "One win", 500],
              ] as const
            ).map(([k, label, max]) => (
              <Field key={k} label={label}>
                <textarea rows={2} maxLength={max} className={`${inputClass} py-2.5 text-[15px]`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
        {!r && (
          <Field label="Next meeting (optional)" hint="Leave empty if you will agree it later.">
            <input type="datetime-local" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy || !started} onClick={save}>
          {busy ? "Saving…" : "Save record"}
        </Button>
      </Card>
    </div>
  );
}
