import { type JSONColumnType, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Env } from "../env.js";
import { log } from "../log.js";

/**
 * The CLA database: a signers table keyed by GitHub login, and a
 * pending-signers table mapping a login to the PR that is waiting on their
 * signature.
 */

/** A commit author the check found unsigned, and where. */
export interface PendingSigner {
  login: string;
  shas: string[];
  pr: { owner: string; repo: string; number: number };
}

/** What the sign flow needs to re-trigger the check after a signature. */
export interface PendingSignerRef {
  owner: string;
  repo: string;
  number: number;
}

/** The sign form's payload, plus request metadata stamped by the handler. */
export interface ClaSignature {
  github_username: string;
  [field: string]: string | undefined;
}

// Persisted signature fields
export const SIGNATURE_FIELDS = [
  "company_name",
  "country",
  "email",
  "github_user_id",
  "i_agree",
  "ip_address",
  "name",
  "received_at",
  "region",
  "signing_for",
  "user_agent",
] as const;

/** The non-key columns, derived so they can never drift from SIGNATURE_FIELDS. */
type SignatureColumns = { [F in (typeof SIGNATURE_FIELDS)[number]]: string | null };

interface SignersTable extends SignatureColumns {
  github_username: string;
}

interface PendingSignersTable {
  github_username: string;
  commits: JSONColumnType<string[]>;
  pr: string;
  repository_owner: string;
  repository: string;
  pr_number: string;
  signature_requested_at: string;
}

export interface ClaDatabase {
  cla_signers: SignersTable;
  cla_pending_signers: PendingSignersTable;
}

/** A Kysely handle on the CLA database. Callers own its lifecycle. */
export function createClaDb(connectionString: string): Kysely<ClaDatabase> {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    // pg waits forever for a connection by default. An unreachable database
    // (wrong security group, black-holed route) would then hang every CLA
    // check and migration attempt instead of failing them.
    connectionTimeoutMillis: 10_000,
  });
  // Without a listener, an error on an idle connection crashes the process.
  pool.on("error", (err) => {
    log.warn("cla: idle database connection error", { error: String(err) });
  });
  return new Kysely<ClaDatabase>({ dialect: new PostgresDialect({ pool }) });
}

export interface ClaStore {
  hasSigned(login: string): Promise<boolean>;
  recordPendingSigners(signers: PendingSigner[]): Promise<void>;
  getPendingSigner(login: string): Promise<PendingSignerRef | undefined>;
  deletePendingSigner(login: string): Promise<void>;
  recordSignature(signature: ClaSignature): Promise<void>;
}

function createStore(db: Kysely<ClaDatabase>): ClaStore {
  return {
    async hasSigned(login) {
      const row = await db
        .selectFrom("cla_signers")
        .select("github_username")
        .where("github_username", "=", login)
        .executeTakeFirst();
      return row !== undefined;
    },

    async recordPendingSigners(signers) {
      if (signers.length === 0) return;
      await db
        .insertInto("cla_pending_signers")
        .values(
          signers.map(({ login, shas, pr }) => ({
            github_username: login,
            commits: JSON.stringify(shas),
            pr: `${pr.owner}/${pr.repo}#${pr.number}`,
            repository_owner: pr.owner,
            repository: pr.repo,
            pr_number: String(pr.number),
            signature_requested_at: new Date().toISOString(),
          })),
        )
        .onConflict((oc) =>
          oc.column("github_username").doUpdateSet((eb) => ({
            commits: eb.ref("excluded.commits"),
            pr: eb.ref("excluded.pr"),
            repository_owner: eb.ref("excluded.repository_owner"),
            repository: eb.ref("excluded.repository"),
            pr_number: eb.ref("excluded.pr_number"),
            signature_requested_at: eb.ref("excluded.signature_requested_at"),
          })),
        )
        .execute();
    },

    async getPendingSigner(login) {
      const row = await db
        .selectFrom("cla_pending_signers")
        .select(["repository_owner", "repository", "pr_number"])
        .where("github_username", "=", login)
        .executeTakeFirst();
      if (!row) return undefined;
      return {
        owner: row.repository_owner,
        repo: row.repository,
        number: Number(row.pr_number),
      };
    },

    async deletePendingSigner(login) {
      await db.deleteFrom("cla_pending_signers").where("github_username", "=", login).execute();
    },

    async recordSignature(signature) {
      const fields = Object.fromEntries(
        SIGNATURE_FIELDS.map((field) => [field, signature[field] ?? null]),
      ) as Record<(typeof SIGNATURE_FIELDS)[number], string | null>;
      await db
        .insertInto("cla_signers")
        .values({ github_username: signature.github_username, ...fields })
        // Re-signing replaces the whole row, like the DynamoDB PutItem did.
        .onConflict((oc) => oc.column("github_username").doUpdateSet(fields))
        .execute();
    },
  };
}

const storeByEnv = new WeakMap<Env, ClaStore | undefined>();

/**
 * The Postgres-backed store for this env, or undefined when the database URL
 * is absent (CLA disabled). Memoized so every caller shares one pool.
 */
export function postgresClaStore(env: Env): ClaStore | undefined {
  if (!storeByEnv.has(env)) {
    storeByEnv.set(
      env,
      env.CLA_DATABASE_URL ? createStore(createClaDb(env.CLA_DATABASE_URL)) : undefined,
    );
  }
  return storeByEnv.get(env);
}
