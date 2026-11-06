import { setTimeout as sleep } from "node:timers/promises";
import type { Kysely } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Env } from "../env.js";
import { log } from "../log.js";
import { createClaDb, SIGNATURE_FIELDS } from "./store.js";

/**
 * CLA schema migrations, applied in the background at startup (`main.ts`,
 * retried until they succeed) and by the backfill script. Defined in code
 * rather than as files so the migration set travels inside the build output —
 * no migration directory to ship alongside `dist/`.
 *
 * Kysely tracks applied names in a `kysely_migration` table; entries here are
 * append-only and run in key order.
 */
const migrations: Record<string, Migration> = {
  "0001_cla_tables": {
    async up(db: Kysely<unknown>) {
      // Column-for-column the legacy DynamoDB item shapes: everything text,
      // including pr_number and the timestamps, so the backfill is a plain copy.
      let signers = db.schema
        .createTable("cla_signers")
        .addColumn("github_username", "text", (col) => col.primaryKey());
      for (const field of SIGNATURE_FIELDS) {
        signers = signers.addColumn(field, "text");
      }
      await signers.execute();

      await db.schema
        .createTable("cla_pending_signers")
        .addColumn("github_username", "text", (col) => col.primaryKey())
        .addColumn("commits", "jsonb", (col) => col.notNull())
        .addColumn("pr", "text", (col) => col.notNull())
        .addColumn("repository_owner", "text", (col) => col.notNull())
        .addColumn("repository", "text", (col) => col.notNull())
        .addColumn("pr_number", "text", (col) => col.notNull())
        .addColumn("signature_requested_at", "text", (col) => col.notNull())
        .execute();
    },
  },
};

/**
 * Bring the CLA database up to date. A no-op when the database URL is absent
 * (CLA disabled); throws when a migration fails or the database is
 * unreachable. The backfill script calls it directly and stops on failure;
 * the boot path goes through `migrateClaDatabaseWithRetry`.
 */
export async function migrateClaDatabase(env: Pick<Env, "CLA_DATABASE_URL">): Promise<void> {
  if (!env.CLA_DATABASE_URL) return;
  const db = createClaDb(env.CLA_DATABASE_URL);
  try {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    });
    const { error, results } = await migrator.migrateToLatest();
    for (const result of results ?? []) {
      if (result.status === "Success") {
        log.info("cla: migration applied", { name: result.migrationName });
      }
    }
    if (error) throw error;
  } finally {
    await db.destroy();
  }
}

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;

/**
 * Boot-time migration that never blocks or fails the boot: retry with a
 * growing delay (30 s, 60 s, ... capped at 5 min) until the schema is up to
 * date. While the database is unreachable only the CLA check degrades: its
 * store calls fail, and the engine logs a failing rule and runs the others,
 * so GitHub and Discord keep working, as they did when DynamoDB was down.
 *
 * A failed run applies nothing: Postgres has transactional DDL, and Kysely
 * runs the pending migrations in one transaction.
 */
export async function migrateClaDatabaseWithRetry(
  env: Pick<Env, "CLA_DATABASE_URL">,
  migrate: typeof migrateClaDatabase = migrateClaDatabase,
  wait: (ms: number) => Promise<unknown> = (ms) => sleep(ms, undefined, { ref: false }),
): Promise<void> {
  if (!env.CLA_DATABASE_URL) return;
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(env);
      if (attempt > 1) log.info("cla: database migrated after retrying", { attempt });
      return;
    } catch (err) {
      const retryInMs = Math.min(RETRY_BASE_MS * attempt, RETRY_MAX_MS);
      log.error("cla: database migration failed, the CLA check is degraded until it succeeds", {
        attempt,
        retryInMs,
        error: String(err),
      });
      await wait(retryInMs);
    }
  }
}
