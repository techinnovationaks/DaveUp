import { describe, expect, it } from "vitest";
import { QUESTIONS, getQuestion, questionsFor } from "./questions";
import { LEGACY_WORDING_V1 } from "./questions-legacy";
import { compare, domainGap, gapLevel, progressOf, scoreAreas, scoreDomains, validateItemForVersion, type Answer } from "./scoring";
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

  it("splits each test 30 Priest and 30 King by the agreed area pattern", () => {
    for (const v of ["A", "B"] as const) {
      const qs = questionsFor(v);
      expect(qs.filter((q) => q.domain === "priest")).toHaveLength(30);
      expect(qs.filter((q) => q.domain === "king")).toHaveLength(30);
      const priestIn = (area: number) => qs.filter((q) => q.area === area && q.domain === "priest").map((q) => q.index);
      for (const area of [2, 3, 4, 6, 8, 9, 10, 12]) expect(priestIn(area)).toEqual([1, 2, 3]);
      for (const area of [1, 5, 7]) expect(priestIn(area)).toEqual([1, 2]);
      expect(priestIn(11)).toEqual([]);
    }
    expect(getQuestion("4B-4")!.domain).toBe("king");
    expect(getQuestion("4B-4")!.text).toMatch(/^I regularly pray about my work, business, studies, finances and plans/);
  });

  it("keeps the earlier wording for traceability", () => {
    expect(Object.keys(LEGACY_WORDING_V1)).toHaveLength(120);
    // Priest items keep their wording; area 11 is unchanged.
    expect(getQuestion("1A-1")!.text).toBe(LEGACY_WORDING_V1["1A-1"]);
    expect(getQuestion("11B-3")!.text).toBe(LEGACY_WORDING_V1["11B-3"]);
    const changed = QUESTIONS.filter((q) => q.text !== LEGACY_WORDING_V1[q.id]);
    // Only King items were re-aimed, except 8B-3, which drops "money" now that money habits are King items 8-4 and 8-5.
    expect(changed.filter((q) => q.domain === "priest").map((q) => q.id)).toEqual(["8B-3"]);
  });
});

describe("scoreDomains", () => {
  it("scores Priest and King out of 120 each, as in the design example", () => {
    // Priest 86 of 120 (72%), King 59 of 120 (49%): 23 points apart.
    let priestLeft = 86;
    let kingLeft = 59;
    const answers: Answer[] = questionsFor("B").map((q) => {
      const left = q.domain === "priest" ? priestLeft : kingLeft;
      const value = Math.min(4, left);
      if (q.domain === "priest") priestLeft -= value;
      else kingLeft -= value;
      return { itemId: q.id, value, noOccasion: false };
    });
    const d = scoreDomains("B", answers);
    expect(d.priest).toEqual({ outOf120: 86, percent: 72, scoredItems: 30 });
    expect(d.king).toEqual({ outOf120: 59, percent: 49, scoredItems: 30 });
    expect(domainGap(d)).toBe(23);
  });

  it("leaves out No occasion yet and never prompts at 20 points or less", () => {
    const answers: Answer[] = questionsFor("A").map((q) =>
      q.domain === "king" && q.index === 5 ? { itemId: q.id, value: null, noOccasion: true } : { itemId: q.id, value: q.domain === "priest" ? 3 : 2, noOccasion: false },
    );
    const d = scoreDomains("A", answers);
    expect(d.priest.percent).toBe(75);
    expect(d.king.percent).toBe(50);
    expect(d.king.scoredItems).toBe(30 - 12); // area 11 has a King item 5 too, so 12 items left out
    expect(domainGap(d)).toBe(25);
    expect(domainGap({ priest: { outOf120: 84, percent: 70, scoredItems: 30 }, king: { outOf120: 60, percent: 50, scoredItems: 30 } })).toBeNull();
    expect(domainGap({ priest: { outOf120: null, percent: null, scoredItems: 0 }, king: d.king })).toBeNull();
  });

  it("scores a monthly check on the same 120 scale", () => {
    const set = { kind: "check" as const, itemIndex: null, round: 2 };
    const answers = questionsFor("B").map((q) => ({ itemId: q.id, value: 4, noOccasion: false }));
    const d = scoreDomains("B", answers, set);
    expect(d.priest.scoredItems + d.king.scoredItems).toBe(12);
    expect(d.priest.outOf120).toBe(120);
    expect(validateItemForVersion("11B-1", "B", { kind: "check", itemIndex: null, round: 1 })).toBe(true);
    expect(validateItemForVersion("11B-2", "B", { kind: "check", itemIndex: null, round: 1 })).toBe(false);
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
