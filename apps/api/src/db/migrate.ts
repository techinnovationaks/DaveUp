// Minimal forward-only SQL migration runner.
// Each file in ./migrations runs once, in name order, inside a transaction.
// Usage: tsx src/db/migrate.ts [--reset]   (--reset drops everything; refused in production)
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const APP_ROLE = "daveup_app";

/**
 * Make sure the restricted app role in APP_DATABASE_URL exists and can connect.
 * Locally Docker's init script creates it; on a hosted Postgres (Railway, Neon)
 * this does. The role must never be a superuser or bypass row-level security.
 */
async function ensureAppRole(client: pg.Client, log?: boolean) {
  const app = new URL(config.appDatabaseUrl);
  const owner = new URL(config.ownerDatabaseUrl);
  const user = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (!user || user === decodeURIComponent(owner.username)) {
    throw new Error("APP_DATABASE_URL must use its own restricted role (daveup_app), not the owner");
  }
  // The migrations grant table access to this exact role name.
  if (user !== APP_ROLE) throw new Error(`APP_DATABASE_URL must connect as "${APP_ROLE}"; the migrations grant access to that role`);
  const existing = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", [user]);
  const ident = client.escapeIdentifier(user);
  if (existing.rowCount === 0) {
    if (!password) throw new Error("APP_DATABASE_URL needs a password for the new app role");
    await client.query(`CREATE ROLE ${ident} LOGIN PASSWORD ${client.escapeLiteral(password)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    if (log) console.log(`created database role ${user}`);
  } else if (existing.rows[0]!.rolsuper || existing.rows[0]!.rolbypassrls) {
    throw new Error(`Role ${user} can bypass row-level security; use a restricted role for APP_DATABASE_URL`);
  }
  const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
  await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(rows[0]!.db)} TO ${ident}`);
}

export async function migrate(opts: { reset?: boolean; log?: boolean } = {}): Promise<string[]> {
  const client = new pg.Client({ connectionString: config.ownerDatabaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureAppRole(client, opts.log);
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
