// Plan limits (PRD 17.3, 17.9). They stop new additions only: nobody already
// in DaveUp loses access when a church is at or over its limit.
import { sql, type Kysely } from "kysely";
import { CAPACITY_STATUSES, PLAN_NAME, limitsFor, type PlanLimits } from "@daveup/shared";
import type { DB } from "../db/types";
import { conflict } from "./errors";

type Kind = keyof PlanLimits;

/** Counts for a church. Inside a tenant transaction, or on the owner connection with church_id filters. */
export async function churchUsage(db: Kysely<DB>, churchId: string): Promise<Record<Kind, number>> {
  const r = await sql<{ disciplers: string; disciples: string; cells: string }>`
    select
      (select count(*) from discipler_status where church_id = ${churchId} and status = 'approved') as disciplers,
      (select count(distinct disciple_id) from relationship where church_id = ${churchId} and status in (${sql.join(CAPACITY_STATUSES)})) as disciples,
      (select count(*) from conversation where church_id = ${churchId} and kind = 'cell' and archived_at is null) as cells
  `.execute(db);
  const x = r.rows[0]!;
  return { disciplers: Number(x.disciplers), disciples: Number(x.disciples), cells: Number(x.cells) };
}

const NOUN: Record<Kind, string> = { disciplers: "approved disciplers", disciples: "disciples", cells: "cells" };

/**
 * Throw PLAN_LIMIT when adding `adding` more would pass the church's limit.
 * Takes a per-church lock for the rest of the transaction, so two approvals at
 * the same moment cannot both take the last place.
 */
export async function assertRoom(tx: Kysely<DB>, churchId: string, kind: Kind, adding = 1): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${"plan-limit:" + churchId}))`.execute(tx);
  const c = await tx.selectFrom("church").select(["plan", "extra_blocks"]).where("id", "=", churchId).executeTakeFirstOrThrow();
  const limit = limitsFor(c.plan, c.extra_blocks)[kind];
  if (limit === null) return;
  const used = (await churchUsage(tx, churchId))[kind];
  if (used + adding > limit) {
    throw conflict(
      "PLAN_LIMIT",
      `Your church's ${PLAN_NAME[c.plan]} plan allows ${limit} ${NOUN[kind]}, and all of them are in use. A church administrator can add capacity under Plan and billing.`,
    );
  }
}
