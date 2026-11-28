"use client";
// The top of Home, after the app view in DaveUp.html: a deep navy panel with
// your people, your line (you at the centre, the people you walk with around
// you), your Faith and Impact scores, and what is next. Real data only; empty
// states point to the next step.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MeDto, MeetingsDto, RelationshipDto, RelationshipProgressDto } from "@daveup/shared";
import { api, useApi } from "@/lib/api";
import { firstName } from "@/lib/labels";
import { deltas, signed } from "@/components/rel/Growth";
import { OrgSheetButton } from "@/components/OrgSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

const OPEN = ["requested", "accepted_baseline_pending", "active", "paused"];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Ring colour by where the relationship stands. */
function ringFor(r: RelationshipDto): { stroke: string; dash?: string; label: string } {
  if (r.status === "active") return { stroke: "#34D399", label: "Walking together" };
  if (r.status === "paused") return { stroke: "#93A8DB", label: "Paused" };
  if (r.status === "accepted_baseline_pending") return { stroke: "#FBBF24", label: "Getting started" };
  return { stroke: "#93A8DB", dash: "4 4", label: r.awaiting === "me" || r.awaiting === "both" ? "Waiting for your reply" : "Waiting for a reply" };
}

/** A person with a cyan ring, like a story bubble. */
function Bubble({ name, href, sub }: { name: string; href: string; sub: string }) {
  return (
    <Link href={href} className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
      <span className="rounded-full bg-gradient-to-br from-glow to-[#38BDF8] p-[3px] transition-transform group-hover:scale-105">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-page bg-[#2B4AA8] text-[15px] font-bold text-white">{initialsOf(name)}</span>
      </span>
      <span className="w-full truncate text-[12px] font-semibold text-ink">{firstName(name)}</span>
      <span className="-mt-1 w-full truncate text-[10px] text-ink-muted">{sub}</span>
    </Link>
  );
}

function AddBubble({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
      <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-ink-faint text-[26px] font-light text-ink transition-colors group-hover:border-glow group-hover:text-glow">+</span>
      <span className="w-full truncate text-[12px] font-semibold text-ink">{label}</span>
    </Link>
  );
}

/** You at the centre, the people you walk with on a ring around you. */
function Line({ me, people }: { me: MeDto; people: RelationshipDto[] }) {
  const cx = 195;
  const cy = 150;
  const R = 92;
  const shown = people.slice(0, 12);
  return (
    <svg viewBox="0 0 390 300" className="h-auto w-full" role="img" aria-label={`Your line: you at the centre with ${people.length} ${people.length === 1 ? "person" : "people"} around you`}>
      <g className="origin-[195px_150px] motion-safe:animate-[daveup-orbit_120s_linear_infinite]">
        <circle cx={cx} cy={cy} r={132} fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5" strokeDasharray="3 7" opacity=".6" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 + 0.3;
          return <circle key={i} cx={cx + 132 * Math.cos(a)} cy={cy + 132 * Math.sin(a)} r="3.5" fill="currentColor" className="text-ink-faint" opacity=".6" />;
        })}
      </g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5" opacity=".45" />
      {/* The 12 places around a discipler, faint where empty. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return i >= shown.length ? <circle key={i} cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)} r="5" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5" strokeDasharray="2 3" opacity=".7" /> : null;
      })}
      {shown.map((r, i) => {
        const a = (i / Math.max(12, shown.length)) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(a);
        const y = cy + R * Math.sin(a);
        const ring = ringFor(r);
        return (
          <a key={r.id} href={`/relationships/${r.id}`} aria-label={`${r.other.fullName}: ${ring.label}`}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={ring.stroke} strokeWidth="1.5" opacity=".35" />
            <circle cx={x} cy={y} r="22" fill="#2B4AA8" />
            <circle cx={x} cy={y} r="22" fill="none" stroke={ring.stroke} strokeWidth="3" strokeDasharray={ring.dash} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
              {initialsOf(r.other.fullName)}
            </text>
            <text x={x} y={y + 38} textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" className="text-ink">
              {firstName(r.other.fullName)}
              {r.myRole === "disciple" ? " (discipler)" : ""}
            </text>
          </a>
        );
      })}
      <circle cx={cx} cy={cy} r="40" fill="currentColor" className="text-ink" opacity=".1" />
      <circle cx={cx} cy={cy} r="30" fill="currentColor" className="text-brand" />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor" className="text-on-brand">
        {initialsOf(me.person.fullName ?? "You")}
      </text>
      <text x={cx} y={cy + 50} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" className="text-ink">
        You
      </text>
    </svg>
  );
}

function ScorePill({ label, value, delta }: { label: string; value: number | null; delta: number | null }) {
  return (
    <div className="rounded-[8px] border border-surface-line bg-card/70 px-4 py-2.5 text-ink backdrop-blur">
      <p className="text-[13px] font-semibold text-ink-muted">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="font-display text-[26px] font-extrabold leading-none">{value === null ? "–" : `${value}%`}</span>
        {delta !== null && <span className={`text-[15px] font-bold ${delta > 0 ? "text-ok" : "text-ink-muted"}`}>{signed(delta)}</span>}
      </p>
    </div>
  );
}

/** The white "what is next" card (N designs 6 and 193). */
function NextCard({ href, eyebrow, title, sub, cta, icon }: { href: string; eyebrow: string; title: string; sub?: string; cta: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-[8px] bg-white p-4 text-[#041A4D] shadow-[0_20px_40px_-20px_rgba(0,0,0,.6)] transition-transform hover:-translate-y-0.5 md:p-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FA] text-[#0891B2]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-extrabold tracking-[0.14em] text-[#1E3A8A]">{eyebrow}</span>
        <span className="block truncate font-display text-[20px] font-extrabold leading-tight">{title}</span>
        {sub && <span className="block text-[14px] text-[#64748B]">{sub}</span>}
      </span>
      <span className="shrink-0 rounded-full bg-[#0B2A80] px-5 py-3 text-[16px] font-bold text-white">{cta}</span>
    </Link>
  );
}

const CalIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 5h18v16H3zM16 3v4M8 3v4M3 10h18" />
  </svg>
);
const BookIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM9 7h5" />
  </svg>
);

