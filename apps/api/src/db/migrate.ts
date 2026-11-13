// Minimal forward-only SQL migration runner.
// Each file in ./migrations runs once, in name order, inside a transaction.
// Usage: tsx src/db/migrate.ts [--reset]   (--reset drops everything; refused in production)
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(opts: { reset?: boolean; log?: boolean } = {}): Promise<string[]> {
  const client = new pg.Client({ connectionString: config.ownerDatabaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    if (opts.reset) {
      if (config.isProd) throw new Error("Refusing to reset a production database");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migration")).rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sqlText = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query("INSERT INTO schema_migration (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
        if (opts.log) console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    if (opts.log && applied.length === 0) console.log("database is up to date");
    return applied;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate({ reset: process.argv.includes("--reset"), log: true }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
