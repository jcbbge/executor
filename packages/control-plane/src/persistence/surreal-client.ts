import * as Effect from "effect/Effect";
import { Surreal } from "surrealdb";
import { toPersistenceError, type ControlPlanePersistenceError } from "./persistence-errors";

export type TxStatement = { sql: string; vars?: Record<string, unknown> };

export type SurrealClient = {
  use: <A>(operation: string, run: (db: Surreal) => Promise<A>) => Effect.Effect<A, ControlPlanePersistenceError>;
  useTx: (operation: string, statements: TxStatement[]) => Effect.Effect<void, ControlPlanePersistenceError>;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const bundleStatements = (statements: TxStatement[]): { sql: string; vars: Record<string, unknown> } => {
  const allVars: Record<string, unknown> = {};
  const parts: string[] = ["BEGIN TRANSACTION"];

  for (let i = 0; i < statements.length; i++) {
    const { sql, vars } = statements[i];
    if (!vars || Object.keys(vars).length === 0) {
      parts.push(sql);
      continue;
    }
    let renamed = sql;
    for (const [key, val] of Object.entries(vars)) {
      const newKey = `__tx_${i}_${key}`;
      allVars[newKey] = val;
      renamed = renamed.replace(
        new RegExp(`\\$${escapeRegex(key)}(?![a-zA-Z0-9_])`, "g"),
        `$${newKey}`,
      );
    }
    parts.push(renamed);
  }

  parts.push("COMMIT TRANSACTION");
  return { sql: parts.join(";\n") + ";", vars: allVars };
};

export const createSurrealClient = (db: Surreal): SurrealClient => {
  // Serialize useTx calls to prevent overlapping transactions
  let queue = Promise.resolve<void>(undefined);

  const use = <A>(operation: string, run: (db: Surreal) => Promise<A>): Effect.Effect<A, ControlPlanePersistenceError> =>
    Effect.tryPromise({
      try: () => run(db),
      catch: (cause) => toPersistenceError(operation, cause),
    });

  const useTx = (operation: string, statements: TxStatement[]): Effect.Effect<void, ControlPlanePersistenceError> => {
    const next = queue.then(async (): Promise<void> => {
      if (statements.length === 0) return;
      const { sql, vars } = bundleStatements(statements);
      await db.query(sql, vars);
    });
    queue = next.then(() => undefined, () => undefined);
    return Effect.tryPromise({
      try: () => next,
      catch: (cause) => toPersistenceError(operation, cause),
    });
  };

  return { use, useTx };
};

const TABLES = [
  "accounts",
  "organizations",
  "organization_memberships",
  "workspaces",
  "sources",
  "credentials",
  "tool_artifacts",
  "tool_artifact_parameters",
  "tool_artifact_request_body_content_types",
  "tool_artifact_ref_hint_keys",
  "source_credential_bindings",
  "secret_materials",
  "source_auth_sessions",
  "policies",
  "local_installations",
  "executions",
  "execution_interactions",
];

const initTables = async (db: Surreal): Promise<void> => {
  const stmts = TABLES.map((t) => `DEFINE TABLE IF NOT EXISTS ${t} SCHEMALESS;`).join("\n");
  await db.query(stmts);
};

export const connectSurrealDb = async (url: string): Promise<Surreal> => {
  const db = new Surreal();
  await db.connect(url);
  await db.signin({ username: "root", password: "root" });
  await db.use({ namespace: "stack", database: "catalog" });
  await initTables(db);
  return db;
};
