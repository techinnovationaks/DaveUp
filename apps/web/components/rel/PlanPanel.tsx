"use client";
import { useEffect, useState } from "react";
import {
  AREAS,
  MAX_FOCUS_AREAS,
  MAX_PRACTICES,
  PLAN_LENGTHS,
  PRACTICE_TEMPLATES,
  REFLECTION_PROMPTS,
  addDays,
  getArea,
  isoDay,
  type GrowthPlanDto,
  type PlanDraft,
  type PlanStateDto,
  type ReflectionKey,
} from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { firstName, fmtDay } from "@/lib/labels";

type Practice = PlanDraft["practices"][number];

/** Growth plan, this week's practice and reflection (PRD 8.2, 8.3). */
export function PlanPanel({ relationshipId, otherName }: { relationshipId: string; otherName: string }) {
  const state = useApi<PlanStateDto>(`/relationships/${relationshipId}/plan`);
  const [editing, setEditing] = useState<PlanDraft | null>(null);

  if (state.loading) return <Loading />;
  if (!state.data) return <ErrorText>{state.error?.message}</ErrorText>;
  const s = state.data;
  const setS = (next: PlanStateDto) => state.setData(next);
  const other = firstName(otherName);

  const startEdit = (from?: GrowthPlanDto) =>
    setEditing(
      from
        ? { focusAreas: from.focusAreas, lengthDays: from.lengthDays as PlanDraft["lengthDays"], practices: from.practices.map((p) => ({ title: p.title, detail: p.detail ?? "", timesPerWeek: p.timesPerWeek, area: p.area })) }
        : { focusAreas: s.suggestedFocus.slice(0, 1), lengthDays: 30, practices: [] },
    );

  if (editing) return <PlanEditor rel={relationshipId} initial={editing} suggested={s.suggestedFocus} onDone={(next) => (next && setS(next), setEditing(null))} />;

  return (
    <div className="space-y-4">
      <ErrorText>{state.error?.message}</ErrorText>

      {s.draft && <DraftCard rel={relationshipId} draft={s.draft} other={other} onChange={setS} onEdit={() => startEdit(s.draft!)} />}

      {!s.active && !s.draft && (
        <Card>
          <Eyebrow className="mb-1">Growth plan</Eyebrow>
          <p className="text-[17px] font-bold text-ink">No plan yet</p>
          <p className="mb-4 mt-1 text-[15px] text-ink-muted">
            Agree one to three focus areas and a few practical weekly steps. {other} confirms it before it starts.
            {s.suggestedFocus.length > 0 && ` From your results, consider ${s.suggestedFocus.map((a) => getArea(a).name).join(", ")}.`}
          </p>
          <Button onClick={() => startEdit()}>Create a plan</Button>
        </Card>
      )}

      {s.active && <ActivePlan s={s} plan={s.active} rel={relationshipId} onChange={setS} onEdit={() => startEdit(s.active!)} canEdit={!s.draft} />}

      {s.active && <Reflection s={s} rel={relationshipId} other={other} onChange={setS} />}
    </div>
  );
}

