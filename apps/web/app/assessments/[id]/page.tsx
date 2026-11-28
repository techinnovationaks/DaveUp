"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AREAS,
  ASSESSMENT_INTRO,
  DOMAIN_LABEL,
  SCALE,
  getArea,
  isAnswerComplete,
  itemsFor,
  type AssessmentDetailDto,
  type AssessmentSummaryDto,
} from "@daveup/shared";
import { Button, Card, ErrorText, H1, LinkButton, Loading, Screen, TopBar } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";
import { firstName } from "@/lib/labels";

type Draft = { value: number | null; noOccasion: boolean; evidence: string };

export default function AssessmentFlow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { ready } = useGuard();
  const { reload: reloadSession } = useSession();
  const detail = useApi<AssessmentDetailDto>(ready ? `/assessments/${id}` : null);
  const { busy, error, setError, run } = useAction();

  const [answers, setAnswers] = useState<Record<string, Draft>>({});
  const [index, setIndex] = useState<number | "intro" | "review" | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  // Keyboard shortcuts on the question screen (desktop): 0 to 4, N, Enter.
  const keyHandler = useRef<((e: KeyboardEvent) => void) | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current?.(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const a = detail.data;
  const questions = useMemo(() => (a ? itemsFor(a.version, { kind: a.kind, itemIndex: a.itemIndex, round: a.checkRound }) : []), [a]);
  // A monthly check asks one question per area; the full assessment asks five.
  const perArea = a?.kind === "check" ? 1 : 5;
  const isCheck = a?.kind === "check";

  // First load: seed local answers and jump to the first unanswered question.
  useEffect(() => {
    if (!a || index !== null) return;
    const seeded: Record<string, Draft> = {};
    for (const x of a.answers) seeded[x.itemId] = { value: x.value, noOccasion: x.noOccasion, evidence: x.evidence ?? "" };
    setAnswers(seeded);
    if (a.status === "submitted") return setIndex("review");
    if (a.answers.length === 0) return setIndex("intro");
    const next = questions.findIndex((q) => !seeded[q.id] || !isAnswerComplete(seeded[q.id]!));
    setIndex(next === -1 ? "review" : next);
  }, [a, index, questions]);

  keyHandler.current = null;

  if (!ready || detail.loading || index === null) {
    if (detail.error)
      return (
        <Screen narrow>
          <TopBar back="/assessments" />
          <ErrorText>{detail.error.message}</ErrorText>
        </Screen>
      );
    return <Loading />;
  }
  if (!a) return <Loading />;

  const aboutSelf = a.version === "B";
  const subjectFirst = firstName(a.subject.fullName);
  const done = new Set(Object.entries(answers).filter(([, d]) => isAnswerComplete(d)).map(([k]) => k));
  const firstOpenIn = (area: number) => {
    const open = questions.findIndex((q) => q.area === area && !done.has(q.id));
    return open === -1 ? questions.findIndex((q) => q.area === area) : open;
  };

  if (index === "intro") {
    return (
      <Screen narrow>
        <TopBar back="/assessments" title={aboutSelf ? "About you" : `About them: ${a.subject.fullName}`} />
        <H1 sub={ASSESSMENT_INTRO.purpose}>
          {isCheck ? (aboutSelf ? "Your monthly check" : `Monthly check about ${subjectFirst}`) : a.cycleNumber ? (aboutSelf ? "Your full assessment" : `Full assessment about ${subjectFirst}`) : aboutSelf ? "Your baseline assessment" : `Your view of ${subjectFirst}`}
        </H1>
        <div className="md:grid md:grid-cols-2 md:gap-4">
          <Card tone="soft" className="mb-4">
            <p className="text-[13px] font-bold uppercase tracking-wider text-brand-dark">Important</p>
            <p className="mt-1 text-[15px] text-ink">{ASSESSMENT_INTRO.important}</p>
          </Card>
          <Card className="mb-6">
            <ul className="list-disc space-y-1.5 pl-5 text-[15px] text-ink">
              <li>{ASSESSMENT_INTRO.window}</li>
              <li>{isCheck ? "12 questions, one from each area, about 4 minutes." : "60 questions, 5 in each of 12 areas."} Your progress saves as you go.</li>
              <li>Each question is tagged Priest (your walk with God) or King (your work and impact in the world). You get a score for each, never one overall grade.</li>
              <li>Choose &ldquo;No occasion yet&rdquo; when there has been no opportunity. It does not count against you.</li>
              <li>{aboutSelf ? "Your discipler answers about you separately." : `${subjectFirst} answers about themselves separately.`} You see the comparison together once you have both finished.</li>
            </ul>
          </Card>
        </div>
        <Button onClick={() => setIndex(0)}>Start the assessment</Button>
      </Screen>
    );
  }

  if (index === "review") {
    const submitted = a.status === "submitted";
    const submit = () =>
      run(async () => {
        await api<AssessmentSummaryDto>(`/assessments/${id}/submit`, { method: "POST" });
        await reloadSession();
        await detail.reload();
      });
    return (
      <Screen narrow>
        <TopBar back="/assessments" title={submitted ? "Submitted" : "Review"} />
        <H1 sub={submitted ? `Results are revealed when ${aboutSelf ? "your discipler has" : `${subjectFirst} has`} finished too.` : "Check every area is complete, then submit. You cannot change answers after submitting."}>
          {submitted ? "Thank you. Your assessment is in." : "Ready to submit?"}
        </H1>
        <Card className="mb-6">
          <div className="divide-y divide-surface-line md:grid md:grid-cols-2 md:gap-x-8 md:divide-y-0">
            {AREAS.map((area) => {
              const n = questions.filter((q) => q.area === area.number && done.has(q.id)).length;
              return (
                <button
                  key={area.number}
                  disabled={submitted}
                  onClick={() => setIndex(firstOpenIn(area.number))}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left md:border-b md:border-surface-line"
                >
                  <span className="text-[15px] text-ink">
                    {area.number}. {area.name}
                  </span>
                  <span className={`shrink-0 text-[14px] font-semibold ${n === perArea ? "text-ok" : "text-brand"}`}>{n === perArea ? "Complete" : `${n} of ${perArea}`}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <ErrorText>{error}</ErrorText>
        {submitted ? (
          <LinkButton href="/home">Back to home</LinkButton>
        ) : (
          <Button disabled={busy || done.size < questions.length} onClick={submit}>
            {busy ? "Submitting…" : done.size < questions.length ? `${questions.length - done.size} questions left` : "Submit"}
          </Button>
        )}
      </Screen>
    );
  }

  const q = questions[index]!;
  const area = getArea(q.area);
  const draft = answers[q.id] ?? { value: null, noOccasion: false, evidence: "" };
  const setDraft = (d: Partial<Draft>) => {
    setError(null);
    setAnswers((prev) => ({ ...prev, [q.id]: { ...draft, ...d } }));
  };
  const canNext = isAnswerComplete(draft);
  const goBack = () => (setShowEvidence(false), setIndex(index === 0 ? "intro" : index - 1));

  const saveAndNext = () =>
    run(async () => {
      await api(`/assessments/${id}/answers/${q.id}`, {
        method: "PUT",
        body: { value: draft.noOccasion ? null : draft.value, noOccasion: draft.noOccasion, evidence: draft.evidence.trim() || undefined },
      });
      setShowEvidence(false);
      // Go to the next unanswered question after this one, then any earlier gap, then review.
      const open = (x: { id: string }) => x.id !== q.id && !done.has(x.id);
      const after = questions.findIndex((x, i) => i > index && open(x));
      const anywhere = questions.findIndex(open);
      setIndex(after !== -1 ? after : anywhere !== -1 ? anywhere : "review");
    });

  keyHandler.current = (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-4]$/.test(e.key)) setDraft({ value: Number(e.key), noOccasion: false });
    else if (e.key === "n" || e.key === "N") setDraft({ noOccasion: true, value: null });
    else if (e.key === "Enter" && canNext && !busy) {
      e.preventDefault();
      void saveAndNext();
    }
  };

  const areasComplete = AREAS.filter((x) => questions.filter((y) => y.area === x.number).every((y) => done.has(y.id))).length;
  const testLabel = aboutSelf ? "About you" : `About them: ${a.subject.fullName}`;

  return (
    <Screen>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Desktop: all 12 areas, jump to any. */}
        <nav aria-label="Areas" className="hidden lg:block">
          <div className="sticky top-24 rounded-card border border-surface-line bg-card p-3">
            {AREAS.map((x) => {
              const items = questions.filter((y) => y.area === x.number);
              const n = items.filter((y) => done.has(y.id)).length;
              const current = x.number === q.area;
              return (
                <button
                  key={x.number}
                  onClick={() => (setShowEvidence(false), setIndex(firstOpenIn(x.number)))}
                  aria-current={current ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${current ? "bg-brand-soft" : "hover:bg-surface"}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                      current ? "bg-brand text-on-brand" : n === perArea ? "bg-ok-soft text-ok" : "bg-surface text-ink-muted"
                    }`}
                  >
                    {n === perArea && !current ? "✓" : x.number}
                  </span>
                  <span className={`min-w-0 flex-1 text-[14px] leading-snug ${current ? "font-bold text-ink" : "text-ink"}`}>{x.name}</span>
                  {n > 0 && n < perArea && <span className="text-[12px] text-ink-muted">{n}/{perArea}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0">
          {/* Mobile header */}
          <div className="mb-3 flex items-center gap-3 lg:hidden">
            <button aria-label="Back" onClick={goBack} className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-line bg-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <p className="flex-1 truncate text-center text-[15px] font-semibold text-ink">{aboutSelf ? "About you" : `About ${a.subject.fullName}`}</p>
            <p className="w-11 text-right text-[14px] text-ink-muted">{q.area}/12</p>
          </div>
          <div className="mb-6 flex gap-1 lg:hidden" aria-label={`Area ${q.area} of 12`}>
            {AREAS.map((x) => {
              const complete = questions.filter((y) => y.area === x.number).every((y) => done.has(y.id));
              return <span key={x.number} className={`h-1.5 flex-1 rounded-full ${x.number === q.area ? "bg-brand" : complete ? "bg-brand/40" : "bg-surface-line"}`} />;
            })}
          </div>

          {/* Desktop header */}
          <div className="mb-5 hidden items-center justify-between gap-4 lg:flex">
            <p className="text-[14px] text-ink-muted">
              Area {q.area} of 12 · {isCheck ? "Monthly check" : `Question ${q.index} of 5`} · {testLabel}
            </p>
            <button onClick={() => router.push("/assessments")} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-muted hover:bg-card hover:text-ink">
              Save and exit
            </button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-[18px] font-extrabold text-brand">{q.area}</span>
            <div>
              <p className="text-[20px] font-extrabold leading-tight text-ink md:text-[24px]">{area.name}</p>
              <p className="text-[14px] text-ink-muted lg:hidden">
                {isCheck ? "Monthly check" : `Question ${q.index} of 5`} · {aboutSelf ? "about yourself" : `your view of ${subjectFirst}`}
              </p>
            </div>
          </div>

          <Card className="mb-4 md:p-6">
            <span
              className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wider ${q.domain === "priest" ? "bg-brand-soft text-brand" : "bg-sky-100 text-sky-700"}`}
            >
              {DOMAIN_LABEL[q.domain].name}
            </span>
            <p className="text-[19px] font-semibold leading-snug text-ink md:text-[21px]">{q.text}</p>
          </Card>

          <div className="mb-3 space-y-2.5" role="radiogroup" aria-label="How often">
            {SCALE.map((s) => {
              const on = !draft.noOccasion && draft.value === s.value;
              return (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDraft({ value: s.value, noOccasion: false })}
                  className={`flex min-h-[56px] w-full items-center gap-4 rounded-2xl border px-4 text-left transition-colors ${on ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-surface-line bg-card hover:border-ink-faint"}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${on ? "bg-brand text-on-brand" : "bg-surface text-ink"}`}>{s.value}</span>
                  <span className="text-[17px] font-semibold text-ink">{s.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setDraft({ noOccasion: !draft.noOccasion, value: null })}
              aria-pressed={draft.noOccasion}
              className={`min-h-[48px] rounded-2xl border border-dashed text-[15px] font-semibold ${draft.noOccasion ? "border-brand bg-brand-soft text-brand" : "border-surface-line bg-card text-ink hover:border-ink-faint"}`}
            >
              No occasion yet
            </button>
            <button onClick={() => setShowEvidence((v) => !v)} className="min-h-[48px] rounded-2xl border border-surface-line bg-card text-[15px] font-semibold text-ink hover:border-ink-faint">
              {draft.evidence ? "Edit evidence" : "Add evidence"}
            </button>
          </div>

          {(showEvidence || (draft.value === 4 && !draft.noOccasion)) && (
            <textarea
              className="mb-4 w-full rounded-2xl border border-surface-line bg-card p-3 text-[15px] outline-none focus:border-brand"
              rows={3}
              maxLength={1000}
              placeholder={draft.value === 4 ? "Consistently: give one concrete example you can point to." : "A concrete example (optional). Only you can see this."}
              value={draft.evidence}
              onChange={(e) => setDraft({ evidence: e.target.value })}
            />
          )}

          <p className="mb-4 text-[14px] text-ink-muted">
            {aboutSelf ? "Your discipler answers about you separately." : `${subjectFirst} answers about themselves separately.`} You both see the comparison once you have each finished.
          </p>
          <ErrorText>{error}</ErrorText>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Button variant="secondary" onClick={goBack} className="hidden lg:block">
              Back
            </Button>
            <Button disabled={!canNext || busy} onClick={saveAndNext}>
              {busy ? "Saving…" : "Next"}
            </Button>
            <p className="hidden text-[13px] text-ink-faint lg:ml-auto lg:block xl:hidden">Keys: 0 to 4 to answer, N for no occasion, Enter for next</p>
          </div>
          <button onClick={() => router.push("/home")} className="mt-3 w-full py-2 text-center text-[14px] font-semibold text-ink-muted lg:hidden">
            Save and finish later
          </button>
        </div>

        {/* Wide screens: context for the question being answered. */}
        <aside className="hidden xl:block">
          <div className="space-y-4">
            <Card>
              <p className="text-[13px] font-bold uppercase tracking-wider text-brand">Your progress</p>
              <p className="mt-2 text-[28px] font-extrabold leading-none text-ink">
                {done.size}
                <span className="text-[16px] font-semibold text-ink-muted"> of {questions.length}</span>
              </p>
              <div className="mt-3 h-2 rounded-full bg-surface-line">
                <div className="h-2 rounded-full bg-brand transition-[width]" style={{ width: `${(done.size / questions.length) * 100}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                {areasComplete} of 12 areas complete. Saved as you go.
              </p>
            </Card>

            <Card>
              <p className="text-[13px] font-bold uppercase tracking-wider text-brand">About this area</p>
              <p className="mt-2 text-[15px] font-semibold text-ink">{area.tagline}</p>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-wider text-ink-muted">Core question</p>
              <p className="mt-0.5 text-[14px] text-ink">{area.coreQuestion}</p>
            </Card>

            <Card>
              <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-brand">What the answers mean</p>
              <dl className="space-y-1">
                {SCALE.map((sc) => {
                  const on = !draft.noOccasion && draft.value === sc.value;
                  return (
                    <div key={sc.value} className={`rounded-xl px-3 py-2 ${on ? "bg-brand-soft" : ""}`}>
                      <dt className={`text-[14px] font-bold ${on ? "text-brand" : "text-ink"}`}>
                        {sc.value} · {sc.label}
                      </dt>
                      <dd className="text-[13px] text-ink-muted">{sc.meaning}</dd>
                    </div>
                  );
                })}
                <div className={`rounded-xl px-3 py-2 ${draft.noOccasion ? "bg-brand-soft" : ""}`}>
                  <dt className={`text-[14px] font-bold ${draft.noOccasion ? "text-brand" : "text-ink"}`}>No occasion yet</dt>
                  <dd className="text-[13px] text-ink-muted">There has been no opportunity. It is left out of the area score, not counted against you.</dd>
                </div>
              </dl>
            </Card>

            <Card tone="soft">
              <p className="text-[13px] font-bold uppercase tracking-wider text-brand-dark">Who sees this</p>
              <p className="mt-2 text-[14px] text-ink">
                {aboutSelf
                  ? "Only you see your answers and evidence. Your discipler sees your area scores beside theirs once you have both finished."
                  : `Only you see your answers and evidence. ${subjectFirst} sees your area scores beside theirs once you have both finished.`}
              </p>
              <p className="mt-3 text-[13px] text-ink-muted">Keys: 0 to 4 to answer, N for no occasion, Enter for next.</p>
            </Card>
          </div>
        </aside>
      </div>
    </Screen>
  );
}
