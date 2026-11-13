// Access to a relationship's shared records: only the two people in it.
import type { Tx } from "../db/pool";
import { conflict, notFound } from "../lib/errors";

export async function requireParty(tx: Tx, relationshipId: string, personId: string) {
  const r = await tx
    .selectFrom("relationship as r")
    .innerJoin("person as dr", "dr.id", "r.discipler_id")
    .innerJoin("person as de", "de.id", "r.disciple_id")
    .selectAll("r")
    .select(["dr.full_name as discipler_name", "de.full_name as disciple_name"])
    .where("r.id", "=", relationshipId)
    .executeTakeFirst();
  // Not found and not yours look the same, so ids cannot be probed.
  if (!r || (r.discipler_id !== personId && r.disciple_id !== personId)) throw notFound();
  const myRole: "disciple" | "discipler" = r.discipler_id === personId ? "discipler" : "disciple";
  return { ...r, myRole, otherId: myRole === "discipler" ? r.disciple_id : r.discipler_id };
}

export type PartyRelationship = Awaited<ReturnType<typeof requireParty>>;

/** Growth plans, practice and reflection unlock once the relationship is active (PRD 6.7 rule 7). */
export function requireActive(r: { status: string }) {
  if (r.status !== "active" && r.status !== "paused") {
    throw conflict("NOT_ACTIVE", "This opens once you have both finished the baseline assessment");
  }
}

/** Meetings can be scheduled from acceptance (the first review meeting) until the relationship ends. */
export function requireOpen(r: { status: string }) {
  if (!["accepted_baseline_pending", "active", "paused"].includes(r.status)) {
    throw conflict("NOT_OPEN", "This relationship is not open");
  }
}