function FocusChips({ areas }: { areas: number[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {areas.map((a) => (
        <Pill key={a} tone="red">
          {getArea(a).name}
        </Pill>
      ))}
    </span>
  );
}

function DraftCard({ rel, draft, other, onChange, onEdit }: { rel: string; draft: GrowthPlanDto; other: string; onChange: (s: PlanStateDto) => void; onEdit: () => void }) {
  const { busy, error, run } = useAction();
  const waitingForThem = draft.confirmedByMe && !draft.confirmedByThem;
  return (
    <Card tone="dashed">
      <Eyebrow className="mb-1">{waitingForThem ? "Waiting for confirmation" : "Plan to confirm"}</Eyebrow>
      <p className="text-[17px] font-bold text-ink">{waitingForThem ? `Waiting for ${other} to confirm` : `${other} proposed a plan`}</p>
      <div className="mt-3">
        <FocusChips areas={draft.focusAreas} />
      </div>
      <p className="mt-2 text-[14px] text-ink-muted">{draft.lengthDays} days, starting when you have both confirmed.</p>
      <ul className="mt-3 space-y-1.5">
        {draft.practices.map((p) => (
          <li key={p.id} className="text-[15px] text-ink">
            <span className="font-semibold">{p.title}</span>
            <span className="text-ink-muted">
              {" "}
              · {p.timesPerWeek} {p.timesPerWeek === 1 ? "time" : "times"} a week{p.detail ? ` · ${p.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-col gap-2 md:flex-row md:gap-3">
        {!draft.confirmedByMe && (
          <Button disabled={busy} onClick={() => run(async () => onChange(await api<PlanStateDto>(`/relationships/${rel}/plan/draft/confirm`, { method: "POST" })))}>
            Confirm this plan
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(async () => onChange(await api<PlanStateDto>(`/relationships/${rel}/plan/draft`, { method: "DELETE" })))}>
          Discard
        </Button>
      </div>
    </Card>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ActivePlan({ s, plan, rel, onChange, onEdit, canEdit }: { s: PlanStateDto; plan: GrowthPlanDto; rel: string; onChange: (s: PlanStateDto) => void; onEdit: () => void; canEdit: boolean }) {
  const { busy, error, run } = useAction();
  const today = isoDay(new Date());
  const days = DAY_LABELS.map((label, i) => ({ label, day: addDays(s.weekStart, i) }));
  const isDisciple = s.myRole === "disciple";

  const toggle = (practiceId: string, day: string, done: boolean) =>
    run(async () => onChange(await api<PlanStateDto>(`/practices/${practiceId}/days/${day}`, { method: "PUT", body: { done } })));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow className="mb-1">Growth plan</Eyebrow>
          <FocusChips areas={plan.focusAreas} />
          <p className="mt-2 text-[14px] text-ink-muted">
            {plan.lengthDays} days, {fmtDay(plan.startsOn!)} to {fmtDay(plan.endsOn!)}
          </p>
        </div>
        {canEdit && (
          <button onClick={onEdit} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-brand hover:bg-brand-soft">
            {plan.ended ? "Agree the next plan" : "Change the plan"}
          </button>
        )}
      </div>
      {plan.ended && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-[14px] text-warn">This plan has ended. Review it together and agree the next one.</p>}

      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-muted">This week</p>
      <div className="divide-y divide-surface-line">
        {plan.practices.map((p) => {
          const done = new Set(p.doneThisWeek);
          return (
            <div key={p.id} className="py-3 md:flex md:items-center md:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{p.title}</p>
                <p className="text-[13px] text-ink-muted">
                  {p.detail ? `${p.detail} · ` : ""}
                  <span className={done.size >= p.timesPerWeek ? "font-semibold text-ok" : ""}>
                    {done.size} of {p.timesPerWeek} this week
                  </span>
                </p>
              </div>
              <div className="mt-2 flex gap-1 md:mt-0" role="group" aria-label={`Days for ${p.title}`}>
                {days.map(({ label, day }) => {
                  const on = done.has(day);
                  const allowed = isDisciple && !plan.ended && day <= today && day >= plan.startsOn! && day <= plan.endsOn!;
                  return (
                    <button
                      key={day}
                      disabled={!allowed || busy}
                      aria-pressed={on}
                      title={allowed ? `${on ? "Untick" : "Tick"} ${label}` : label}
                      onClick={() => toggle(p.id, day, !on)}
                      className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-colors md:h-9 md:w-9 ${
                        on ? "bg-brand text-on-brand" : allowed ? "border border-surface-line bg-card text-ink hover:border-brand" : "bg-surface text-ink-faint"
                      } ${day === today ? "ring-2 ring-brand/30" : ""}`}
                    >
                      {label.slice(0, 2)}
                      {on && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!isDisciple && <p className="mt-2 text-[13px] text-ink-muted">Your disciple ticks their own practice. You see it here.</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function Reflection({ s, rel, other, onChange }: { s: PlanStateDto; rel: string; other: string; onChange: (s: PlanStateDto) => void }) {
  const thisWeek = s.reflections.find((r) => r.weekStart === s.weekStart);
  const [form, setForm] = useState<Record<ReflectionKey, string>>({ did: "", difficult: "", changed: "", needHelp: "" });
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({ did: thisWeek?.did ?? "", difficult: thisWeek?.difficult ?? "", changed: thisWeek?.changed ?? "", needHelp: thisWeek?.needHelp ?? "" });
  }, [thisWeek?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.myRole === "discipler") {
    return (
      <Card>
        <Eyebrow className="mb-1">Reflections from {other}</Eyebrow>
        {s.reflections.length === 0 ? (
          <p className="text-[15px] text-ink-muted">{other} has not written a reflection yet.</p>
        ) : (
          <div className="divide-y divide-surface-line">
            {s.reflections.map((r) => (
              <div key={r.weekStart} className="py-3">
                <p className="mb-1 text-[13px] font-bold text-ink-muted">Week of {fmtDay(r.weekStart)}</p>
                {REFLECTION_PROMPTS.map((p) =>
                  r[p.key] ? (
                    <p key={p.key} className="text-[14px] text-ink">
                      <span className="text-ink-muted">{p.label} </span>
                      {r[p.key]}
                    </p>
                  ) : null,
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Eyebrow className="mb-1">This week&apos;s reflection</Eyebrow>
      <p className="mb-3 text-[14px] text-ink-muted">Short and honest is best. {other} sees this, to help at your next meeting.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {REFLECTION_PROMPTS.map((p) => (
          <label key={p.key} className="block">
            <span className="mb-1 block text-[14px] font-semibold text-ink">{p.label}</span>
            <textarea
              rows={2}
              maxLength={1000}
              className={`${inputClass} py-2.5 text-[15px]`}
              value={form[p.key]}
              onChange={(e) => (setSaved(false), setForm({ ...form, [p.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={busy} onClick={() => run(async () => (onChange(await api<PlanStateDto>(`/relationships/${rel}/reflection`, { method: "PUT", body: form })), setSaved(true)))}>
          {busy ? "Saving…" : "Save reflection"}
        </Button>
        {saved && <span className="text-[14px] font-semibold text-ok">Saved</span>}
      </div>
    </Card>
  );
}

function PlanEditor({ rel, initial, suggested, onDone }: { rel: string; initial: PlanDraft; suggested: number[]; onDone: (s: PlanStateDto | null) => void }) {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const { busy, error, run } = useAction();
  const set = (d: Partial<PlanDraft>) => setDraft({ ...draft, ...d });

  const toggleArea = (a: number) => {
    const on = draft.focusAreas.includes(a);
    if (!on && draft.focusAreas.length >= MAX_FOCUS_AREAS) return;
    set({ focusAreas: on ? draft.focusAreas.filter((x) => x !== a) : [...draft.focusAreas, a] });
  };
  const updatePractice = (i: number, p: Partial<Practice>) => set({ practices: draft.practices.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const addPractice = (p: Practice) => draft.practices.length < MAX_PRACTICES && set({ practices: [...draft.practices, p] });
  const added = new Set(draft.practices.map((p) => p.title));

  return (
    <Card>
      <Eyebrow className="mb-1">Growth plan</Eyebrow>
      <p className="mb-4 text-[14px] text-ink-muted">Keep it simple: a few steps you can actually do. The other person confirms it before it starts.</p>

      <p className="mb-2 text-[14px] font-semibold text-ink">
        Focus areas <span className="font-normal text-ink-muted">(up to {MAX_FOCUS_AREAS})</span>
      </p>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {AREAS.map((a) => {
          const on = draft.focusAreas.includes(a.number);
          return (
            <button
              key={a.number}
              type="button"
              aria-pressed={on}
              onClick={() => toggleArea(a.number)}
              className={`rounded-xl border px-3 py-2 text-left text-[14px] ${on ? "border-brand bg-brand-soft font-semibold text-brand" : "border-surface-line bg-card text-ink hover:border-ink-faint"}`}
            >
              {a.name}
              {suggested.includes(a.number) && <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted">Suggested</span>}
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[14px] font-semibold text-ink">Length</p>
      <div className="mb-5 flex gap-2">
        {PLAN_LENGTHS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={draft.lengthDays === n}
            onClick={() => set({ lengthDays: n })}
            className={`rounded-xl border px-4 py-2 text-[14px] font-semibold ${draft.lengthDays === n ? "border-brand bg-brand-soft text-brand" : "border-surface-line bg-card text-ink"}`}
          >
            {n} days{n === 30 ? " (monthly)" : ""}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[14px] font-semibold text-ink">
        Weekly practices <span className="font-normal text-ink-muted">(up to {MAX_PRACTICES})</span>
      </p>
      <div className="mb-3 space-y-3">
        {draft.practices.map((p, i) => (
          <div key={i} className="rounded-2xl border border-surface-line p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto] md:items-center">
              <input className={`${inputClass} py-2.5 text-[15px]`} placeholder="Practice" value={p.title} onChange={(e) => updatePractice(i, { title: e.target.value })} maxLength={120} />
              <input className={`${inputClass} py-2.5 text-[15px]`} placeholder="Detail (optional)" value={p.detail ?? ""} onChange={(e) => updatePractice(i, { detail: e.target.value })} maxLength={200} />
              <select className={`${inputClass} py-2.5 text-[15px]`} value={p.timesPerWeek} onChange={(e) => updatePractice(i, { timesPerWeek: Number(e.target.value) })} aria-label="Times a week">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "time" : "times"} a week
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => set({ practices: draft.practices.filter((_, j) => j !== i) })} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-muted hover:bg-surface">
                Remove
              </button>
            </div>
          </div>
        ))}
        {draft.practices.length === 0 && <p className="text-[14px] text-ink-muted">No practices yet. Add a suggestion below or write your own.</p>}
      </div>

      {draft.focusAreas.length > 0 && (
        <div className="mb-4 rounded-2xl bg-surface p-3">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-muted">Suggestions for your focus areas, for review</p>
          <div className="space-y-1.5">
            {draft.focusAreas.flatMap((a) =>
              (PRACTICE_TEMPLATES[a] ?? []).map((t) => (
                <div key={t.title} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[14px] text-ink">
                    {t.title}
                    <span className="text-ink-muted"> · {t.timesPerWeek}x a week</span>
                  </span>
                  <button
                    type="button"
                    disabled={added.has(t.title) || draft.practices.length >= MAX_PRACTICES}
                    onClick={() => addPractice({ title: t.title, detail: t.detail, timesPerWeek: t.timesPerWeek, area: a })}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-brand hover:bg-card disabled:text-ink-faint"
                  >
                    {added.has(t.title) ? "Added" : "Add"}
                  </button>
                </div>
              )),
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={draft.practices.length >= MAX_PRACTICES}
        onClick={() => addPractice({ title: "", detail: "", timesPerWeek: 1, area: draft.focusAreas[0] ?? null })}
        className="mb-5 text-[14px] font-semibold text-brand hover:underline disabled:text-ink-faint"
      >
        + Write your own practice
      </button>

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-2 md:flex-row md:gap-3">
        <Button
          disabled={busy}
          onClick={() =>
            run(async () =>
              onDone(
                await api<PlanStateDto>(`/relationships/${rel}/plan/draft`, {
                  method: "PUT",
                  body: { ...draft, practices: draft.practices.map((p) => ({ ...p, detail: p.detail?.trim() || undefined })) },
                }),
              ),
            )
          }
        >
          {busy ? "Saving…" : "Save and send for confirmation"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
