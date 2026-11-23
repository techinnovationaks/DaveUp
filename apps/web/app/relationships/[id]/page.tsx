"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { END_REASONS, getArea, type ComparisonDto, type EndReason, type RelationshipDto, type RelationshipProgressDto } from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, H1, Initials, LinkButton, Loading, Pill, Screen, Segmented, TopBar } from "@/components/ui";
import { Disclosure } from "@/components/Disclosure";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";
import { baselineLabel, firstName, fmtDay, statusLabel } from "@/lib/labels";
import { CheckCard } from "@/components/rel/CheckCard";
import { ProgressCard } from "@/components/rel/ProgressCard";
import { GrowthResults } from "@/components/rel/Growth";
import { PlanPanel } from "@/components/rel/PlanPanel";
import { MeetingsPanel } from "@/components/rel/MeetingsPanel";

type Tab = "results" | "plan" | "meetings";
const TABS: Tab[] = ["results", "plan", "meetings"];

export default function RelationshipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready } = useGuard();
  const rel = useApi<RelationshipDto>(ready ? `/relationships/${id}` : null);
  const active = rel.data?.status === "active" || rel.data?.status === "paused";
  const cmp = useApi<ComparisonDto>(ready && active ? `/relationships/${id}/comparison` : null);
  const progress = useApi<RelationshipProgressDto>(ready && active ? `/relationships/${id}/progress` : null);
  // Tab in the URL hash so links like /relationships/x#plan open the right one.
  const [tab, setTab] = useState<Tab>("results");
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1) as Tab;
      setTab(TABS.includes(h) ? h : "results");
    };
    fromHash();
    // Following a #plan or #meetings link while already on the page only changes the hash.
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const pickTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "results" ? window.location.pathname : `#${t}`);
  };

  if (!ready || rel.loading || (active && (cmp.loading || progress.loading))) return <Loading />;
  if (rel.error || !rel.data)
    return (
      <Screen>
        <TopBar back="/home" />
        <ErrorText>{rel.error?.message ?? "Not found"}</ErrorText>
      </Screen>
    );

  const r = rel.data;
  return (
    <Screen narrow={!active}>
      <TopBar back="/home" title={r.myRole === "discipler" ? "Your disciple" : "Your discipler"} />
      <div className="mb-6 flex items-center gap-3">
        <Initials name={r.other.fullName} size={56} />
        <div>
          <p className="text-[22px] font-extrabold text-ink">{r.other.fullName}</p>
          <Pill tone={active ? "green" : r.status === "ended" || r.status === "declined" ? "grey" : "amber"}>{statusLabel[r.status]}</Pill>
        </div>
      </div>

      {r.status === "requested" && <RequestPanel r={r} onDone={rel.reload} />}
      {r.status === "accepted_baseline_pending" && (
        <>
          <BaselinePanel r={r} />
          <h2 className="mb-3 mt-6 text-[20px] font-extrabold text-ink">Your first review meeting</h2>
          <p className="mb-3 text-[15px] text-ink-muted">You can agree a time now. The growth plan opens once you have both finished the baseline.</p>
          <MeetingsPanel relationshipId={r.id} canRecord />
          <div className="mb-6" />
        </>
      )}
      {active && (
        <>
          <Segmented<Tab>
            value={tab}
            onChange={pickTab}
            options={[
              { value: "results", label: "Results" },
              {
                value: "plan",
                label: (
                  <>
                    <span className="md:hidden">Plan</span>
                    <span className="hidden md:inline">Growth plan</span>
                  </>
                ),
              },
              { value: "meetings", label: "Meetings" },
            ]}
          />
          {tab === "results" && (
            <>
              {progress.data?.current && <CheckCard cycle={progress.data.current} myRole={r.myRole} otherName={r.other.fullName} />}
              {progress.data && <GrowthResults progress={progress.data} myRole={r.myRole} otherName={r.other.fullName} />}
              {progress.data && <ProgressCard progress={progress.data} />}
              {progress.error && <ErrorText>{progress.error.message}</ErrorText>}
              {cmp.data && <Compare c={cmp.data} r={r} />}
              {cmp.error && <ErrorText>{cmp.error.message}</ErrorText>}
            </>
          )}
          {tab === "plan" && <PlanPanel relationshipId={r.id} otherName={r.other.fullName} />}
          {tab === "meetings" && <MeetingsPanel relationshipId={r.id} canRecord />}
          <div className="mb-6" />
        </>
      )}
      {(r.status === "accepted_baseline_pending" || active) && <EndPanel r={r} onDone={rel.reload} />}
      {(r.status === "ended" || r.status === "declined") && <ClosedPanel r={r} />}
    </Screen>
  );
}

