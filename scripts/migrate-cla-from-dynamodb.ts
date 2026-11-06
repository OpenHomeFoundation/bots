/**
 * One-off backfill of the CLA database: copies the legacy bot's DynamoDB
 * tables (signers and pending signers) into the Postgres tables the bot now
 * reads. Runs the schema migrations first, then scans DynamoDB and inserts
 * with ON CONFLICT DO NOTHING — existing Postgres rows win, so the script is
 * idempotent and can re-run at cutover without clobbering signatures already
 * recorded in Postgres.
 *
 * Usage (also reads a local .env):
 *   CLA_DATABASE_URL=postgres://… \
 *   CLA_DDB_REGION=… CLA_SIGNERS_TABLE=… CLA_PENDING_SIGNERS_TABLE=… \
 *     pnpm run migrate-cla
 */
import { type AttributeValue, DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import type { InsertObject } from "kysely";
import type { ClaDatabase } from "../src/cla/store.js";

// Node's type stripping can't follow the src graph's `.js` specifiers into
// `.ts` files, so the CLA modules come from the build output — the package
// script runs `pnpm build` first. dist ships no declarations, so the
// specifiers are widened to `string` (skipping tsc's module resolution)
// and the types come from the src modules the build compiled.
const { createClaDb, SIGNATURE_FIELDS } = (await import(
  "../dist/cla/store.js" as string
)) as typeof import("../src/cla/store.js");
const { migrateClaDatabase } = (await import(
  "../dist/cla/migrations.js" as string
)) as typeof import("../src/cla/migrations.js");

try {
  process.loadEnvFile();
} catch {
  // no .env file — the variables come from the real environment
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required("CLA_DATABASE_URL");
const region = required("CLA_DDB_REGION");
const signersTable = required("CLA_SIGNERS_TABLE");
const pendingTable = required("CLA_PENDING_SIGNERS_TABLE");

type Item = Record<string, AttributeValue>;

async function* scan(client: DynamoDBClient, table: string): AsyncGenerator<Item> {
  let startKey: Item | undefined;
  do {
    const page = await client.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: startKey }),
    );
    yield* page.Items ?? [];
    startKey = page.LastEvaluatedKey;
  } while (startKey);
}

await migrateClaDatabase({ CLA_DATABASE_URL: databaseUrl });

const dynamo = new DynamoDBClient({ region });
const db = createClaDb(databaseUrl);
const BATCH = 500;

type Row<Table extends keyof ClaDatabase> = InsertObject<ClaDatabase, Table> & {
  github_username: string;
};

async function copy<Table extends keyof ClaDatabase>(
  table: string,
  target: Table,
  mapItem: (item: Item) => Row<Table> | undefined,
): Promise<void> {
  let copied = 0;
  let skipped = 0;
  let conflicted = 0;
  let batch: Row<Table>[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const inserted = await db
      .insertInto(target)
      .values(batch)
      .onConflict((oc) => oc.column("github_username").doNothing())
      .returning("github_username")
      .execute();
    // A conflict means Postgres already had the login and kept its row. That
    // only happens when rows landed in Postgres before this backfill ran —
    // unexpected at cutover, so name the logins for manual comparison.
    if (inserted.length < batch.length) {
      const landed = new Set<string>(inserted.map((row) => String(row.github_username)));
      const kept = batch.map((row) => row.github_username).filter((login) => !landed.has(login));
      conflicted += kept.length;
      console.warn(
        `${target}: ${kept.length} login(s) already in Postgres, kept the Postgres row: ${kept.join(", ")}`,
      );
    }
    copied += inserted.length;
    batch = [];
  };
  for await (const item of scan(dynamo, table)) {
    const row = mapItem(item);
    if (!row) {
      skipped++;
      continue;
    }
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(
    `${target}: ${copied} rows copied from ${table} ` +
      `(${skipped} unusable items skipped, ${conflicted} already present)`,
  );
}

await copy(signersTable, "cla_signers", (item) => {
  const login = item.github_username?.S;
  if (!login) return undefined;
  return {
    github_username: login,
    ...Object.fromEntries(SIGNATURE_FIELDS.map((field) => [field, item[field]?.S ?? null])),
  };
});

await copy(pendingTable, "cla_pending_signers", (item) => {
  const login = item.github_username?.S;
  const owner = item.repository_owner?.S;
  const repo = item.repository?.S;
  const number = item.pr_number?.S ?? item.pr_number?.N;
  // Items the store's getPendingSigner would treat as absent anyway.
  if (!login || !owner || !repo || !number) return undefined;
  return {
    github_username: login,
    commits: JSON.stringify(item.commits?.L?.flatMap((c) => c.S ?? []) ?? []),
    pr: item.pr?.S ?? `${owner}/${repo}#${number}`,
    repository_owner: owner,
    repository: repo,
    pr_number: number,
    signature_requested_at: item.signatureRequestedAt?.S ?? new Date().toISOString(),
  };
});

await db.destroy();
dynamo.destroy();
