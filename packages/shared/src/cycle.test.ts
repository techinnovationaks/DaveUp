import { describe, expect, it } from "vitest";
import { addMonths, checkDomain, cycleCheckRound, cycleKind, describeProgress, dueState, itemsFor, type AreaPoint } from "./cycle";
import { weekStart } from "./plans";

describe("monthly cycle rules", () => {
  it("makes every third cycle the full assessment and numbers the checks in between", () => {
    expect([1, 2, 3, 4, 5, 6].map(cycleKind)).toEqual(["check", "check", "full", "check", "check", "full"]);
    expect([1, 2, 3, 4, 5, 6, 7].map(cycleCheckRound)).toEqual([1, 2, null, 3, 4, null, 5]);
  });

  it("asks one question per area in a check, alternating Priest and King", () => {
    for (let round = 1; round <= 60; round++) {
      for (const v of ["A", "B"] as const) {
        const qs = itemsFor(v, { kind: "check", itemIndex: null, round });
        expect(qs).toHaveLength(12);
        expect(qs.map((q) => q.area)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        // Area 11 is always King; the month is 6 and 6, or 5 Priest and 7 King.
        expect(qs.find((q) => q.area === 11)!.domain).toBe("king");
        const priest = qs.filter((q) => q.domain === "priest").length;
        expect([5, 6]).toContain(priest);
        // Neighbouring areas (other than around 11) alternate.
        for (const area of [1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(checkDomain(area, round)).not.toBe(checkDomain(area + 1, round));
        for (const q of qs) expect(q.domain).toBe(checkDomain(q.area, round));
      }
    }
    // Over a run of checks every item comes up.
    const seen = new Set<string>();
    for (let round = 1; round <= 12; round++) for (const q of itemsFor("B", { kind: "check", itemIndex: null, round })) seen.add(q.id);
    expect(seen.size).toBe(60);
  });

  it("keeps the original rule for checks opened before the split", () => {
    const qs = itemsFor("B", { kind: "check", itemIndex: 3 });
    expect(qs).toHaveLength(12);
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