function RequestPanel({ r, onDone }: { r: RelationshipDto; onDone: () => Promise<void> }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [agreed, setAgreed] = useState(false);
  const mustAccept = r.awaiting === "me" || r.awaiting === "both";
  const iAmDisciple = r.myRole === "disciple";
  const fromChurch = r.initiatedBy === "church";

  if (!mustAccept) {
    return (
      <Card className="mb-4">
        <p className="text-[16px] text-ink">
          {fromChurch
            ? `You accepted your church's suggestion. Waiting for ${r.other.fullName} to accept too.`
            : `${iAmDisciple ? `Your request has been sent to ${r.other.fullName}.` : `Your invitation has been sent to ${r.other.fullName}.`} You will be told when they reply.`}
        </p>
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" className="mt-4" disabled={busy} onClick={() => run(async () => (await api(`/relationships/${r.id}/decline`, { method: "POST" }), router.replace("/home")))}>
          {fromChurch ? "Decline after all" : "Withdraw"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="mb-4">
      <H1
        sub={
          fromChurch
            ? `Your church suggested ${r.other.fullName} as your ${iAmDisciple ? "discipler" : "disciple"}. It only goes ahead if you both accept.`
            : iAmDisciple
              ? `${r.other.fullName} has invited you to be their disciple.`
              : `${r.other.fullName} would like you to disciple them.`
        }
      >
        {fromChurch ? "Accept this suggestion?" : iAmDisciple ? "Accept this invitation?" : "Accept this request?"}
      </H1>
      {iAmDisciple && <Disclosure checked={agreed} onChange={setAgreed} disciplerName={r.other.fullName} />}
      {!iAmDisciple && (
        <Card className="mb-4">
          <p className="text-[15px] text-ink">Before you accept, take time to pray about it. Accepting reserves one of your places while you both complete the baseline assessment.</p>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-3 md:flex-row">
        <Button disabled={busy || (iAmDisciple && !agreed)} onClick={() => run(async () => (await api(`/relationships/${r.id}/accept`, { method: "POST", body: { disclosureConfirmed: agreed } }), await onDone()))}>
          Accept
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => (await api(`/relationships/${r.id}/decline`, { method: "POST" }), router.replace("/home")))}>
          Decline
        </Button>
      </div>
    </div>
  );
}

function BaselinePanel({ r }: { r: RelationshipDto }) {
  const mine = r.myRole === "disciple" ? r.baseline.disciple : r.baseline.discipler;
  const theirs = r.myRole === "disciple" ? r.baseline.discipler : r.baseline.disciple;
  const href = r.myRole === "disciple" ? "/assessments" : r.myAssessmentId ? `/assessments/${r.myAssessmentId}` : `/assessments?start=${r.id}`;
  return (
    <Card className="mb-4">
      <Eyebrow className="mb-3">Baseline assessment</Eyebrow>
      <div className="space-y-2 text-[15px]">
        <p className="flex justify-between">
          <span className="text-ink-muted">{r.myRole === "disciple" ? "Your self-assessment" : `Your assessment of ${firstName(r.other.fullName)}`}</span>
          <span className="font-semibold">{baselineLabel[mine]}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-ink-muted">{r.myRole === "disciple" ? `${firstName(r.other.fullName)}'s assessment of you` : `${firstName(r.other.fullName)}'s self-assessment`}</span>
          <span className="font-semibold">{baselineLabel[theirs]}</span>
        </p>
      </div>
      <p className="mb-4 mt-3 text-[14px] text-ink-muted">Each of you answers alone. Neither sees the other&apos;s answers. The comparison opens when you have both finished.</p>
      {mine !== "submitted" && <LinkButton href={href}>{mine === "not_started" ? "Start my assessment" : "Continue my assessment"}</LinkButton>}
    </Card>
  );
}

function ClosedPanel({ r }: { r: RelationshipDto }) {
  const ended = r.status === "ended";
  const iAmDisciple = r.myRole === "disciple";
  return (
    <Card className="mb-4">
      <p className="text-[17px] font-bold text-ink">{ended ? "This relationship has ended" : "This request was not taken forward"}</p>
      <p className="mb-4 mt-1 text-[15px] text-ink-muted">
        {ended
          ? "Its history is kept under your church's policy. Your own assessment stays with you."
          : "Nothing was shared and no place was used."}
        {iAmDisciple ? " You can choose another discipler whenever you are ready." : ""}
      </p>
      {iAmDisciple ? <LinkButton href="/disciplers">Choose a discipler</LinkButton> : <LinkButton href="/home" variant="secondary">Back to home</LinkButton>}
    </Card>
  );
}

type View = "both" | "disciple" | "discipler";

function Compare({ c, r }: { c: ComparisonDto; r: RelationshipDto }) {
  const [view, setView] = useState<View>("both");
  const isDisciple = r.myRole === "disciple";
  const nameOf = (who: "disciple" | "discipler") => ((who === "disciple") === isDisciple ? "You" : firstName(c[who].fullName));
  const ordered = [...c.areas].sort((a, b) => {
    const rank = (g: string) => (g === "large" ? 0 : g === "some" ? 1 : 2);
    return rank(a.gap) - rank(b.gap) || a.area - b.area;
  });

  return (
    <div className="mb-6">
      <H1 sub={`From the ${c.basis.label.toLowerCase()} on ${fmtDay(c.basis.date)}. Scores are out of 20 per area. These are conversation starters, not verdicts.`}>Where your views differ</H1>
      <div className="md:hidden">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "both", label: "Side by side" },
            { value: "disciple", label: nameOf("disciple") === "You" ? "Me only" : `${nameOf("disciple")} only` },
            { value: "discipler", label: nameOf("discipler") === "You" ? "Me only" : `${nameOf("discipler")} only` },
          ]}
        />
      </div>
      {c.suggestion && (
        <Card tone="soft" className="mb-4">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-dark">Suggested starting point, for review</p>
          <p className="mt-1 text-[16px] text-ink">{c.suggestion.text}</p>
        </Card>
      )}
      {/* Tablet and desktop: one table, every area at a glance. */}
      <div className="hidden overflow-hidden rounded-card border border-surface-line bg-white md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-surface-line text-[12px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-5 py-3">Area</th>
              <th className="px-5 py-3">{nameOf("disciple")}</th>
              <th className="px-5 py-3">{nameOf("discipler")}</th>
              <th className="w-[140px] px-5 py-3">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {ordered.map((a) => (
              <tr key={a.area} className={a.gap === "large" ? "bg-brand-soft/40" : ""}>
                <td className="px-5 py-4">
                  <p className="text-[15px] font-semibold text-ink">{getArea(a.area).name}</p>
                  {a.gap === "large" && <p className="mt-0.5 text-[13px] text-ink-muted">Worth discussing at your next meeting.</p>}
                </td>
                <td className="w-[26%] px-5 py-4">
                  <Bar value={a.disciple} tone="dark" />
                </td>
                <td className="w-[26%] px-5 py-4">
                  <Bar value={a.discipler} tone="red" />
                </td>
                <td className="px-5 py-4">
                  {a.gap === "none" ? <span className="text-[14px] text-ink-muted">Similar</span> : <Pill tone={a.gap === "large" ? "red" : "amber"}>{a.gap === "large" ? "Large gap" : "Some gap"}</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {ordered.map((a) => (
          <Card key={a.area} className="!p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[17px] font-bold text-ink">{getArea(a.area).name}</p>
              {view === "both" && a.gap !== "none" && <Pill tone={a.gap === "large" ? "red" : "amber"}>{a.gap === "large" ? "Large gap" : "Some gap"}</Pill>}
            </div>
            {(view === "both" || view === "disciple") && <Bar label={nameOf("disciple")} value={a.disciple} tone="dark" />}
            {(view === "both" || view === "discipler") && <Bar label={nameOf("discipler")} value={a.discipler} tone="red" />}
            {view === "both" && a.gap === "large" && <p className="mt-2 text-[14px] text-ink-muted">Your assessments differ significantly here. This may be useful to discuss at your next meeting.</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Bar({ label, value, tone }: { label?: string; value: number | null; tone: "dark" | "red" }) {
  return (
    <div className={`flex items-center gap-3 text-[15px] ${label ? "mb-2" : ""}`}>
      {label && <span className="w-16 shrink-0 truncate text-ink-muted">{label}</span>}
      <div className="h-2.5 flex-1 rounded-full bg-surface-line">
        {value !== null && <div className={`h-2.5 rounded-full ${tone === "dark" ? "bg-sky-500" : "bg-brand"}`} style={{ width: `${(value / 20) * 100}%` }} />}
      </div>
      <span className="w-14 shrink-0 text-right font-bold text-ink">{value === null ? "n/a" : `${value}/20`}</span>
    </div>
  );
}

const reasonLabel: Record<EndReason, string> = {
  completed_season: "This season is complete",
  moved: "One of us has moved",
  inactive: "We are no longer meeting",
  concern: "I have a concern",
  other: "Another reason",
};

function EndPanel({ r, onDone }: { r: RelationshipDto; onDone: () => Promise<void> }) {
  const { reload } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<EndReason | null>(null);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full py-3 text-center text-[15px] font-semibold text-ink-muted">
        End this relationship or raise a concern
      </button>
    );
  }
  return (
    <Card>
      <p className="text-[17px] font-bold text-ink">End this relationship</p>
      <p className="mt-1 text-[14px] text-ink-muted">
        {r.myRole === "disciple" ? "You can always leave. Your discipler cannot stop this." : "Your disciple will be told the relationship has ended."} History is kept under your church&apos;s policy.
      </p>
      <div className="mt-4 space-y-2">
        {END_REASONS.map((k) => (
          <label key={k} className="flex items-center gap-3 text-[15px] text-ink">
            <input type="radio" name="reason" className="h-5 w-5 accent-brand" checked={reason === k} onChange={() => setReason(k)} />
            {reasonLabel[k]}
          </label>
        ))}
      </div>
      {reason === "concern" && (
        <textarea
          className="mt-3 w-full rounded-2xl border border-surface-line p-3 text-[15px]"
          rows={3}
          maxLength={500}
          placeholder="Optional: what should your church administrator know?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-col gap-2 md:flex-row md:gap-3">
        <Button variant="danger" disabled={!reason || busy} onClick={() => run(async () => (await api(`/relationships/${r.id}/end`, { method: "POST", body: { reason, note: note || undefined } }), await reload(), await onDone()))}>
          End relationship
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
