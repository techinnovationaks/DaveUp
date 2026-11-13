"use client";
import { useState } from "react";
import { MAX_ACTIVE_DISCIPLES, type ChurchMemberDto, type SuggestResultDto } from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, Initials, Loading, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";

/**
 * Choose an approved discipler to suggest for one or more members.
 * A suggestion is not an assignment: both people accept it (PRD 6.3).
 */
export function DisciplerPicker({ forPeople, onDone }: { forPeople: { personId: string; fullName: string | null }[]; onDone: (r: SuggestResultDto | null) => void }) {
  const members = useApi<ChurchMemberDto[]>("/admin/members");
  const [q, setQ] = useState("");
  const { busy, error, run } = useAction();

  if (members.loading) return <Loading />;
  const ids = new Set(forPeople.map((p) => p.personId));
  const disciplers = (members.data ?? [])
    .filter((m) => m.status === "approved" && m.disciplerStatus === "approved" && !ids.has(m.personId))
    .filter((m) => !q.trim() || (m.fullName ?? "").toLowerCase().includes(q.trim().toLowerCase()) || (m.department ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.disciplesCount - b.disciplesCount);

  const suggest = (disciplerId: string) =>
    run(async () => onDone(await api<SuggestResultDto>("/admin/relationships", { method: "POST", body: { disciplerId, discipleIds: forPeople.map((p) => p.personId) } })));

  const names = forPeople.map((p) => p.fullName ?? "Member");
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Eyebrow>Suggest a discipler</Eyebrow>
        <button onClick={() => onDone(null)} className="text-[14px] font-semibold text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
      <p className="mb-3 text-[14px] text-ink-muted">
        For {names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`}. Both people are asked to accept; nobody is paired without agreeing.
      </p>
      <input className={`${inputClass} mb-3`} placeholder="Search disciplers by name or department" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorText>{error ?? members.error?.message}</ErrorText>
      {disciplers.length === 0 ? (
        <p className="py-2 text-[15px] text-ink-muted">No approved disciplers match. Approve disciplers first.</p>
      ) : (
        <div className="divide-y divide-surface-line">
          {disciplers.map((m) => {
            const open = MAX_ACTIVE_DISCIPLES - m.disciplesCount;
            return (
              <div key={m.personId} className="flex items-center gap-3 py-3">
                <Initials name={m.fullName ?? ""} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{m.fullName}</p>
                  <p className="text-[13px] text-ink-muted">
                    {m.department ?? "No department"} · {open > 0 ? `${open} of ${MAX_ACTIVE_DISCIPLES} places open` : "Full"}
                  </p>
                </div>
                <Button disabled={busy || open <= 0} onClick={() => suggest(m.personId)} className="!min-h-[40px] !min-w-0 !w-auto px-4 text-[14px]">
                  Suggest
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Plain summary of a suggestion result. */
export function suggestSummary(r: SuggestResultDto): string {
  const parts = [r.created ? `Suggested to ${r.created} ${r.created === 1 ? "person" : "people"}. They are asked to accept.` : "Nothing was suggested."];
  for (const s of r.skipped) parts.push(`${s.fullName ?? "A member"}: ${s.reason}.`);
  return parts.join(" ");
}
