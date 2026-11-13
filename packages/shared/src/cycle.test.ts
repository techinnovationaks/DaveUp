import { describe, expect, it } from "vitest";
import { addMonths, cycleItemIndex, cycleKind, describeProgress, dueState, itemsFor, type AreaPoint } from "./cycle";
import { weekStart } from "./plans";

describe("monthly cycle rules", () => {
  it("makes every third cycle the full assessment and rotates check items", () => {
    expect([1, 2, 3, 4, 5, 6].map(cycleKind)).toEqual(["check", "check", "full", "check", "check", "full"]);
    expect([1, 2, 3, 4, 5, 7].map(cycleItemIndex)).toEqual([1, 2, null, 4, 5, 2]);
  });

  it("asks one question per area in a check", () => {
    const qs = itemsFor("B", { kind: "check", itemIndex: 3 });
    expect(qs).toHaveLength(12);
    expect(new Set(qs.map((q) => q.area)).size).toBe(12);
    expect(qs.every((q) => q.index === 3)).toBe(true);
    expect(itemsFor("A")).toHaveLength(60);
  });

  it("adds months without spilling into the next month", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-11-15T10:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("gives 14 days of grace after the due date", () => {
    const due = new Date("2026-10-01T00:00:00Z");
    expect(dueState(due, new Date("2026-09-25T09:00:00Z"))).toEqual({ state: "upcoming", daysUntil: 6 });
    expect(dueState(due, new Date("2026-10-01T18:00:00Z"))).toEqual({ state: "due_today" });
    expect(dueState(due, new Date("2026-10-04T08:00:00Z"))).toEqual({ state: "late", daysLate: 3, graceLeft: 11 });
    expect(dueState(due, new Date("2026-10-20T08:00:00Z"))).toEqual({ state: "overdue", daysLate: 19 });
  });

  it("describes progress in words, never as a total score", () => {
    const flat = (v: number): AreaPoint[] => Array.from({ length: 12 }, (_, i) => ({ area: i + 1, disciple: v, discipler: v }));
    const before = flat(10);
    const after = flat(10).map((p) => (p.area === 4 ? { ...p, disciple: 16, discipler: 14 } : p.area === 7 ? { ...p, discipler: 14 } : p.area === 9 ? { ...p, disciple: 6, discipler: 6 } : p));
    const s = describeProgress(before, after);
    expect(s.improved).toEqual([4, 7]);
    expect(s.declined).toEqual([9]);
    expect(s.priority).toBe(9);
    expect(s.text).toBe("Since your previous assessment, your strongest observable progress has been in Prayer and Service. Obedience remains a growth priority.");
    expect(describeProgress(before, before).text).toMatch(/no area has changed much yet/);
    // Three areas improve but only two are named; the third is never called a priority.
    const three = flat(10).map((p) => (p.area <= 3 ? { ...p, disciple: 15, discipler: 15 } : p));
    const t = describeProgress(before, three);
    expect(t.improved).toEqual([1, 2]);
    expect(t.priority).toBe(4);
  });

  it("starts weeks on Monday", () => {
    expect(weekStart(new Date("2026-11-15T12:00:00Z"))).toBe("2026-11-09"); // Sunday
    expect(weekStart(new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-16"); // Monday
  });
});
