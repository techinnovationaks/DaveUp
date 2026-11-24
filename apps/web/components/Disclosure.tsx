"use client";

/** PRD 6.7 rule 2 / 13.4 item 6: tell the disciple exactly what their discipler will see. */
export function Disclosure({ checked, onChange, disciplerName }: { checked: boolean; onChange: (v: boolean) => void; disciplerName: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-surface-line bg-white p-4">
      <p className="text-[15px] font-bold text-ink">What {disciplerName} will see</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-muted">
        <li>Your area scores from the 12-area assessment, side by side with theirs, once you have both finished.</li>
        <li>Not your individual answers or evidence notes.</li>
        <li>Not your other relationships in the organization.</li>
      </ul>
      <p className="mt-2 text-[14px] text-ink-muted">You can end the relationship or raise a concern at any time.</p>
      <label className="mt-3 flex items-start gap-3 text-[15px] text-ink">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        I understand and agree
      </label>
    </div>
  );
}
