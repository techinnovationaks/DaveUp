import { AREAS, ITEMS_PER_AREA } from "./areas";
import { getQuestion, type TestVersion } from "./questions";
import { FULL_SET, itemsFor, type ItemSet } from "./cycle";

export const SCALE = [
  { value: 4, label: "Consistently", meaning: "I did this regularly and can give evidence/examples." },
  { value: 3, label: "Often", meaning: "I did this frequently but not consistently." },
  { value: 2, label: "Sometimes", meaning: "I did this occasionally." },
  { value: 1, label: "Rarely", meaning: "I did this once or twice or only when prompted." },
  { value: 0, label: "Not yet", meaning: "I did not do this." },
] as const;

export const MAX_ITEM_SCORE = 4;
export const AREA_MAX = ITEMS_PER_AREA * MAX_ITEM_SCORE; // 20

/** One answer. `value` is null when the person chose "No occasion yet". */
export interface Answer {
  itemId: string;
  value: number | null;
  noOccasion: boolean;
}

export interface AreaScore {
  area: number;
  /** Raw sum of scored items. */
  raw: number;
  /** Items actually scored (excludes "No occasion yet"). */
  scoredItems: number;
  /**
   * Score out of 20, scaled up when some items were "No occasion yet" so areas stay
   * comparable (PRD 6.7 rule 3: those items are excluded from the area total).
   * Null when every item in the area was "No occasion yet".
   */
  outOf20: number | null;
}

export function isAnswerComplete(a: Pick<Answer, "value" | "noOccasion">): boolean {
  return a.noOccasion || (a.value !== null && a.value >= 0 && a.value <= MAX_ITEM_SCORE);
}

export function scoreAreas(version: TestVersion, answers: Answer[], set: ItemSet = FULL_SET): AreaScore[] {
  const byId = new Map(answers.map((a) => [a.itemId, a]));
  return AREAS.map((area) => {
    const items = itemsFor(version, set).filter((q) => q.area === area.number);
    let raw = 0;
    let scored = 0;
    for (const q of items) {
      const a = byId.get(q.id);
      if (!a || a.noOccasion || a.value === null) continue;
      raw += a.value;
      scored += 1;
    }
    const outOf20 = scored === 0 ? null : Math.round((raw / (scored * MAX_ITEM_SCORE)) * AREA_MAX);
    return { area: area.number, raw, scoredItems: scored, outOf20 };
  });
}

export interface Progress {
  answered: number;
  total: number;
  areasComplete: number;
  /** First area (1..12) with an unanswered item, or null when complete. */
  nextArea: number | null;
}

export function progressOf(version: TestVersion, answers: Answer[], set: ItemSet = FULL_SET): Progress {
  const done = new Set(answers.filter(isAnswerComplete).map((a) => a.itemId));
  const qs = itemsFor(version, set);
  let areasComplete = 0;
  let nextArea: number | null = null;
  for (const area of AREAS) {
    const items = qs.filter((q) => q.area === area.number);
    if (items.every((q) => done.has(q.id))) areasComplete += 1;
    else if (nextArea === null) nextArea = area.number;
  }
  return { answered: qs.filter((q) => done.has(q.id)).length, total: qs.length, areasComplete, nextArea };
}

export function validateItemForVersion(itemId: string, version: TestVersion, set: ItemSet = FULL_SET): boolean {
  const q = getQuestion(itemId);
  return !!q && q.version === version && (set.kind === "full" || q.index === set.itemIndex);
}

// ---- Comparison (PRD 7.3, 7.4) ----

export type GapLevel = "none" | "some" | "large";

/** Thresholds on the /20 scale. To be tuned with pilot pairs. */
export const GAP_THRESHOLDS = { some: 4, large: 7 } as const;

export function gapLevel(a: number | null, b: number | null): GapLevel {
  if (a === null || b === null) return "none";
  const d = Math.abs(a - b);
  if (d >= GAP_THRESHOLDS.large) return "large";
  if (d >= GAP_THRESHOLDS.some) return "some";
  return "none";
}

export interface AreaComparison {
  area: number;
  name: string;
  disciple: number | null; // Test B, self view
  discipler: number | null; // Test A, discipler view
  gap: GapLevel;
}

export interface Comparison {
  areas: AreaComparison[];
  /** Up to 3 areas to discuss first: largest gaps, then lowest combined. */
  discussFirst: number[];
  /** Up to 3 suggested growth areas: lowest combined view. */
  growthAreas: number[];
  /** Up to 3 strengths: highest combined view. */
  strengths: number[];
}

function combined(c: AreaComparison): number | null {
  const vals = [c.disciple, c.discipler].filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export function compare(selfB: AreaScore[], disciplerA: AreaScore[]): Comparison {
  const areas: AreaComparison[] = AREAS.map((area) => {
    const b = selfB.find((s) => s.area === area.number)?.outOf20 ?? null;
    const a = disciplerA.find((s) => s.area === area.number)?.outOf20 ?? null;
    return { area: area.number, name: area.name, disciple: b, discipler: a, gap: gapLevel(b, a) };
  });

  const withCombined = areas
    .map((c) => ({ c, v: combined(c) }))
    .filter((x): x is { c: AreaComparison; v: number } => x.v !== null);

  const gapRank = (g: GapLevel) => (g === "large" ? 2 : g === "some" ? 1 : 0);
  const discussFirst = areas
    .filter((c) => c.gap !== "none")
    .sort((x, y) => gapRank(y.gap) - gapRank(x.gap) || Math.abs((y.disciple ?? 0) - (y.discipler ?? 0)) - Math.abs((x.disciple ?? 0) - (x.discipler ?? 0)))
    .slice(0, 3)
    .map((c) => c.area);

  const growthAreas = [...withCombined].sort((x, y) => x.v - y.v || x.c.area - y.c.area).slice(0, 3).map((x) => x.c.area);
  const strengths = [...withCombined].sort((x, y) => y.v - x.v || x.c.area - y.c.area).slice(0, 3).map((x) => x.c.area);

  return { areas, discussFirst, growthAreas, strengths };
}
