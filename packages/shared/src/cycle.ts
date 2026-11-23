// The monthly cycle (PRD 8.5, 38.19, 38.26).
// After the baseline, each month brings a short check: twelve questions, one
// per area, alternating Priest and King (area 11 is always King), so a month is
// 6 Priest and 6 King or 5 Priest and 7 King. Every third month is the full
// 60-question assessment, exactly 30 and 30. Both people
// answer alone and see the result together. A missed check never locks
// anything or ends a relationship; it shows as overdue with a grace period.
import { AREAS, getArea } from "./areas";
import { priestItemCount, questionsFor, type Domain, type Question, type TestVersion } from "./questions";

export type AssessmentKind = "full" | "check";

/**
 * Which questions an assessment asks.
 * - A check with `round` (1, 2, 3, …: the how-manyth monthly check) asks one item per
 *   area, Priest or King by turns (see checkItemIndex).
 * - A check with only `itemIndex` was opened before the Priest and King split and
 *   keeps its original rule: item `itemIndex` (1..5) of every area.
 */
export interface ItemSet {
  kind: AssessmentKind;
  itemIndex: number | null;
  round?: number | null;
}

export const FULL_SET: ItemSet = { kind: "full", itemIndex: null, round: null };

/** Domain an area asks about in check round `round`. Area 11 has only King items. */
export function checkDomain(area: number, round: number): Domain {
  if (priestItemCount(area) === 0) return "king";
  return (area + round) % 2 === 0 ? "priest" : "king";
}

/**
 * Item (1..5) an area asks in check round `round`. Each area's Priest and King
 * items take turns, and within a domain the items rotate so checks do not keep
 * asking the same question.
 */
export function checkItemIndex(area: number, round: number): number {
  const domain = checkDomain(area, round);
  const p = priestItemCount(area);
  const items = domain === "priest" ? Array.from({ length: p }, (_, i) => i + 1) : Array.from({ length: 5 - p }, (_, i) => p + i + 1);
  const turn = Math.floor((round - 1) / 2);
  return items[turn % items.length]!;
}

export function itemsFor(version: TestVersion, set: ItemSet = FULL_SET): Question[] {
  const all = questionsFor(version);
  if (set.kind === "full") return all;
  if (set.round) {
    const round = set.round;
    return all.filter((q) => q.index === checkItemIndex(q.area, round));
  }
  return all.filter((q) => q.index === set.itemIndex);
}

/** Every third cycle is the full assessment. */
export const FULL_EVERY_CYCLES = 3;
/** A cycle opens this many days before it is due. */
export const CYCLE_OPENS_DAYS_BEFORE = 7;
/** Grace after the due date before the other person is told it is pending. */
export const CHECK_GRACE_DAYS = 14;

/** Cycle 1 is one month after the relationship became active; the baseline is cycle 0. */
export function cycleKind(number: number): AssessmentKind {
  return number % FULL_EVERY_CYCLES === 0 ? "full" : "check";
}

/** The how-manyth monthly check cycle `number` is (cycles 3, 6, 9… are full, so 4 is round 3). Null for a full cycle. */
export function cycleCheckRound(number: number): number | null {
  return cycleKind(number) === "check" ? number - Math.floor(number / FULL_EVERY_CYCLES) : null;
}

/** Same day of the month, `months` later (clamped to the month's last day). */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

export function cycleDueOn(activatedAt: Date, number: number): Date {
  return addMonths(activatedAt, number);
}

const DAY = 86_400_000;

export type DueState =
  | { state: "upcoming"; daysUntil: number }
  | { state: "due_today" }
  | { state: "late"; daysLate: number; graceLeft: number }
  | { state: "overdue"; daysLate: number };

/** Due state of a check, for the hub and reminders. Dates compare by UTC day. */
export function dueState(dueOn: Date, now: Date = new Date()): DueState {
  const day = (d: Date) => Math.floor(d.getTime() / DAY);
  const diff = day(dueOn) - day(now);
  if (diff > 0) return { state: "upcoming", daysUntil: diff };
  if (diff === 0) return { state: "due_today" };
  const late = -diff;
  return late <= CHECK_GRACE_DAYS ? { state: "late", daysLate: late, graceLeft: CHECK_GRACE_DAYS - late } : { state: "overdue", daysLate: late };
}

// ---- Progress in words (PRD 7.5, 8.5) ----

/** One area's view in a cycle: the average of the two perspectives that exist. */
export interface AreaPoint {
  area: number;
  disciple: number | null;
  discipler: number | null;
}

function avg(p: AreaPoint): number | null {
  const v = [p.disciple, p.discipler].filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** A change of at least this many points out of 20 counts as observable progress. */
export const PROGRESS_THRESHOLD = 2;

export interface ProgressSummary {
  improved: number[];
  declined: number[];
  priority: number | null;
  text: string;
}

/**
 * "Since your previous assessment, your strongest observable progress has been
 * in Prayer and Service. Obedience remains a growth priority." Never a total score.
 */
export function describeProgress(previous: AreaPoint[], current: AreaPoint[]): ProgressSummary {
  const changes = AREAS.map((a) => {
    const p = previous.find((x) => x.area === a.number);
    const c = current.find((x) => x.area === a.number);
    const pv = p ? avg(p) : null;
    const cv = c ? avg(c) : null;
    return { area: a.number, current: cv, delta: pv !== null && cv !== null ? cv - pv : null };
  });
  const improved = changes
    .filter((c) => c.delta !== null && c.delta >= PROGRESS_THRESHOLD)
    .sort((x, y) => y.delta! - x.delta! || x.area - y.area)
    .slice(0, 2)
    .map((c) => c.area);
  const declined = changes
    .filter((c) => c.delta !== null && c.delta <= -PROGRESS_THRESHOLD)
    .sort((x, y) => x.delta! - y.delta! || x.area - y.area)
    .map((c) => c.area);
  // A growth priority is an area that has not meaningfully improved: never one that just went up.
  const priority = changes
    .filter((c) => c.current !== null && !(c.delta !== null && c.delta >= PROGRESS_THRESHOLD))
    .sort((x, y) => x.current! - y.current! || x.area - y.area)[0]?.area ?? null;

  const names = (ns: number[]) => ns.map((n) => getArea(n).name).join(" and ");
  const parts: string[] = [];
  parts.push(
    improved.length
      ? `Since your previous assessment, your strongest observable progress has been in ${names(improved)}.`
      : "Since your previous assessment, no area has changed much yet.",
  );
  if (priority !== null) parts.push(`${getArea(priority).name} remains a growth priority.`);
  return { improved, declined, priority, text: parts.join(" ") };
}
