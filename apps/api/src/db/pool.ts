import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import { config } from "../config";
import type { DB } from "./types";

// Return DATE columns as "YYYY-MM-DD" text. By default pg turns them into a
// Date at local midnight, which shifts days depending on the server time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

function makeDb(connectionString: string, max: number): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  });
}

/** Owner connection. Bypasses RLS: use only for auth, church registration/lookup and migrations. */
export const ownerDb = makeDb(config.ownerDatabaseUrl, 5);

/** App connection. Subject to RLS: use for every church-scoped request via withTenant. */
export const appDb = makeDb(config.appDatabaseUrl, 20);

export type Tx = Transaction<DB>;

/**
 * Run work inside one transaction with the tenant set. RLS policies read
 * app.church_id, so queries cannot see or write another church's rows even
 * if a WHERE clause is forgotten.
 */
export async function withTenant<T>(churchId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb.transaction().execute(async (tx) => {
    await sql`select set_config('app.church_id', ${churchId}, true)`.execute(tx);
    return fn(tx);
  });
}

export async function closeDbs(): Promise<void> {
  await Promise.all([ownerDb.destroy(), appDb.destroy()]);
}
