import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { createDrizzleClient, type DrizzleClient } from "./client";
import {
  createAccountsRepo,
  createCredentialsRepo,
  createExecutionInteractionsRepo,
  createExecutionsRepo,
  createLocalInstallationsRepo,
  createOrganizationMembershipsRepo,
  createOrganizationsRepo,
  createPoliciesRepo,
  createSecretMaterialsRepo,
  createSourceAuthSessionsRepo,
  createSourceCredentialBindingsRepo,
  createSourcesRepo,
  createToolArtifactsRepo,
  createWorkspacesRepo,
} from "./repos";
import { drizzleSchema, tableNames, type DrizzleTables } from "./schema";
import {
  createSqlRuntime,
  runMigrations,
  type CreateSqlRuntimeOptions,
  type DrizzleDb,
  type SqlBackend,
  type SqlRuntime,
} from "./sql-runtime";
import {
  connectSurrealDb,
  createSurrealClient,
} from "./surreal-client";
import {
  createAccountsRepo as createSurrealAccountsRepo,
  createCredentialsRepo as createSurrealCredentialsRepo,
  createExecutionInteractionsRepo as createSurrealExecutionInteractionsRepo,
  createExecutionsRepo as createSurrealExecutionsRepo,
  createLocalInstallationsRepo as createSurrealLocalInstallationsRepo,
  createOrganizationMembershipsRepo as createSurrealOrganizationMembershipsRepo,
  createOrganizationsRepo as createSurrealOrganizationsRepo,
  createPoliciesRepo as createSurrealPoliciesRepo,
  createSecretMaterialsRepo as createSurrealSecretMaterialsRepo,
  createSourceAuthSessionsRepo as createSurrealSourceAuthSessionsRepo,
  createSourceCredentialBindingsRepo as createSurrealSourceCredentialBindingsRepo,
  createSourcesRepo as createSurrealSourcesRepo,
  createToolArtifactsRepo as createSurrealToolArtifactsRepo,
  createWorkspacesRepo as createSurrealWorkspacesRepo,
} from "./surreal-repos";

export { tableNames, type DrizzleTables } from "./schema";
export {
  ControlPlanePersistenceError,
  toPersistenceError,
  type PersistenceErrorKind,
} from "./persistence-errors";
export { createDrizzleClient, type DrizzleClient } from "./client";
export {
  createSqlRuntime,
  runMigrations,
  type SqlRuntime,
  type SqlBackend,
  type DrizzleDb,
  type CreateSqlRuntimeOptions,
} from "./sql-runtime";
export { connectSurrealDb, createSurrealClient, type SurrealClient } from "./surreal-client";

const createRows = (client: DrizzleClient, tables: DrizzleTables = drizzleSchema) => ({
  accounts: createAccountsRepo(client, tables),
  organizations: createOrganizationsRepo(client, tables),
  organizationMemberships: createOrganizationMembershipsRepo(client, tables),
  workspaces: createWorkspacesRepo(client, tables),
  sources: createSourcesRepo(client, tables),
  credentials: createCredentialsRepo(client, tables),
  toolArtifacts: createToolArtifactsRepo(client, tables),
  sourceCredentialBindings: createSourceCredentialBindingsRepo(client, tables),
  secretMaterials: createSecretMaterialsRepo(client, tables),
  sourceAuthSessions: createSourceAuthSessionsRepo(client, tables),
  policies: createPoliciesRepo(client, tables),
  localInstallations: createLocalInstallationsRepo(client, tables),
  executions: createExecutionsRepo(client, tables),
  executionInteractions: createExecutionInteractionsRepo(client, tables),
});

export type SqlControlPlaneRows = ReturnType<typeof createRows>;

export type SqlControlPlanePersistence = {
  backend?: SqlBackend;
  db?: DrizzleDb;
  rows: SqlControlPlaneRows;
  close: () => Promise<void>;
};

export class SqlControlPlanePersistenceService extends Context.Tag(
  "#persistence/SqlControlPlanePersistenceService",
)<SqlControlPlanePersistenceService, SqlControlPlanePersistence>() {}

export class SqlControlPlaneRowsService extends Context.Tag(
  "#persistence/SqlControlPlaneRowsService",
)<SqlControlPlaneRowsService, SqlControlPlaneRows>() {}

export class SqlPersistenceBootstrapError extends Data.TaggedError(
  "SqlPersistenceBootstrapError",
)<{
  message: string;
  details: string | null;
}> {}

