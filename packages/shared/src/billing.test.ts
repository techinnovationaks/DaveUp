import { describe, expect, it } from "vitest";
import { addInterval, changeStartsNow, limitsFor, naira, periodPrice, unusedCredit } from "./billing";

describe("plan prices (PRD 17.3)", () => {
  it("charges the founding or list price for Standard, plus capacity blocks", () => {
    expect(periodPrice({ plan: "standard", interval: "month", extraBlocks: 0, founding: true })).toBe(70_000_00);
    expect(periodPrice({ plan: "standard", interval: "month", extraBlocks: 0, founding: false })).toBe(100_000_00);
    expect(periodPrice({ plan: "standard", interval: "month", extraBlocks: 2, founding: true })).toBe(130_000_00);
    expect(periodPrice({ plan: "basic", interval: "month", extraBlocks: 0, founding: true })).toBe(0);
    expect(periodPrice({ plan: "basic", interval: "month", extraBlocks: 1, founding: true })).toBe(30_000_00);
  });

  it("makes yearly two months free", () => {
    expect(periodPrice({ plan: "standard", interval: "year", extraBlocks: 0, founding: true })).toBe(700_000_00);
  });

  it("formats Naira", () => {
    expect(naira(70_000_00)).toBe("₦70,000");
  });
});

describe("plan limits", () => {
  it("adds capacity blocks, and keeps unlimited unlimited", () => {
    expect(limitsFor("basic", 0)).toEqual({ disciplers: 3, disciples: 36, cells: 3 });
    expect(limitsFor("basic", 2)).toEqual({ disciplers: 9, disciples: 108, cells: 9 });
    expect(limitsFor("standard", 1)).toEqual({ disciplers: 15, disciples: 180, cells: null });
    expect(limitsFor("network", 5)).toEqual({ disciplers: null, disciples: null, cells: null });
  });
});

describe("changing plan", () => {
  const std = { plan: "standard" as const, extraBlocks: 0, interval: "month" as const };
  it("starts upgrades now and keeps downgrades for the end of the period", () => {
    expect(changeStartsNow(std, { ...std, extraBlocks: 1 })).toBe(true);
    expect(changeStartsNow(std, { ...std, interval: "year" })).toBe(true);
    expect(changeStartsNow({ ...std, extraBlocks: 1 }, std)).toBe(false);
    expect(changeStartsNow(std, { plan: "basic", extraBlocks: 0, interval: "month" })).toBe(false);
    expect(changeStartsNow({ ...std, interval: "year" }, { ...std, extraBlocks: 3 })).toBe(false);
    expect(changeStartsNow({ plan: "basic", extraBlocks: 0, interval: null }, std)).toBe(true);
  });

  it("credits the unused part of the current period", () => {
    const start = new Date("2026-11-01T00:00:00Z");
    const end = addInterval(start, "month");
    expect(end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    const half = new Date((start.getTime() + end.getTime()) / 2);
    expect(unusedCredit(70_000_00, start, end, half)).toBe(35_000_00);
    expect(unusedCredit(70_000_00, start, end, end)).toBe(0);
  });
});
