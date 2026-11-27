import { describe, expect, it } from "vitest";
import { BillingSelectionSchema, addInterval, changeStartsNow, limitsFor, naira, periodPrice, subscriptionLabel, unusedCredit } from "./billing";

describe("per-leader prices", () => {
  it("charges per leader seat, plus member packs", () => {
    expect(periodPrice({ plan: "standard", interval: "month", seats: 5, memberPacks: 0 })).toBe(25_000_00);
    expect(periodPrice({ plan: "standard", interval: "month", seats: 5, memberPacks: 2 })).toBe(28_600_00);
    expect(periodPrice({ plan: "pro", interval: "month", seats: 25, memberPacks: 0 })).toBe(162_500_00);
    expect(periodPrice({ plan: "basic", interval: "month", seats: 1, memberPacks: 0 })).toBe(0);
  });

  it("charges the yearly seat price, and 10 months for packs", () => {
    expect(periodPrice({ plan: "standard", interval: "year", seats: 5, memberPacks: 1 })).toBe(250_000_00 + 18_000_00);
  });

  it("formats Naira", () => {
    expect(naira(5_000_00)).toBe("₦5,000");
  });

  it("enforces each plan's minimum leaders, and Basic's fixed size", () => {
    expect(BillingSelectionSchema.safeParse({ plan: "standard", interval: "month", seats: 4, memberPacks: 0 }).success).toBe(false);
    expect(BillingSelectionSchema.safeParse({ plan: "standard", interval: "month", seats: 5, memberPacks: 0 }).success).toBe(true);
    expect(BillingSelectionSchema.safeParse({ plan: "pro", interval: "month", seats: 24, memberPacks: 0 }).success).toBe(false);
    expect(BillingSelectionSchema.safeParse({ plan: "basic", interval: "month", seats: 2, memberPacks: 0 }).success).toBe(false);
  });
});

describe("plan limits", () => {
  it("gives 12 members per leader plus packs, and leaves cells unlimited", () => {
    expect(limitsFor("basic", 1, 0)).toEqual({ disciplers: 1, disciples: 3, cells: null });
    expect(limitsFor("standard", 5, 0)).toEqual({ disciplers: 5, disciples: 60, cells: null });
    expect(limitsFor("standard", 5, 2)).toEqual({ disciplers: 5, disciples: 84, cells: null });
    expect(limitsFor("network", 0, 0)).toEqual({ disciplers: null, disciples: null, cells: null });
  });

  it("labels a subscription", () => {
    expect(subscriptionLabel("standard", 8, 2)).toBe("Standard, 8 leaders and 2 member packs");
    expect(subscriptionLabel("basic", 1, 0)).toBe("Basic");
  });
});

describe("changing plan", () => {
  const std = { plan: "standard" as const, seats: 5, memberPacks: 0, interval: "month" as const };
  it("starts upgrades now and keeps downgrades for the end of the period", () => {
    expect(changeStartsNow(std, { ...std, seats: 6 })).toBe(true);
    expect(changeStartsNow(std, { ...std, memberPacks: 1 })).toBe(true);
    expect(changeStartsNow(std, { ...std, interval: "year" })).toBe(true);
    expect(changeStartsNow(std, { ...std, plan: "pro", seats: 25 })).toBe(true);
    expect(changeStartsNow({ ...std, seats: 8 }, std)).toBe(false);
    expect(changeStartsNow({ ...std, seats: 8 }, { ...std, seats: 6, memberPacks: 3 })).toBe(false);
    expect(changeStartsNow(std, { plan: "basic", seats: 1, memberPacks: 0, interval: "month" })).toBe(false);
    expect(changeStartsNow({ ...std, interval: "year" }, { ...std, seats: 9 })).toBe(false);
    expect(changeStartsNow({ plan: "basic", seats: 1, memberPacks: 0, interval: null }, std)).toBe(true);
  });

  it("credits the unused part of the current period", () => {
    const start = new Date("2026-11-01T00:00:00Z");
    const end = addInterval(start, "month");
    expect(end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    const half = new Date((start.getTime() + end.getTime()) / 2);
    expect(unusedCredit(25_000_00, start, end, half)).toBe(12_500_00);
    expect(unusedCredit(25_000_00, start, end, end)).toBe(0);
  });
});