/** The earliest upcoming meeting across up to four of my relationships. */
function useNextMeeting(rels: RelationshipDto[]) {
  const ids = rels
    .filter((r) => r.status === "active" || r.status === "accepted_baseline_pending")
    .slice(0, 4)
    .map((r) => r.id)
    .join(",");
  const [next, setNext] = useState<{ at: string; place: string | null; rel: RelationshipDto } | null>(null);
  useEffect(() => {
    let live = true;
    const list = ids ? ids.split(",") : [];
    void Promise.all(list.map((id) => api<MeetingsDto>(`/relationships/${id}/meetings`).catch(() => null))).then((all) => {
      if (!live) return;
      const upcoming = all.flatMap((m) => (m ? m.upcoming.map((u) => ({ at: u.scheduledAt, place: u.place, rel: rels.find((r) => r.id === m.relationshipId)! })) : [])).filter((u) => u.rel);
      upcoming.sort((a, b) => a.at.localeCompare(b.at));
      setNext(upcoming[0] ?? null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return next;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase();
  if (d.toDateString() === today.toDateString()) return `TODAY, ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `TOMORROW, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }).toUpperCase()}, ${time}`;
}

export function HomeHero({ me, rels, greeting, start }: { me: MeDto; rels: RelationshipDto[]; greeting: string; start?: { href: string; title: string; sub: string } | null }) {
  const open = rels.filter((r) => OPEN.includes(r.status));
  const myDiscipler = open.find((r) => r.myRole === "disciple" && r.status !== "requested") ?? open.find((r) => r.myRole === "disciple");
  const disciples = open.filter((r) => r.myRole === "discipler");
  const people = [...(myDiscipler ? [myDiscipler] : []), ...disciples];
  const isDiscipler = me.disciplerStatus === "approved";
  const active = myDiscipler?.status === "active" ? myDiscipler : undefined;
  const progress = useApi<RelationshipProgressDto>(active ? `/relationships/${active.id}/progress` : null);
  const points = progress.data?.points ?? [];
  const scores = points.length ? deltas(points) : null;
  const next = useNextMeeting(open);
  const walking = disciples.filter((r) => r.status === "active").length;
  const newcomer = disciples.length === 0 && (!myDiscipler || myDiscipler.status !== "active");

  return (
    <section className="relative mb-6 text-ink md:overflow-hidden md:rounded-[8px] md:border md:border-surface-line md:bg-card md:px-8 md:pb-8 md:pt-7">
      <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(500px_300px_at_85%_10%,rgba(1,253,255,.14),transparent_60%)] md:block" aria-hidden />
      <div className="relative">
        {/* Header: organization, greeting, you. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <OrgSheetButton me={me} />
            <h1 className="mt-1 font-display text-[40px] font-extrabold leading-[1.02] tracking-tight md:text-[48px]">
              {greeting === "Hey" ? "Hey" : greeting}, {firstName(me.person.fullName)}
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
          <ThemeToggle />
          <Link href="/account" aria-label="Account" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-brand-soft text-[18px] font-extrabold text-ink">
            {initialsOf(me.person.fullName ?? "")}
          </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div className="min-w-0">
            {newcomer ? (
              <p className="flex items-start justify-between gap-3">
                <span className="font-display text-[24px] font-extrabold leading-tight">Day 1. Your line starts here.</span>
                <Link href="/disciplers" className="shrink-0 pt-1 text-[16px] font-bold text-ink-muted hover:text-ink">
                  {myDiscipler ? "Why?" : "Find a discipler"}
                </Link>
              </p>
            ) : (
              <>
                {/* Your people, like story bubbles. */}
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {isDiscipler && disciples.length < 12 && <AddBubble href="/invite" label="Invite" />}
                  {people.map((r) => (
                    <Bubble key={r.id} name={r.other.fullName} href={`/relationships/${r.id}`} sub={r.myRole === "disciple" ? "Discipler" : ringFor(r).label} />
                  ))}
                </div>
                <p className="mt-3 flex items-center justify-between gap-3">
                  <b className="font-display text-[22px] font-extrabold leading-tight">
                    {people.length} in your line{isDiscipler ? `, ${walking} walking with you` : ""}
                  </b>
                  {isDiscipler && (
                    <a href="/home?mode=lead" className="shrink-0 text-[16px] font-bold text-ink-muted hover:text-ink">
                      See all
                    </a>
                  )}
                </p>
              </>
            )}
            <div className="mt-5 hidden lg:block">
              <HeroNext next={next} start={start} />
            </div>
          </div>

          {/* Your line, with your two scores under it. */}
          <div className="mx-auto w-full max-w-[460px]">
            <Line me={me} people={people} />
            <div className="-mt-4 flex items-end justify-between gap-3">
              <ScorePill label="Faith" value={scores?.now.faith ?? null} delta={scores?.faithDelta ?? null} />
              <ScorePill label="Impact" value={scores?.now.impact ?? null} delta={scores?.impactDelta ?? null} />
            </div>
            {!scores && (
              <p className="mt-3 text-center text-[15px] text-ink-muted">
                {active ? "Your scores appear after your first assessment with your discipler." : myDiscipler ? `Finish your assessment and ${firstName(myDiscipler.other.fullName)} starts walking with you. Later, your own line grows from here.` : "Choose a discipler to start. Your Faith and Impact scores appear as you walk together."}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 lg:hidden">
          <HeroNext next={next} start={start} />
        </div>
      </div>
    </section>
  );
}

function HeroNext({ next, start }: { next: { at: string; place: string | null; rel: RelationshipDto } | null; start?: { href: string; title: string; sub: string } | null }) {
  if (start) return <NextCard href={start.href} eyebrow="START HERE" title={start.title} sub={start.sub} cta="Start" icon={BookIcon} />;
  if (next)
    return (
      <NextCard
        href={`/relationships/${next.rel.id}#meetings`}
        eyebrow={whenLabel(next.at)}
        title={`Meeting with ${firstName(next.rel.other.fullName)}`}
        sub={next.place ?? "Look over your notes and growth plan"}
        cta="Prepare"
        icon={CalIcon}
      />
    );
  return <NextCard href="/journal/new" eyebrow="TODAY" title="Write in your journal" sub="What did God show you today?" cta="Write" icon={BookIcon} />;
}
