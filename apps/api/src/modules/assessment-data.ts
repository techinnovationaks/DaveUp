// Loading assessments and their answers, shared by the assessment and cycle routes.
import { progressOf, type Answer, type AssessmentSummaryDto, type ItemSet } from "@daveup/shared";
import type { Tx } from "../db/pool";
import { notFound } from "../lib/errors";

export async function loadAnswers(tx: Tx, assessmentId: string): Promise<(Answer & { evidence: string | null })[]> {
  const rows = await tx.selectFrom("assessment_answer").select(["item_id", "value", "no_occasion", "evidence"]).where("assessment_id", "=", assessmentId).execute();
  return rows.map((r) => ({ itemId: r.item_id, value: r.value, noOccasion: r.no_occasion, evidence: r.evidence }));
}

export function itemSetOf(a: { kind: "full" | "check"; item_index: number | null; check_round: number | null }): ItemSet {
  return { kind: a.kind, itemIndex: a.item_index, round: a.check_round };
}

export async function summary(tx: Tx, id: string): Promise<AssessmentSummaryDto & { respondentId: string }> {
  const a = await tx
    .selectFrom("assessment as a")
    .innerJoin("person as s", "s.id", "a.subject_id")
    .leftJoin("assessment_cycle as c", "c.id", "a.cycle_id")
    .selectAll("a")
    .select(["s.full_name as subject_name", "c.number as cycle_number"])
    .where("a.id", "=", id)
    .executeTakeFirst();
  if (!a) throw notFound();
  const answers = await loadAnswers(tx, id);
  return {
    id: a.id,
    respondentId: a.respondent_id,
    version: a.version,
    kind: a.kind,
    itemIndex: a.item_index,
    checkRound: a.check_round,
    cycleNumber: a.cycle_number ?? null,
    subject: { personId: a.subject_id, fullName: a.subject_name ?? "Member" },
    relationshipId: a.relationship_id,
    status: a.status,
    progress: progressOf(a.version, answers, itemSetOf(a)),
    startedAt: a.started_at.toISOString(),
    submittedAt: a.submitted_at?.toISOString() ?? null,
  };
}

export function strip<T extends { respondentId: string }>(s: T): Omit<T, "respondentId"> {
  const { respondentId: _r, ...rest } = s;
  return rest;
}

export async function requireOwnAssessment(tx: Tx, id: string, personId: string) {
  const a = await tx.selectFrom("assessment").selectAll().where("id", "=", id).executeTakeFirst();
  // Not found and not yours look the same, so ids cannot be probed.
  if (!a || a.respondent_id !== personId) throw notFound();
  return a;
}
