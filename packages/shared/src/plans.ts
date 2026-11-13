// Growth plans, weekly practice, reflection and meetings (PRD 8.2 to 8.4, 38.3).
import { z } from "zod";

// ---- Growth plan ----

export const PLAN_LENGTHS = [30, 60, 90] as const;
export type PlanLength = (typeof PLAN_LENGTHS)[number];
export const MAX_FOCUS_AREAS = 3;
export const MAX_PRACTICES = 6;

export interface PracticeTemplate {
  title: string;
  detail: string;
  timesPerWeek: number;
}

/**
 * Starter practices per area: template suggestions (the Basic plan has no AI,
 * PRD 15). People accept, edit or skip each one; nothing is added for them.
 * Written from each area's description and the PRD's examples (8.2).
 */
export const PRACTICE_TEMPLATES: Record<number, PracticeTemplate[]> = {
  1: [
    { title: "Keep every discipleship meeting this month", detail: "Arrive on time without being reminded", timesPerWeek: 1 },
    { title: "Give up one comfort for a Kingdom task", detail: "Time, money or a preference", timesPerWeek: 1 },
  ],
  2: [
    { title: "Contact your discipler between meetings", detail: "A call, a visit or a message that is more than a greeting", timesPerWeek: 2 },
    { title: "Spend one unhurried evening with a believer", detail: "Someone you do not usually talk with", timesPerWeek: 1 },
  ],
  3: [
    { title: "Read one chapter and write one thing to obey", detail: "Keep the note to bring to your meeting", timesPerWeek: 5 },
    { title: "Bring one question from Scripture to your meeting", detail: "Something you did not understand or found hard", timesPerWeek: 1 },
  ],
  4: [
    { title: "30 minutes of personal prayer", detail: "Same time each day, before your phone", timesPerWeek: 5 },
    { title: "Pray for three people by name", detail: "Write their names down", timesPerWeek: 7 },
  ],
  5: [
    { title: "Share your testimony or the gospel with one person", detail: "Note who and what happened", timesPerWeek: 1 },
    { title: "Help someone in a practical way", detail: "A visit, a meal, an errand", timesPerWeek: 1 },
  ],
  6: [
    { title: "Ask your discipler for one honest correction", detail: "Listen without defending yourself", timesPerWeek: 1 },
    { title: "Act on one correction you received", detail: "Write what you changed", timesPerWeek: 1 },
  ],
  7: [
    { title: "Serve in one church or community task", detail: "Be there when you said you would be", timesPerWeek: 1 },
    { title: "Arrive early or stay late to help", detail: "Without being asked", timesPerWeek: 1 },
  ],
  8: [
    { title: "Fast one meal and use the time to pray", detail: "Only if your health allows", timesPerWeek: 1 },
    { title: "Give one leisure hour to someone else", detail: "Choose their need over your plan", timesPerWeek: 1 },
  ],
  9: [
    { title: "Do one thing you know God is asking of you", detail: "Something you have been putting off", timesPerWeek: 1 },
    { title: "Write what you obeyed and what happened", detail: "Two lines are enough", timesPerWeek: 2 },
  ],
  10: [
    { title: "Keep your commitments on a hard day", detail: "Note what made it hard", timesPerWeek: 1 },
    { title: "Pray for someone who has wronged you", detail: "By name", timesPerWeek: 2 },
  ],
  11: [
    { title: "Show Christ's character at work or school", detail: "One specific act: honesty, patience, help", timesPerWeek: 2 },
    { title: "Do one act of kindness for a neighbour", detail: "Someone outside the church", timesPerWeek: 1 },
  ],
  12: [
    { title: "Spend time helping one person grow", detail: "Pray, read or talk with them", timesPerWeek: 1 },
    { title: "Pray for the person you will disciple", detail: "Ask God to show you who", timesPerWeek: 3 },
  ],
};

/** Reflection prompts for the week (PRD 8.3). */
export const REFLECTION_PROMPTS = [
  { key: "did", label: "What did you actually do?" },
  { key: "difficult", label: "What was difficult?" },
  { key: "changed", label: "What changed?" },
  { key: "needHelp", label: "What do you need help with?" },
] as const;
export type ReflectionKey = (typeof REFLECTION_PROMPTS)[number]["key"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const PracticeSchema = z.object({
  title: z.string().trim().min(3, "Give the practice a short name").max(120),
  detail: z.string().trim().max(200).optional(),
  timesPerWeek: z.number().int().min(1).max(7),
  area: z.number().int().min(1).max(12).nullable().optional(),
});

export const PlanDraftSchema = z.object({
  focusAreas: z
    .array(z.number().int().min(1).max(12))
    .min(1, "Choose at least one focus area")
    .max(MAX_FOCUS_AREAS, `Choose up to ${MAX_FOCUS_AREAS} focus areas`)
    .refine((a) => new Set(a).size === a.length, "Each focus area once"),
  lengthDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  practices: z.array(PracticeSchema).min(1, "Add at least one practice").max(MAX_PRACTICES, `Up to ${MAX_PRACTICES} practices`),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

export const PracticeDaySchema = z.object({ done: z.boolean() });

export const ReflectionSchema = z
  .object({
    did: z.string().trim().max(1000).optional(),
    difficult: z.string().trim().max(1000).optional(),
    changed: z.string().trim().max(1000).optional(),
    needHelp: z.string().trim().max(1000).optional(),
  })
  .refine((r) => Object.values(r).some((v) => v && v.length > 0), "Write at least one answer");

/** Monday of the week containing `d`, as YYYY-MM-DD (UTC). */
export function weekStart(d: Date = new Date()): string {
  const day = d.getUTCDay(); // 0 Sunday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

// ---- Meetings ----

/** Default meeting sequence (PRD 8.4). A guide on screen; churches may change it later. */
export const MEETING_STEPS = [
  { title: "Check-in", hint: "How has the week been? Anything on your heart?" },
  { title: "Previous commitment", hint: "What did you agree last time?" },
  { title: "Evidence", hint: "What actually happened? Look at this week's practice." },
  { title: "Scripture and teaching", hint: "One passage or truth for this week." },
  { title: "Correction", hint: "Anything to address, gently and honestly." },
  { title: "Prayer together", hint: "Pray for what came up." },
  { title: "New commitment", hint: "One practical step for the coming week." },
  { title: "Next meeting", hint: "Agree when and where." },
] as const;

/** A meeting record can be edited for this long after it is saved (PRD 38.3). */
export const RECORD_EDIT_HOURS = 24;

export const MeetingCreateSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true, message: "Choose a date and time" }),
  place: z.string().trim().max(120).optional(),
  agenda: z.string().trim().max(500).optional(),
});

export const MeetingRecordSchema = z.object({
  tookPlace: z.boolean(),
  discussed: z.string().trim().max(1500).optional(),
  commitment: z.string().trim().max(500).optional(),
  prayer: z.string().trim().max(500).optional(),
  win: z.string().trim().max(500).optional(),
  nextMeetingAt: z.string().datetime({ offset: true }).optional(),
});

export const isoDateSchema = isoDate;
