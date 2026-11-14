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
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** How to reach someone: their phone if they have one, else their email. */
export function contactOf(p: { phone: string | null; email: string | null }): string {
  return p.phone ? formatPhone(p.phone) : (p.email ?? "");
}

/** Both, for detail views: "0803 000 0000 · ada@example.com". */
export function contactsOf(p: { phone: string | null; email: string | null }): string {
  return [formatPhone(p.phone), p.email].filter(Boolean).join(" · ");
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

/** Plain words for admin history entries. Unknown actions fall back to the code. */
const HISTORY: Record<string, string> = {
  "membership.approved": "Approved as a member",
  "membership.rejected": "Membership declined",
  "membership.removed": "Removed from the church",
  "member.made_admin": "Made an administrator",
  "member.admin_removed": "Administrator role removed",
  "member.department_changed": "Department changed",
  "discipler_status.requested": "Asked for discipler status",
  "discipler_status.approved": "Discipler status approved",
  "discipler_status.rejected": "Discipler status declined",
  "discipler_status.suspended": "Discipler status suspended",
  "discipler_status.revoked": "Discipler status revoked",
  "discipler_status.reinstated": "Discipler status reinstated",
  "relationship.requested": "Discipleship request sent",
  "relationship.invited": "Discipleship invitation sent",
  "relationship.suggested": "Discipler suggested by the church",
  "relationship.suggestion_accepted": "Accepted the church's suggestion",
  "relationship.suggestion_withdrawn": "Church suggestion withdrawn",
  "relationship.accepted": "Discipleship accepted",
  "relationship.declined": "Discipleship declined",
  "relationship.withdrawn": "Request withdrawn",
  "relationship.activated": "Discipleship became active",
  "relationship.ended": "Discipleship ended",
  "relationship.ended_with_concern": "Discipleship ended with a concern raised",
  "membership.requested": "Asked to join the church",
  "church.registered": "Registered the church",
};
export const historyLabel = (action: string) => HISTORY[action] ?? action;
