"use client";
import { getArea, type AreaPoint, type RelationshipProgressDto } from "@daveup/shared";
import { Card, Eyebrow } from "@/components/ui";
import { fmtDay } from "@/lib/labels";

const avg = (p: AreaPoint | undefined) => {
  if (!p) return null;
  const v = [p.disciple, p.discipler].filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

/** Recent progress in words, then each area against the starting point (PRD 7.5, 8.5). */
export function ProgressCard({ progress }: { progress: RelationshipProgressDto }) {
  const { points, summary, current, nextDueOn } = progress;
  const first = points[0];
  const last = points.at(-1);

  if (!first || !last) return null;
  if (points.length < 2) {
    return (
      <Card className="mb-4">
        <Eyebrow className="mb-1">Recent progress</Eyebrow>
        <p className="text-[15px] text-ink">Your baseline is your starting point. Progress appears here after your first monthly check.</p>
        {!current && nextDueOn && <p className="mt-1 text-[14px] text-ink-muted">The first check is due {fmtDay(nextDueOn, true)}.</p>}
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <Eyebrow className="mb-1">Recent progress</Eyebrow>
      <p className="text-[16px] font-semibold text-ink">{summary?.text}</p>
      <p className="mt-1 text-[13px] text-ink-muted">
        {last.label}, {fmtDay(last.date)}, compared with the previous assessment. Both views are averaged. Development indicators, not grades.
        {!current && nextDueOn ? ` Next check due ${fmtDay(nextDueOn)}.` : ""}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead>
            <tr className="border-b border-surface-line text-[12px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="py-2 pr-3">Area</th>
              <th className="py-2 pr-3">Start</th>
              <th className="py-2 pr-3">Now</th>
              <th className="py-2">Since last</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {last.areas.map((p) => {
              const start = avg(first.areas.find((x) => x.area === p.area));
              const now = avg(p);
              const prevPoint = points.at(-2)!;
              const prev = avg(prevPoint.areas.find((x) => x.area === p.area));
              const d = now !== null && prev !== null ? now - prev : null;
              const up = summary?.improved.includes(p.area);
              return (
                <tr key={p.area} className={up ? "bg-ok-soft/50" : ""}>
                  <td className="py-2.5 pr-3 text-[14px] font-semibold text-ink">{getArea(p.area).name}</td>
                  <td className="py-2.5 pr-3 text-[14px] text-ink-muted">{start ?? "n/a"}</td>
                  <td className="py-2.5 pr-3 text-[14px] font-bold text-ink">{now ?? "n/a"}</td>
                  <td className={`py-2.5 text-[14px] font-semibold ${d === null ? "text-ink-faint" : d >= 2 ? "text-ok" : d <= -2 ? "text-brand" : "text-ink-muted"}`}>
                    {d === null ? "n/a" : d > 0 ? `Up ${d}` : d < 0 ? `Down ${-d}` : "Same"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