const toBootstrapError = (cause: unknown): SqlPersistenceBootstrapError => {
  const details = cause instanceof Error ? cause.message : String(cause);
  return new SqlPersistenceBootstrapError({
    message: `Failed initializing SQL control-plane persistence: ${details}`,
    details,
  });
};

const createRuntimeEffect = (options: CreateSqlRuntimeOptions) =>
  Effect.tryPromise({
    try: () => createSqlRuntime(options),
    catch: toBootstrapError,
  });

const runMigrationsEffect = (
  runtime: SqlRuntime,
  migrationsFolder: string | undefined,
) =>
  Effect.tryPromise({
    try: () => runMigrations(runtime, { migrationsFolder }),
    catch: toBootstrapError,
  });

const closeRuntimeEffect = (runtime: SqlRuntime) =>
  Effect.tryPromise({
    try: () => runtime.close(),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause ?? "unknown close error")),
  }).pipe(Effect.orDie);

export const createSqlControlPlanePersistence = (
  options: CreateSqlRuntimeOptions,
): Effect.Effect<SqlControlPlanePersistence, SqlPersistenceBootstrapError> =>
  Effect.flatMap(createRuntimeEffect(options), (runtime) =>
    runMigrationsEffect(runtime, options.migrationsFolder).pipe(
      Effect.map(() => {
        const client = createDrizzleClient({
          backend: runtime.backend,
          db: runtime.db,
        });

        return {
          backend: runtime.backend,
          db: runtime.db,
          rows: createRows(client),
          close: () => runtime.close(),
        } satisfies SqlControlPlanePersistence;
      }),
      Effect.catchAll((error) =>
        closeRuntimeEffect(runtime).pipe(
          Effect.zipRight(Effect.fail(error)),
        )),
    ));

export const SqlControlPlanePersistenceLive = (
  options: CreateSqlRuntimeOptions,
) =>
  Layer.scoped(
    SqlControlPlanePersistenceService,
    Effect.acquireRelease(
      createSqlControlPlanePersistence(options),
      (persistence) =>
        Effect.tryPromise({
          try: () => persistence.close(),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error(String(cause ?? "unknown close error")),
        }).pipe(Effect.orDie),
    ),
  );

export const SqlControlPlaneRowsLive = Layer.effect(
  SqlControlPlaneRowsService,
  Effect.map(SqlControlPlanePersistenceService, (persistence) => persistence.rows),
);

// ── SurrealDB path ────────────────────────────────────────────────────────────

const createSurrealRows = (client: ReturnType<typeof createSurrealClient>) => ({
  accounts: createSurrealAccountsRepo(client),
  organizations: createSurrealOrganizationsRepo(client),
  organizationMemberships: createSurrealOrganizationMembershipsRepo(client),
  workspaces: createSurrealWorkspacesRepo(client),
  sources: createSurrealSourcesRepo(client),
  credentials: createSurrealCredentialsRepo(client),
  toolArtifacts: createSurrealToolArtifactsRepo(client),
  sourceCredentialBindings: createSurrealSourceCredentialBindingsRepo(client),
  secretMaterials: createSurrealSecretMaterialsRepo(client),
  sourceAuthSessions: createSurrealSourceAuthSessionsRepo(client),
  policies: createSurrealPoliciesRepo(client),
  localInstallations: createSurrealLocalInstallationsRepo(client),
  executions: createSurrealExecutionsRepo(client),
  executionInteractions: createSurrealExecutionInteractionsRepo(client),
});

export const createSurrealControlPlanePersistence = (
  surrealdbUrl: string,
): Effect.Effect<SqlControlPlanePersistence, SqlPersistenceBootstrapError> =>
  Effect.tryPromise({
    try: async () => {
      const db = await connectSurrealDb(surrealdbUrl);
      const client = createSurrealClient(db);
      const rows = createSurrealRows(client);
      return {
        rows,
        close: async () => { await db.close(); },
      } satisfies SqlControlPlanePersistence;
    },
    catch: toBootstrapError,
  });

export const SqlControlPlanePersistenceLiveFromSurreal = (surrealdbUrl: string) =>
  Layer.scoped(
    SqlControlPlanePersistenceService,
    Effect.acquireRelease(
      createSurrealControlPlanePersistence(surrealdbUrl),
      (persistence) =>
        Effect.tryPromise({
          try: () => persistence.close(),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error(String(cause ?? "unknown close error")),
        }).pipe(Effect.orDie),
    ),
  );
