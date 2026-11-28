// Journal: private entries, optionally shared one at a time with a discipler.
import { z } from "zod";

export const JOURNAL_BODY_MAX = 20000;
export const JOURNAL_TITLE_MAX = 120;
export const JOURNAL_PAGE = 30;

/** Ideas for when someone does not know what to write. */
export const JOURNAL_PROMPTS = [
  "What did God show me this week?",
  "Where did I see growth, and where did I struggle?",
  "A verse that stayed with me, and why",
  "Something I am grateful for today",
  "What I want to talk about with my discipler",
  "A step I will take this week",
] as const;

export const JOURNAL_KINDS = ["reflection", "prayer", "gratitude", "god_said", "correction", "work_win"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];
export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  reflection: "Reflection",
  prayer: "Prayer",
  gratitude: "Gratitude",
  god_said: "What God said",
  correction: "Correction",
  work_win: "Work win",
};
/** The question each kind of entry starts from. */
export const JOURNAL_KIND_PROMPT: Record<JournalKind, string> = {
  reflection: "What did God show you today?",
  prayer: "What are you praying about?",
  gratitude: "What are you thankful for today?",
  god_said: "What did God say to you, and where?",
  correction: "What did you learn from correction?",
  work_win: "What went well at work, and how did faith shape it?",
};

export const JournalEntrySchema = z.object({
  kind: z.enum(JOURNAL_KINDS).default("reflection"),
  aboutFaith: z.boolean().default(false),
  aboutImpact: z.boolean().default(false),
  /** Share it with the discipler in this relationship as it is saved (null keeps it private). */
  shareWith: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(JOURNAL_TITLE_MAX).optional().nullable(),
  body: z.string().trim().min(1, "Write something first").max(JOURNAL_BODY_MAX, `Entries can be up to ${JOURNAL_BODY_MAX.toLocaleString("en")} characters`),
});

/** Share an entry with the discipler in one relationship, or stop sharing (null). */
export const JournalShareSchema = z.object({ relationshipId: z.string().uuid().nullable() });

export interface JournalEntryDto {
  id: string;
  kind: JournalKind;
  aboutFaith: boolean;
  aboutImpact: boolean;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Who can read it besides the writer. */
  sharedWith: { relationshipId: string; disciplerName: string; sharedAt: string } | null;
}

export interface JournalListDto {
  entries: JournalEntryDto[];
  /** Pass as ?before= to load older entries; null when there are no more. */
  nextBefore: string | null;
  /** Days in a row with an entry (counting today or yesterday), entries this month, and which of the last 7 days have one (oldest first). */
  stats: { streak: number; thisMonth: number; lastSeven: boolean[] };
  /** Disciplers the writer may share an entry with (active relationships where they are the disciple). */
  shareTargets: { relationshipId: string; disciplerName: string; churchName: string }[];
}

/** An entry a disciple shared with their discipler. */
export interface SharedJournalEntryDto {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  sharedAt: string;
}
