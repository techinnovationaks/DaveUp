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

export const JournalEntrySchema = z.object({
  title: z.string().trim().max(JOURNAL_TITLE_MAX).optional().nullable(),
  body: z.string().trim().min(1, "Write something first").max(JOURNAL_BODY_MAX, `Entries can be up to ${JOURNAL_BODY_MAX.toLocaleString("en")} characters`),
});

/** Share an entry with the discipler in one relationship, or stop sharing (null). */
export const JournalShareSchema = z.object({ relationshipId: z.string().uuid().nullable() });

export interface JournalEntryDto {
  id: string;
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
