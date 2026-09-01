import type { Kysely } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Env } from "../env.js";
import { log } from "../log.js";
import { createClaDb, SIGNATURE_FIELDS } from "./store.js";

/**
 * CLA schema migrations, applied at startup (`main.ts`). Defined in code
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
 * (CLA disabled); throws when a migration fails, so the bot never boots
 * against a half-migrated schema.
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
