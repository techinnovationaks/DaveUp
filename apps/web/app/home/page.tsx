"use client";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { MAX_ACTIVE_DISCIPLES, getArea, type AssessmentHubDto, type MeDto, type MeetingsDto, type PlanStateDto, type RelationshipDto } from "@daveup/shared";
import { Card, ErrorText, Eyebrow, Initials, LinkButton, Loading, Pill, Row, Screen, Segmented } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";
import { HomeGrowthCard } from "@/components/rel/Growth";
import { HomeHero } from "@/components/home/HomeHero";
import { QuickActions } from "@/components/home/QuickActions";
import { OPEN_STATUSES, baselineLabel, dueText, firstName, fmtDateTime, greeting, statusLabel } from "@/lib/labels";

/** New members: the first thing to do is their own 12-area assessment. */
function startHere(hub: AssessmentHubDto | null | undefined): { href: string; title: string; sub: string } | null {
  const b = hub?.myTestB;
  if (!hub || b?.status === "submitted") return null;
  if (b) return { href: `/assessments/${b.id}`, title: "Your 12-area assessment", sub: `${b.progress.answered} of ${b.progress.total} answered. Carry on at your own pace.` };
  return { href: "/assessments", title: "Your 12-area assessment", sub: "Faith and impact. At your own pace." };
}

type Mode = "me" | "lead";

function loadMode(): Mode {
  try {
    const q = new URLSearchParams(window.location.search).get("mode");
    if (q === "lead" || q === "me") return q;
    return sessionStorage.getItem("daveup.mode") === "lead" ? "lead" : "me";
  } catch {
    return "me";
  }
}

