import { describe, expect, it } from "vitest";
import { QUESTIONS, questionsFor } from "./questions";
import { compare, gapLevel, progressOf, scoreAreas, type Answer } from "./scoring";
import { normalisePhone } from "./domain";

function allAnswers(version: "A" | "B", value: (area: number) => number): Answer[] {
  return questionsFor(version).map((q) => ({ itemId: q.id, value: value(q.area), noOccasion: false }));
}

describe("question bank", () => {
  it("has 60 items per version, 5 per area", () => {
    for (const v of ["A", "B"] as const) {
      const qs = questionsFor(v);
      expect(qs).toHaveLength(60);
      for (let area = 1; area <= 12; area++) {
        expect(qs.filter((q) => q.area === area).map((q) => q.index)).toEqual([1, 2, 3, 4, 5]);
      }
    }
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(120);
  });
});

describe("scoreAreas", () => {
  it("scores each area out of 20", () => {
    const scores = scoreAreas("B", allAnswers("B", () => 3));
    expect(scores).toHaveLength(12);
    expect(scores.every((s) => s.raw === 15 && s.outOf20 === 15)).toBe(true);
  });

  it("excludes No occasion yet and scales the rest", () => {
    const answers = allAnswers("B", () => 4).map((a) =>
      a.itemId === "12B-1" || a.itemId === "12B-2" ? { ...a, value: null, noOccasion: true } : a,
    );
    const area12 = scoreAreas("B", answers).find((s) => s.area === 12)!;
    expect(area12.scoredItems).toBe(3);
    expect(area12.raw).toBe(12);
    expect(area12.outOf20).toBe(20);
  });

  it("returns null when an area has no scored items", () => {
    const answers = questionsFor("B")
      .filter((q) => q.area === 6)
      .map((q) => ({ itemId: q.id, value: null, noOccasion: true }));
    expect(scoreAreas("B", answers).find((s) => s.area === 6)!.outOf20).toBeNull();
  });
});

describe("progressOf", () => {
  it("counts answered items and finds the next area", () => {
    const answers = allAnswers("A", () => 2).filter((a) => !a.itemId.startsWith("3A"));
    const p = progressOf("A", answers);
    expect(p).toEqual({ answered: 55, total: 60, areasComplete: 11, nextArea: 3 });
  });
});

describe("compare", () => {
  it("flags gaps and picks growth areas and strengths", () => {
    const self = scoreAreas("B", allAnswers("B", (area) => (area === 4 ? 4 : 2)));
    const discipler = scoreAreas("A", allAnswers("A", (area) => (area === 4 ? 2 : area === 9 ? 1 : 2)));
    const c = compare(self, discipler);
    const prayer = c.areas.find((a) => a.area === 4)!;
    expect(prayer).toMatchObject({ disciple: 20, discipler: 10, gap: "large" });
    expect(c.discussFirst[0]).toBe(4);
    expect(c.growthAreas[0]).toBe(9);
    expect(c.strengths[0]).toBe(4);
  });

  it("gap thresholds", () => {
    expect(gapLevel(10, 13)).toBe("none");
    expect(gapLevel(10, 14)).toBe("some");
    expect(gapLevel(18, 10)).toBe("large");
    expect(gapLevel(null, 10)).toBe("none");
  });
});

describe("normalisePhone", () => {
  it("normalises Nigerian numbers", () => {
    expect(normalisePhone("0803 000 0000")).toBe("+2348030000000");
    expect(normalisePhone("+234 803 000 0000")).toBe("+2348030000000");
    expect(normalisePhone("12")).toBeNull();
    expect(normalisePhone("0803000001")).toBeNull(); // 10 digits, local format
    expect(normalisePhone("+0803000000")).toBeNull();
  });
});
