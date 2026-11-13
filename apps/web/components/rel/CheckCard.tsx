"use client";
import { useRouter } from "next/navigation";
import type { AssessmentSummaryDto, CycleDto } from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, Pill } from "@/components/ui";
import { api, useAction } from "@/lib/api";
import { dueText, firstName, fmtDay } from "@/lib/labels";

/** The open monthly check for one relationship (PRD 38.19). */
export function CheckCard({ cycle, myRole, otherName }: { cycle: CycleDto; myRole: "disciple" | "discipler"; otherName: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const other = firstName(otherName);
  const full = cycle.kind === "full";
  const mineDone = cycle.mine?.status === "submitted";
  const late = cycle.due.state === "late" || cycle.due.state === "overdue";

  const start = () =>
    run(async () => {
      const a = await api<AssessmentSummaryDto>(`/cycles/${cycle.id}/start`, { method: "POST" });
      router.push(`/assessments/${a.id}`);
    });

  return (
    <Card tone={mineDone ? "plain" : "soft"} className="mb-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{full ? "Full assessment" : "Monthly check"}</Eyebrow>
        <Pill tone={mineDone ? "green" : late ? "amber" : "red"}>{mineDone ? "Your part is done" : dueText(cycle.due)}</Pill>
      </div>
      <p className="text-[17px] font-bold text-ink">
        {full ? "All 60 questions, as at the baseline" : "Twelve questions, one from each area, about 4 minutes"}
      </p>
      <p className="mt-1 text-[14px] text-ink-muted">
        Due {fmtDay(cycle.dueOn)}. {myRole === "disciple" ? "You answer about yourself" : `You answer about ${other}`}; {other} answers separately. You see the change together once you have both finished.
        {late ? " Nothing is locked while it is late." : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
        <span className="text-ink-muted">
          You: <span className="font-semibold text-ink">{mineDone ? "Finished" : cycle.mine ? `${cycle.mine.progress.answered} of ${cycle.mine.progress.total} answered` : "Not started"}</span>
        </span>
        <span className="text-ink-muted">
          {other}: <span className="font-semibold text-ink">{cycle.theirs === "submitted" ? "Finished" : cycle.theirs === "in_progress" ? "In progress" : "Not started"}</span>
        </span>
      </div>
      <ErrorText>{error}</ErrorText>
      {!mineDone && (
        <Button className="mt-4" disabled={busy} onClick={start}>
          {cycle.mine ? "Continue" : full ? "Start the full assessment" : "Start the monthly check"}
        </Button>
      )}
    </Card>
  );
}
