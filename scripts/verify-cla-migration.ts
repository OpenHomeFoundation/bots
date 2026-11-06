/**
 * Verifies the CLA backfill: scans the legacy DynamoDB tables and compares
 * every item, field by field, with its Postgres row, using the same mapping as
 * migrate-cla-from-dynamodb.ts. Also reports Postgres rows with no DynamoDB
 * item, and DynamoDB items the mapping cannot carry without losing data.
 *
 * Read-only on both sides. Prints counts and GitHub logins only, never field
 * values. Exits non-zero on any difference.
 *
 * Usage (same variables as migrate-cla, also reads a local .env):
 *   CLA_DATABASE_URL=postgres://… \
 *   CLA_DDB_REGION=… CLA_SIGNERS_TABLE=… CLA_PENDING_SIGNERS_TABLE=… \
 *     pnpm run verify-cla
 */
import { type AttributeValue, DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

// Loaded from the build output for the same reason as in migrate-cla-from-dynamodb.ts.
const { createClaDb, SIGNATURE_FIELDS } = (await import(
  "../dist/cla/store.js" as string
)) as typeof import("../src/cla/store.js");

try {
  process.loadEnvFile();
} catch {
  // no .env file, the variables come from the real environment
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
type Row = Record<string, unknown>;

async function scanAll(client: DynamoDBClient, table: string): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page = await client.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: startKey, ConsistentRead: true }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

interface Expectation {
  /** The row the backfill should have written, or undefined when it skips the item. */
  row: Row | undefined;
  /** Attributes the mapping drops or nulls although they carry data. */
  lossy: string[];
  /** Columns whose value the backfill invents (so any value is accepted). */
  anyValue?: string[];
}

const SIGNER_ATTRS = new Set<string>(["github_username", ...SIGNATURE_FIELDS]);
const PENDING_ATTRS = new Set([
  "github_username",
  "commits",
  "pr",
  "repository_owner",
  "repository",
  "pr_number",
  "signatureRequestedAt",
]);

function expectSigner(item: Item): Expectation {
  const lossy = Object.keys(item).filter((attr) => !SIGNER_ATTRS.has(attr));
  for (const field of SIGNATURE_FIELDS) {
    const value = item[field];
    if (value && value.S === undefined && value.NULL === undefined) lossy.push(field);
  }
  const login = item.github_username?.S;
  if (!login) return { row: undefined, lossy };
  return {
    row: {
      github_username: login,
      ...Object.fromEntries(SIGNATURE_FIELDS.map((field) => [field, item[field]?.S ?? null])),
    },
    lossy,
  };
}

function expectPending(item: Item): Expectation {
  const lossy = Object.keys(item).filter((attr) => !PENDING_ATTRS.has(attr));
  if (item.commits && (!item.commits.L || item.commits.L.some((c) => c.S === undefined))) {
    lossy.push("commits");
  }
  const login = item.github_username?.S;
  const owner = item.repository_owner?.S;
  const repo = item.repository?.S;
  const number = item.pr_number?.S ?? item.pr_number?.N;
  if (!login || !owner || !repo || !number) return { row: undefined, lossy };
  return {
    row: {
      github_username: login,
      commits: JSON.stringify(item.commits?.L?.flatMap((c) => c.S ?? []) ?? []),
      pr: item.pr?.S ?? `${owner}/${repo}#${number}`,
      repository_owner: owner,
      repository: repo,
      pr_number: number,
      signature_requested_at: item.signatureRequestedAt?.S,
    },
    lossy,
    anyValue: item.signatureRequestedAt?.S ? [] : ["signature_requested_at"],
  };
}

function normalize(column: string, value: unknown): unknown {
  // jsonb comes back parsed; compare it in the form the backfill wrote it.
  return column === "commits" && typeof value !== "string" ? JSON.stringify(value) : value;
}

function compare(
  label: string,
  items: Item[],
  rows: Row[],
  expect: (item: Item) => Expectation,
): boolean {
  const byLogin = new Map(rows.map((row) => [String(row.github_username), row]));
  const seen = new Set<string>();
  const mismatched: string[] = [];
  const missing: string[] = [];
  const lossy: string[] = [];
  const diffColumns = new Map<string, number>();
  let matched = 0;
  let skipped = 0;

  for (const item of items) {
    const { row: want, lossy: lost, anyValue = [] } = expect(item);
    const login = item.github_username?.S ?? "<no login>";
    if (lost.length) lossy.push(`${login} (${lost.join(", ")})`);
    if (!want) {
      skipped++;
      continue;
    }
    seen.add(login);
    const got = byLogin.get(login);
    if (!got) {
      missing.push(login);
      continue;
    }
    const differing = Object.keys(want).filter(
      (column) => !anyValue.includes(column) && normalize(column, got[column]) !== want[column],
    );
    if (differing.length) {
      mismatched.push(`${login} (${differing.join(", ")})`);
      for (const column of differing) diffColumns.set(column, (diffColumns.get(column) ?? 0) + 1);
    } else {
      matched++;
    }
  }
  const extra = rows.map((row) => String(row.github_username)).filter((login) => !seen.has(login));

  const sample = (list: string[]) => (list.length ? `: ${list.slice(0, 20).join("; ")}` : "");
  console.log(`${label}: ${items.length} DynamoDB items, ${rows.length} Postgres rows`);
  console.log(`  matched           ${matched}`);
  console.log(`  skipped (unusable) ${skipped}`);
  console.log(`  mismatched        ${mismatched.length}${sample(mismatched)}`);
  if (diffColumns.size)
    console.log(`  differing columns ${JSON.stringify(Object.fromEntries(diffColumns))}`);
  console.log(`  missing in PG     ${missing.length}${sample(missing)}`);
  console.log(`  extra in PG       ${extra.length}${sample(extra)}`);
  console.log(`  lossy items       ${lossy.length}${sample(lossy)}`);
  return mismatched.length + missing.length + extra.length + lossy.length === 0;
}

const dynamo = new DynamoDBClient({ region });
const db = createClaDb(databaseUrl);
try {
  const [signerItems, pendingItems, signerRows, pendingRows] = await Promise.all([
    scanAll(dynamo, signersTable),
    scanAll(dynamo, pendingTable),
    db.selectFrom("cla_signers").selectAll().execute(),
    db.selectFrom("cla_pending_signers").selectAll().execute(),
  ]);
  const signersOk = compare("cla_signers", signerItems, signerRows, expectSigner);
  const pendingOk = compare("cla_pending_signers", pendingItems, pendingRows, expectPending);
  if (signersOk && pendingOk) {
    console.log("OK: Postgres matches DynamoDB");
  } else {
    console.error("FAIL: Postgres does not match DynamoDB");
    process.exitCode = 1;
  }
} finally {
  await db.destroy();
  dynamo.destroy();
}
