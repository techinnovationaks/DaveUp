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
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-night-2 bg-[#2B4AA8] text-[15px] font-bold text-white">{initialsOf(name)}</span>
      </span>
      <span className="w-full truncate text-[12px] font-semibold text-white">{firstName(name)}</span>
      <span className="-mt-1 w-full truncate text-[10px] text-night-muted">{sub}</span>
    </Link>
  );
}

function AddBubble({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
      <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-[#93A8DB] text-[26px] font-light text-white transition-colors group-hover:border-glow group-hover:text-glow">+</span>
      <span className="w-full truncate text-[12px] font-semibold text-white">{label}</span>
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
        <circle cx={cx} cy={cy} r={132} fill="none" stroke="#7C93D6" strokeWidth="1.5" strokeDasharray="3 7" opacity=".6" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 + 0.3;
          return <circle key={i} cx={cx + 132 * Math.cos(a)} cy={cy + 132 * Math.sin(a)} r="3.5" fill="#5B73B8" opacity=".6" />;
        })}
      </g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#7C93D6" strokeWidth="1.5" opacity=".45" />
      {/* The 12 places around a discipler, faint where empty. */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return i >= shown.length ? <circle key={i} cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)} r="5" fill="none" stroke="#7C93D6" strokeWidth="1.5" strokeDasharray="2 3" opacity=".7" /> : null;
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
            <text x={x} y={y + 38} textAnchor="middle" fontSize="11" fontWeight="600" fill="#DCE5FA">
              {firstName(r.other.fullName)}
              {r.myRole === "disciple" ? " (discipler)" : ""}
            </text>
          </a>
        );
      })}
      <circle cx={cx} cy={cy} r="40" fill="#fff" opacity=".12" />
      <circle cx={cx} cy={cy} r="30" fill="#01FDFF" />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="#041A4D">
        {initialsOf(me.person.fullName ?? "You")}
      </text>
      <text x={cx} y={cy + 50} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
        You
      </text>
    </svg>
  );
}

function ScorePill({ label, value, delta, side }: { label: string; value: number | null; delta: number | null; side: "l" | "r" }) {
  return (
    <div className={`absolute top-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-night/70 px-3 py-2 text-white backdrop-blur ${side === "l" ? "left-0" : "right-0"}`}>
      <p className="text-[11px] font-semibold text-night-muted">{label}</p>
      <p className="font-display text-[22px] font-extrabold leading-none">{value === null ? "–" : `${value}%`}</p>
      {delta !== null && <p className={`text-[11px] font-bold ${delta > 0 ? "text-glow" : "text-night-muted"}`}>{signed(delta)} this month</p>}
    </div>
  );
}

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

export function HomeHero({ me, rels, greeting }: { me: MeDto; rels: RelationshipDto[]; greeting: string }) {
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

  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] bg-gradient-to-b from-night-2 to-night-3 px-5 pb-5 pt-6 text-white shadow-[0_30px_60px_-30px_rgba(4,26,77,.7)] md:px-8 md:pt-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_300px_at_85%_10%,rgba(1,253,255,.16),transparent_60%)]" aria-hidden />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-night-muted">
            {me.membership?.churchName} · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-1 font-display text-[34px] font-extrabold leading-tight tracking-tight md:text-[42px]">
            {greeting}, {firstName(me.person.fullName)}
          </h1>

          {/* Your people, like story bubbles. */}
          <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
            {isDiscipler && disciples.length < 12 && <AddBubble href="/invite" label="Invite" />}
            {!myDiscipler && <AddBubble href="/disciplers" label="Find a discipler" />}
            {people.map((r) => (
              <Bubble key={r.id} name={r.other.fullName} href={`/relationships/${r.id}`} sub={r.myRole === "disciple" ? "Discipler" : ringFor(r).label} />
            ))}
          </div>
          <p className="mt-3 flex items-center justify-between text-[13px]">
            <b className="font-semibold">
              {people.length === 0 ? "Your line starts with one person." : `${people.length} in your line${isDiscipler ? `, ${walking} walking with you` : ""}`}
            </b>
            {isDiscipler ? (
              <a href="/home?mode=lead" className="font-semibold text-[#9DB8FF] hover:text-white">
                See all
              </a>
            ) : !myDiscipler ? (
              <Link href="/disciplers" className="font-semibold text-[#9DB8FF] hover:text-white">
                Choose a discipler
              </Link>
            ) : null}
          </p>

          {/* What is next. */}
          {next ? (
            <Link href={`/relationships/${next.rel.id}#meetings`} className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[0.09] p-3.5 transition-colors hover:bg-white/[0.14]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-glow/20 text-[14px] font-bold text-glow">{initialsOf(next.rel.other.fullName)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold tracking-wider text-glow">{whenLabel(next.at)}</span>
                <span className="block truncate text-[15px] font-semibold">
                  Meeting with {firstName(next.rel.other.fullName)}
                  {next.place ? ` · ${next.place}` : ""}
                </span>
              </span>
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-night">Prepare</span>
            </Link>
          ) : (
            <Link href="/journal" className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[0.09] p-3.5 transition-colors hover:bg-white/[0.14]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-glow/20 text-glow" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM9 7h5M9 11h5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold tracking-wider text-glow">NO MEETING PLANNED</span>
                <span className="block truncate text-[15px] font-semibold">Write in your journal today</span>
              </span>
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-night">Write</span>
            </Link>
          )}
        </div>

        {/* Your line, with your two scores beside it. */}
        <div className="relative mx-auto w-full max-w-[460px]">
          <Line me={me} people={people} />
          <ScorePill side="l" label="Faith" value={scores?.now.faith ?? null} delta={scores?.faithDelta ?? null} />
          <ScorePill side="r" label="Impact" value={scores?.now.impact ?? null} delta={scores?.impactDelta ?? null} />
          {!scores && (
            <p className="mt-1 text-center text-[12px] text-night-muted">
              {active ? "Your scores appear after your first assessment with your discipler." : "Your Faith and Impact scores appear once you walk with a discipler."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
