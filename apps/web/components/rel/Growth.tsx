"use client";
// Faith (Priest) and Impact (King): the two growth scores (PRD 38.26).
// Never combined into one number, never a grade. When the two sit more than
// 20 points apart, both people see a prompt to talk, never a label.
import {
  DOMAIN_LABEL,
  DOMAIN_MAX,
  domainGap,
  type DomainScores,
  type ProgressPointDto,
  type RelationshipProgressDto,
} from "@daveup/shared";
import { Card, Eyebrow, LinkButton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { firstName, fmtDay } from "@/lib/labels";

type Perspective = "disciple" | "discipler";

/** Faith and Impact for one point: the average of the perspectives that exist, as whole percentages. */
export function faithImpact(p: ProgressPointDto | undefined): { faith: number | null; impact: number | null } {
  const mean = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
  };
  if (!p) return { faith: null, impact: null };
  return {
    faith: mean([p.domains.disciple.priest.percent, p.domains.discipler.priest.percent]),
    impact: mean([p.domains.disciple.king.percent, p.domains.discipler.king.percent]),
  };
}

function signed(d: number | null): string | null {
  if (d === null) return null;
  return d > 0 ? `+${d}` : d < 0 ? `${d}` : "±0";
}

function deltas(points: ProgressPointDto[]) {
  const now = faithImpact(points.at(-1));
  const prev = points.length > 1 ? faithImpact(points.at(-2)) : null;
  const diff = (a: number | null, b: number | null | undefined) => (a !== null && b != null ? a - b : null);
  return { now, faithDelta: diff(now.faith, prev?.faith), impactDelta: diff(now.impact, prev?.impact) };
}

/** Home card: "GROWTH YOU CAN SEE. Faith 72% (+8). Impact 49% (+5)." For the disciple's own relationship. */
export function HomeGrowthCard({ relId }: { relId: string }) {
  const progress = useApi<RelationshipProgressDto>(`/relationships/${relId}/progress`);
  const points = progress.data?.points ?? [];
  if (points.length === 0) return null;
  const { now, faithDelta, impactDelta } = deltas(points);

  const Stat = ({ label, value, delta }: { label: string; value: number | null; delta: number | null }) => (
    <div>
      <p className="text-[14px] font-semibold text-ink-muted">{label}</p>
      <p className="text-[30px] font-extrabold leading-tight text-ink">{value === null ? "n/a" : `${value}%`}</p>
      {delta !== null && <p className={`text-[14px] font-bold ${delta > 0 ? "text-ok" : "text-ink-muted"}`}>({signed(delta)})</p>}
    </div>
  );

  return (
    <Card>
      <Eyebrow className="mb-3">Growth you can see</Eyebrow>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Stat label={DOMAIN_LABEL.priest.plain} value={now.faith} delta={faithDelta} />
        <Stat label={DOMAIN_LABEL.king.plain} value={now.impact} delta={impactDelta} />
      </div>
      <LinkButton href={`/relationships/${relId}`} variant="secondary">
        See my growth
      </LinkButton>
    </Card>
  );
}

/** A small two-line trend of Faith and Impact, one dot per revealed point. */
function Trend({ points }: { points: ProgressPointDto[] }) {
  const series = points.map(faithImpact);
  const W = 600;
  const H = 150;
  const pad = 12;
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (points.length - 1));
  const y = (v: number) => H - pad - (v / 100) * (H - 2 * pad);
  const line = (key: "faith" | "impact") =>
    series
      .map((s, i) => (s[key] === null ? null : `${x(i)},${y(s[key]!)}`))
      .filter(Boolean)
      .join(" ");
  const dots = (key: "faith" | "impact", cls: string) =>
    series.map((s, i) => (s[key] === null ? null : <circle key={`${key}${i}`} cx={x(i)} cy={y(s[key]!)} r={3.5} className={cls} />));

  return (
    <figure className="mt-4 max-w-2xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faith and Impact over time">
        {[0, 50, 100].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} className="stroke-surface-line" strokeWidth={1} />
        ))}
        <polyline points={line("faith")} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={line("impact")} fill="none" className="stroke-sky-500" strokeWidth={2.5} strokeLinejoin="round" />
        {dots("faith", "fill-brand")}
        {dots("impact", "fill-sky-500")}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" /> {DOMAIN_LABEL.priest.plain}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> {DOMAIN_LABEL.king.plain}
        </span>
        <span>
          {points.length === 1 ? "Your starting point." : `${fmtDay(points[0]!.date)} to ${fmtDay(points.at(-1)!.date)}, both views averaged.`}
        </span>
      </figcaption>
    </figure>
  );
}

