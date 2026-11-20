import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/types";

export async function audit(
  db: Kysely<DB> | Transaction<DB>,
  entry: { churchId: string | null; actorId: string | null; action: string; targetType: string; targetId?: string | null; data?: Record<string, unknown> },
): Promise<void> {
  await db
    .insertInto("audit_log")
    .values({
      church_id: entry.churchId,
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      data: JSON.stringify(entry.data ?? {}),
    })
    .execute();
}
