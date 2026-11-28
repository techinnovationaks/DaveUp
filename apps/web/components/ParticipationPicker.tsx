"use client";
import type { Participation } from "@daveup/shared";

const OPTIONS: { value: Participation; title: string; sub: string }[] = [
  { value: "grow", title: "I want to grow", sub: "Be discipled by someone in your organization." },
  { value: "disciple", title: "I disciple others", sub: "Walk with people and help them grow." },
  { value: "both", title: "Both", sub: "Grow with a discipler and disciple others." },
];

/** PRD 5.2: how will you use DaveUp. Not permanent; it only tailors setup. */
export function ParticipationPicker({ value, onChange }: { value: Participation | null; onChange: (v: Participation) => void }) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-[14px] font-semibold text-ink">How will you use DaveUp?</legend>
      <div className="space-y-3">
        {OPTIONS.map((o) => (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`w-full rounded-2xl border p-4 text-left ${value === o.value ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-surface-line bg-card"}`}
          >
            <p className="text-[16px] font-bold text-ink">{o.title}</p>
            <p className="mt-0.5 text-[14px] text-ink-muted">{o.sub}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-ink-muted">You can change this later.</p>
    </fieldset>
  );
}