export default function Home() {
  const { me, ready } = useGuard();
  const rels = useApi<RelationshipDto[]>(ready ? "/relationships" : null);
  const hub = useApi<AssessmentHubDto>(ready ? "/assessments" : null);
  const [mode, setMode] = useState<Mode>("me");

  useEffect(() => setMode(loadMode()), []);
  const switchMode = (m: Mode) => {
    setMode(m);
    try {
      sessionStorage.setItem("daveup.mode", m);
    } catch {}
  };

  if (!ready || !me || rels.loading || hub.loading) return <Loading />;

  const all = rels.data ?? [];
  const asDisciple = all.filter((r) => r.myRole === "disciple" && OPEN_STATUSES.includes(r.status));
  const asDiscipler = all.filter((r) => r.myRole === "discipler" && OPEN_STATUSES.includes(r.status));
  const isDiscipler = me.disciplerStatus === "approved";
  const leadBadge = asDiscipler.filter((r) => r.awaiting === "me" || r.awaiting === "both").length;
  const showLead = isDiscipler && mode === "lead";

  return (
    <Screen nav aside={showLead ? undefined : <UpNext rels={all.filter((r) => OPEN_STATUSES.includes(r.status))} hub={hub.data} />}>
      <HomeHero me={me} rels={all} greeting="Hey" start={startHere(hub.data)} />
      <QuickActions me={me} meetingHref={(() => {
        const r = all.find((x) => x.status === "active");
        return r ? `/relationships/${r.id}#meetings` : null;
      })()} />
      {!showLead && (
        <div className="mb-6 xl:hidden">
          <UpNext rels={all.filter((r) => OPEN_STATUSES.includes(r.status))} hub={hub.data} />
        </div>
      )}

      {isDiscipler && (
        <Segmented<Mode>
          value={mode}
          onChange={switchMode}
          options={[
            { value: "me", label: "Me" },
            {
              value: "lead",
              label: (
                <>
                  My disciples
                  {leadBadge > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-[13px] font-bold text-on-brand">{leadBadge}</span>}
                </>
              ),
            },
          ]}
        />
      )}

      <ErrorText>{rels.error?.message ?? hub.error?.message}</ErrorText>

      {showLead ? <LeadView rels={asDiscipler} hub={hub.data} /> : <MeView me={me} rels={asDisciple} hub={hub.data} />}
    </Screen>
  );
}

/** Right rail on wide screens: what needs this person next, from real data only. */
function UpNext({ rels, hub }: { rels: RelationshipDto[]; hub: AssessmentHubDto | null }) {
  const items: { key: string; href: string; title: string; sub: string; name?: string }[] = [];
  for (const r of rels) {
    if (r.status === "requested" && (r.awaiting === "me" || r.awaiting === "both"))
      items.push({
        key: `reply-${r.id}`,
        href: `/relationships/${r.id}`,
        title: `Reply to ${r.other.fullName}`,
        sub: r.initiatedBy === "church" ? "Suggested by your organization" : r.myRole === "disciple" ? "Invited you to be their disciple" : "Wants you as their discipler",
        name: r.other.fullName,
      });
  }
  const b = hub?.myTestB;
  if (b?.status === "in_progress") items.push({ key: "testb", href: `/assessments/${b.id}`, title: "Your self-assessment", sub: `${b.progress.answered} of ${b.progress.total} answered` });
  for (const c of hub?.checks ?? [])
    items.push({
      key: `c-${c.cycleId}`,
      href: c.assessment ? `/assessments/${c.assessment.id}` : "/assessments",
      title: `${c.kind === "full" ? "Full assessment" : "Monthly check"} ${c.role === "self" ? "about you" : `about ${c.person.fullName}`}`,
      sub: dueText(c.due),
      name: c.role === "about" ? c.person.fullName : undefined,
    });
  for (const t of hub?.testAsOwed ?? [])
    items.push({
      key: `a-${t.relationshipId}`,
      href: t.assessment ? `/assessments/${t.assessment.id}` : `/assessments?start=${t.relationshipId}`,
      title: `Assessment about ${t.disciple.fullName}`,
      sub: t.assessment ? `${t.assessment.progress.answered} of ${t.assessment.progress.total} answered` : "Not started",
      name: t.disciple.fullName,
    });

  return (
    <Card>
      <Eyebrow className="mb-1">Up next</Eyebrow>
      {items.length === 0 ? (
        <p className="py-3 text-[15px] text-ink-muted">Nothing is waiting for you.</p>
      ) : (
        <div className="divide-y divide-surface-line">
          {items.map((it) => (
            <Link key={it.key} href={it.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface">
              {it.name ? <Initials name={it.name} size={36} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3" /></svg></span>}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-ink">{it.title}</span>
                <span className="block text-[13px] text-ink-muted">{it.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function MeView({ me, rels, hub }: { me: MeDto; rels: RelationshipDto[]; hub: AssessmentHubDto | null }) {
  const current = rels.find((r) => r.status !== "requested") ?? rels[0];
  const testB = hub?.myTestB;
  const wantsToDisciple = me.membership!.participation !== "grow";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Eyebrow className="mb-3">Your discipler</Eyebrow>
        {!current && (
          <>
            <p className="text-[16px] text-ink">You are not connected to a discipler yet.</p>
            <p className="mb-4 mt-1 text-[14px] text-ink-muted">Choose an approved discipler in your organization, or accept an invitation when one arrives.</p>
            <LinkButton href="/disciplers">Choose a discipler</LinkButton>
          </>
        )}
        {current && (
          <Link href={`/relationships/${current.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 md:hover:bg-surface">
            <Initials name={current.other.fullName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-bold text-ink">{current.other.fullName}</p>
              <p className="text-[14px] text-ink-muted">
                {current.status === "requested" && current.initiatedBy === "church" && current.awaiting !== "them"
                  ? "Suggested by your organization"
                  : current.status === "requested" && current.awaiting === "me"
                    ? "Invited you to be their disciple"
                    : statusLabel[current.status]}
              </p>
            </div>
            {(current.awaiting === "me" || (current.status === "requested" && current.awaiting === "both")) && <Pill tone="red">Reply</Pill>}
          </Link>
        )}
        {current?.status === "accepted_baseline_pending" && (
          <div className="mt-4 space-y-1 rounded-2xl bg-surface p-4 text-[14px]">
            <p className="flex justify-between gap-3">
              <span className="text-ink-muted">Your assessment</span>
              <span className="font-semibold text-ink">{baselineLabel[current.baseline.disciple]}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-ink-muted">{firstName(current.other.fullName)}&apos;s assessment of you</span>
              <span className="font-semibold text-ink">{baselineLabel[current.baseline.discipler]}</span>
            </p>
            <p className="pt-1 text-[13px] text-ink-muted">Your relationship starts when you have both finished. You will see the results together.</p>
          </div>
        )}
        {current?.status === "active" && (
          <div className="mt-4">
            <LinkButton href={`/relationships/${current.id}`}>See your results</LinkButton>
          </div>
        )}
      </Card>

      {current?.status === "active" && <HomeGrowthCard relId={current.id} />}
      {current?.status === "active" && <ThisWeek relId={current.id} />}

      <Card tone={testB?.status === "submitted" ? "plain" : "brand"}>
        <p className={`text-[13px] font-bold uppercase tracking-wider ${testB?.status === "submitted" ? "text-brand" : "text-on-brand/90"}`}>Your 12-area assessment</p>
        {!testB && (
          <>
            <p className="mt-1 text-[20px] font-extrabold">Start your baseline</p>
            <p className="mt-1 text-[15px] text-on-brand/90">60 short questions about the last month. Save and come back any time.</p>
            <Link href="/assessments" className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-card text-[16px] font-bold text-brand hover:bg-card/90 md:inline-flex md:min-h-[48px] md:px-8">
              Start
            </Link>
          </>
        )}
        {testB?.status === "in_progress" && (
          <>
            <p className="mt-1 text-[20px] font-extrabold">
              {testB.progress.answered} of {testB.progress.total} answered
            </p>
            <div className="mt-3 h-2 rounded-full bg-on-brand/25">
              <div className="h-2 rounded-full bg-card" style={{ width: `${(testB.progress.answered / testB.progress.total) * 100}%` }} />
            </div>
            <Link href={`/assessments/${testB.id}`} className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-card text-[16px] font-bold text-brand hover:bg-card/90 md:inline-flex md:min-h-[48px] md:px-8">
              Continue
            </Link>
          </>
        )}
        {testB?.status === "submitted" && (
          <p className="mt-1 text-[16px] text-ink">
            Finished on {new Date(testB.submittedAt!).toLocaleDateString(undefined, { day: "numeric", month: "long" })}.
            {current?.status === "active" ? " Your results are ready with your discipler." : " Results are shown once your discipler has finished too."}
          </p>
        )}
      </Card>

      {wantsToDisciple && me.disciplerStatus !== "approved" && (
        <Card tone="dashed" className="lg:col-span-2">
          <p className="text-[17px] font-bold text-ink">Disciple others</p>
          {me.disciplerStatus === "requested" ? (
            <p className="mt-1 text-[15px] text-ink-muted">Your request for discipler status is with your organization administrator.</p>
          ) : me.disciplerStatus === "suspended" || me.disciplerStatus === "revoked" ? (
            <p className="mt-1 text-[15px] text-ink-muted">Your discipler status is not active. Speak with your organization administrator.</p>
          ) : (
            <>
              <p className="mb-4 mt-1 text-[15px] text-ink-muted">Your organization approves disciplers. Once approved you can walk with up to {MAX_ACTIVE_DISCIPLES} people.</p>
              <LinkButton href="/discipler-request" variant="secondary">
                Ask for discipler status
              </LinkButton>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

function LeadView({ rels, hub }: { rels: RelationshipDto[]; hub: AssessmentHubDto | null }) {
  const filled = rels.filter((r) => r.status !== "requested").length;
  const requests = rels.filter((r) => r.status === "requested");
  const pending = rels.filter((r) => r.status === "accepted_baseline_pending");
  const active = rels.filter((r) => r.status === "active" || r.status === "paused");
  const people = [...requests, ...active, ...pending];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = people.find((r) => r.id === selectedId) ?? people[0] ?? null;

  // Desktop: rows select into the detail pane. Mobile: rows open the relationship.
  const pick = (e: MouseEvent, id: string) => {
    if (isDesktop()) {
      e.preventDefault();
      setSelectedId(id);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[22px] font-extrabold text-ink md:hidden">Who needs me today</h2>
      <p className="hidden text-[15px] text-ink-muted md:block">Lead mode. You see only what people have shared with you.</p>
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Stat n={filled} label={`of ${MAX_ACTIVE_DISCIPLES} places`} />
        <Stat n={requests.filter((r) => r.awaiting === "me" || r.awaiting === "both").length} label="requests" alert />
        <Stat n={pending.length} label="baseline pending" />
      </div>

      {(hub?.testAsOwed.length ?? 0) > 0 && (
        <Card>
          <Eyebrow className="mb-1">Your assessments to complete</Eyebrow>
          <div className="divide-y divide-surface-line md:grid md:grid-cols-2 md:gap-x-6 md:divide-y-0">
            {hub!.testAsOwed.map((t) => (
              <Row
                key={t.relationshipId}
                href={t.assessment ? `/assessments/${t.assessment.id}` : `/assessments?start=${t.relationshipId}`}
                title={`About ${t.disciple.fullName}`}
                sub={t.assessment ? `${t.assessment.progress.answered} of ${t.assessment.progress.total} answered` : "Not started"}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-4">
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <Eyebrow>Your disciples</Eyebrow>
            <Link href="/invite" className="text-[14px] font-semibold text-brand hover:underline">
              Invite someone
            </Link>
          </div>
          <p className="mb-1 hidden text-[13px] text-ink-muted lg:block">
            {filled} of {MAX_ACTIVE_DISCIPLES} places filled
          </p>
          {people.length === 0 ? (
            <p className="py-3 text-[15px] text-ink-muted">No disciples yet. Members can choose you from the discipler list, or you can invite someone.</p>
          ) : (
            <div className="divide-y divide-surface-line">
              {people.map((r) => {
                const on = selected?.id === r.id;
                const sub =
                  r.status === "requested"
                    ? r.initiatedBy === "church"
                      ? r.awaiting === "them"
                        ? "Organization suggestion: waiting for them to accept"
                        : "Organization suggestion: please reply"
                      : r.awaiting === "me"
                        ? "New request: wants you as their discipler"
                        : "Invitation sent, waiting for them to accept"
                    : statusLabel[r.status];
                return (
                  <Link
                    key={r.id}
                    href={`/relationships/${r.id}`}
                    onClick={(e) => pick(e, r.id)}
                    aria-current={on ? "true" : undefined}
                    className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface ${on ? "lg:bg-brand-soft lg:hover:bg-brand-soft" : ""}`}
                  >
                    <Initials name={r.other.fullName} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold text-ink">{r.other.fullName}</span>
                      <span className="block truncate text-[13px] text-ink-muted">{sub}</span>
                    </span>
                    {r.status === "requested" && (r.awaiting === "me" || r.awaiting === "both") && <Pill tone="red">Reply</Pill>}
                    {r.status === "accepted_baseline_pending" && <Pill tone="amber">Baseline</Pill>}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
        {selected && <DiscipleDetail r={selected} />}
      </div>
    </div>
  );
}

/** Detail pane beside the list, desktop only. */
function DiscipleDetail({ r }: { r: RelationshipDto }) {
  const mustReply = r.status === "requested" && (r.awaiting === "me" || r.awaiting === "both");
  const mine = r.baseline.discipler;
  const theirs = r.baseline.disciple;
  return (
    <Card className="hidden lg:block">
      <div className="mb-5 flex items-center gap-4">
        <Initials name={r.other.fullName} size={56} />
        <div className="min-w-0">
          <p className="truncate text-[22px] font-extrabold text-ink">{r.other.fullName}</p>
          <Pill tone={r.status === "active" ? "green" : mustReply ? "red" : "amber"}>{statusLabel[r.status]}</Pill>
        </div>
      </div>

      {r.status === "requested" && (
        <p className="mb-5 text-[15px] text-ink">
          {r.initiatedBy === "church"
            ? mustReply
              ? `Your organization suggested you disciple ${firstName(r.other.fullName)}. It only goes ahead if you both accept. Take time to pray about it.`
              : `You accepted your organization's suggestion. Waiting for ${firstName(r.other.fullName)} to accept.`
            : mustReply
              ? `${firstName(r.other.fullName)} would like you to disciple them. Take time to pray about it before you reply.`
              : `You invited ${firstName(r.other.fullName)}. They have not replied yet.`}
        </p>
      )}

      {r.status !== "requested" && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-[13px] text-ink-muted">{firstName(r.other.fullName)}&apos;s self-assessment</p>
            <p className="mt-1 text-[16px] font-bold text-ink">{baselineLabel[theirs]}</p>
          </div>
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-[13px] text-ink-muted">Your assessment of {firstName(r.other.fullName)}</p>
            <p className="mt-1 text-[16px] font-bold text-ink">{baselineLabel[mine]}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {mustReply && <LinkButton href={`/relationships/${r.id}`}>Reply to request</LinkButton>}
        {r.status === "accepted_baseline_pending" && mine !== "submitted" && (
          <LinkButton href={r.myAssessmentId ? `/assessments/${r.myAssessmentId}` : `/assessments?start=${r.id}`}>{mine === "not_started" ? "Start my assessment" : "Continue my assessment"}</LinkButton>
        )}
        {r.status === "active" && <LinkButton href={`/relationships/${r.id}`}>Results</LinkButton>}
        {r.status === "active" && (
          <LinkButton href={`/relationships/${r.id}#plan`} variant="secondary">
            Growth plan
          </LinkButton>
        )}
        {r.status !== "requested" && (
          <LinkButton href={`/relationships/${r.id}#meetings`} variant="secondary">
            Meetings
          </LinkButton>
        )}
        {r.status === "requested" && (
          <LinkButton href={`/relationships/${r.id}`} variant="secondary">
            Open
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

function Stat({ n, label, alert }: { n: number; label: string; alert?: boolean }) {
  const on = alert && n > 0;
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${on ? "border-brand-line bg-brand-soft" : "border-surface-line bg-card"}`}>
      <p className={`text-[28px] font-extrabold leading-none md:text-[32px] ${on ? "text-brand" : "text-ink"}`}>{n}</p>
      <p className="mt-2 text-[13px] leading-tight text-ink-muted md:text-[14px]">{label}</p>
    </div>
  );
}

/** The disciple's week: practice progress and the next meeting (PRD 8.3). */
function ThisWeek({ relId }: { relId: string }) {
  const plan = useApi<PlanStateDto>(`/relationships/${relId}/plan`);
  const meetings = useApi<MeetingsDto>(`/relationships/${relId}/meetings`);
  if (plan.loading || meetings.loading) return null;
  const active = plan.data?.active;
  const next = meetings.data?.upcoming[0];
  return (
    <Card>
      <Eyebrow className="mb-3">This week</Eyebrow>
      {active ? (
        <Link href={`/relationships/${relId}#plan`} className="-mx-2 block rounded-xl px-2 py-1 hover:bg-surface">
          <p className="text-[15px] font-semibold text-ink">Focus: {active.focusAreas.map((a) => getArea(a).name).join(", ")}</p>
          <ul className="mt-1 space-y-0.5">
            {active.practices.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 text-[14px]">
                <span className="truncate text-ink-muted">{p.title}</span>
                <span className={`shrink-0 font-semibold ${p.doneThisWeek.length >= p.timesPerWeek ? "text-ok" : "text-ink"}`}>
                  {p.doneThisWeek.length} of {p.timesPerWeek}
                </span>
              </li>
            ))}
          </ul>
        </Link>
      ) : (
        <Link href={`/relationships/${relId}#plan`} className="block text-[15px] text-ink hover:text-brand">
          {plan.data?.draft ? "A growth plan is waiting for confirmation." : "No growth plan yet. Agree one with your discipler."}
        </Link>
      )}
      <Link href={`/relationships/${relId}#meetings`} className="-mx-2 mt-3 block rounded-xl border-t border-surface-line px-2 pt-3 hover:bg-surface">
        <p className="text-[13px] text-ink-muted">Next meeting</p>
        <p className="text-[15px] font-semibold text-ink">{next ? `${fmtDateTime(next.scheduledAt)}${next.place ? ` · ${next.place}` : ""}` : "Not scheduled yet"}</p>
      </Link>
    </Card>
  );
}
