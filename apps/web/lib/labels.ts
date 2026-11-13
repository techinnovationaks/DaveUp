import type { BaselineStateDto, DueState, RelationshipDto } from "@daveup/shared";

export const baselineLabel: Record<BaselineStateDto["disciple"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Finished",
};

export const statusLabel: Record<RelationshipDto["status"], string> = {
  requested: "Waiting for a reply",
  accepted_baseline_pending: "Baseline pending",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
  declined: "Declined",
};

export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const OPEN_STATUSES: RelationshipDto["status"][] = ["requested", "accepted_baseline_pending", "active", "paused"];

/** +2348031234567 -> 0803 123 4567 for Nigerian numbers; other numbers unchanged. */
export function formatPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** "Thu 20 Nov, 6:00 pm" in the viewer's time zone. */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** "20 Nov" for a YYYY-MM-DD or ISO date. */
export function fmtDay(isoDate: string, withYear = false): string {
  const d = isoDate.length === 10 ? new Date(`${isoDate}T12:00:00`) : new Date(isoDate);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}


/** Plain words for a check's due state. Never alarming: nothing is locked. */
export function dueText(due: DueState): string {
  switch (due.state) {
    case "upcoming":
      return due.daysUntil === 1 ? "Due tomorrow" : `Due in ${due.daysUntil} days`;
    case "due_today":
      return "Due today";
    case "late":
      return `${due.daysLate} ${due.daysLate === 1 ? "day" : "days"} late, ${due.graceLeft} ${due.graceLeft === 1 ? "day" : "days"} of grace left`;
    case "overdue":
      return `${due.daysLate} days late. Your discipleship stays active.`;
  }
}