function DomainLine({ label, s }: { label: string; s: DomainScores["priest"] }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[15px] text-ink">{label}</span>
      <span className="text-[15px] font-bold text-ink">
        {s.outOf120 === null ? "n/a" : `${s.outOf120} of ${DOMAIN_MAX}`}
        {s.percent !== null && <span className="ml-2 font-semibold text-ink-muted">{s.percent}%</span>}
      </span>
    </p>
  );
}

/**
 * Results: "Your growth, Faith and Impact", then Priest and King out of 120 from
 * each perspective, and the gap note when Faith and Impact are far apart.
 */
export function GrowthResults({ progress, myRole, otherName }: { progress: RelationshipProgressDto; myRole: Perspective; otherName: string }) {
  const last = progress.points.at(-1);
  if (!last) return null;
  const iAmDisciple = myRole === "disciple";
  const other = firstName(otherName);
  const { faithDelta, impactDelta } = deltas(progress.points);

  // Test B is the disciple's own answers ("About you"); Test A is the discipler's ("About them").
  const views: { key: Perspective; title: string; sub: string }[] = [
    { key: "disciple", title: iAmDisciple ? "About you" : `About ${other}, by ${other}`, sub: iAmDisciple ? "Your own answers" : `${other}'s own answers` },
    { key: "discipler", title: iAmDisciple ? `About you, by ${other}` : `About ${other}, by you`, sub: iAmDisciple ? `${other}'s answers about you` : "Your answers" },
  ];
  // One note, not one per view: prefer the reader's own answers, then the other view.
  const mine: Perspective = iAmDisciple ? "disciple" : "discipler";
  const gaps = [...views]
    .sort((x, y) => (x.key === mine ? -1 : 0) - (y.key === mine ? -1 : 0))
    .map((v) => ({ v, gap: domainGap(last.domains[v.key]) }))
    .filter((g) => g.gap !== null)
    .slice(0, 1);

  return (
    <div className="mb-6">
      <h2 className="text-[22px] font-extrabold text-ink md:text-[26px]">Your growth, Faith and Impact</h2>
      <p className="mb-4 mt-1 text-[15px] text-ink-muted">
        {last.label}, {fmtDay(last.date)}.
        {faithDelta !== null && impactDelta !== null && ` Since the previous one: Faith ${signed(faithDelta)}, Impact ${signed(impactDelta)}.`} Two separate scores, never one grade.
      </p>

      {gaps.map(({ v, gap }) => (
        <Card key={v.key} tone="soft" className="mb-4">
          <p className="text-[16px] font-bold text-ink">Worth a conversation.</p>
          <p className="mt-1 text-[15px] text-ink">
            {v.key === "disciple"
              ? iAmDisciple
                ? `Your Faith and Impact scores are ${gap} points apart. This is not a grade. Talk it through with your guide.`
                : `${other}'s Faith and Impact scores are ${gap} points apart in their own answers. This is not a grade. Talk it through together.`
              : iAmDisciple
                ? `In ${other}'s answers about you, your Faith and Impact scores are ${gap} points apart. This is not a grade. Talk it through with your guide.`
                : `In your answers about ${other}, their Faith and Impact scores are ${gap} points apart. This is not a grade. Talk it through together.`}
          </p>
        </Card>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        {views.map((v) => (
          <Card key={v.key}>
            <p className="text-[17px] font-bold text-ink">{v.title}</p>
            <p className="mb-2 text-[13px] text-ink-muted">{v.sub}</p>
            <div className="divide-y divide-surface-line">
              <DomainLine label={`${DOMAIN_LABEL.priest.name} (${DOMAIN_LABEL.priest.plain})`} s={last.domains[v.key].priest} />
              <DomainLine label={`${DOMAIN_LABEL.king.name} (${DOMAIN_LABEL.king.plain})`} s={last.domains[v.key].king} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <Eyebrow>Month by month</Eyebrow>
        <Trend points={progress.points} />
      </Card>
    </div>
  );
}
