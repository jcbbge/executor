import { type Workspace, WorkspaceSchema } from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId, postgresSecretHandlesFromCredentials } from "./shared";

const decodeWorkspace = Schema.decodeUnknownSync(WorkspaceSchema);

export const createWorkspacesRepo = (client: SurrealClient) => ({
  listByOrganizationId: (organizationId: Workspace["organizationId"]) =>
    client.use("rows.workspaces.list_by_organization", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM workspaces WHERE organizationId = $organizationId ORDER BY updatedAt ASC, id ASC`,
        { organizationId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeWorkspace(normalizeId(row)));
    }),

  getById: (workspaceId: Workspace["id"]) =>
    client.use("rows.workspaces.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM workspaces WHERE id = type::thing('workspaces', $id) LIMIT 1`,
        { id: workspaceId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeWorkspace(normalizeId(row.value)))
        : Option.none<Workspace>();
    }),

  insert: (workspace: Workspace) =>
    client.use("rows.workspaces.insert", async (db) => {
      await db.query(
        `INSERT INTO workspaces $content`,
        { content: workspace },
      );
    }),

  update: (
    workspaceId: Workspace["id"],
    patch: Partial<Omit<Workspace, "id" | "createdAt">>,
  ) =>
    client.use("rows.workspaces.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::thing('workspaces', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id: workspaceId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeWorkspace(normalizeId(row.value)))
        : Option.none<Workspace>();
    }),

  removeById: (workspaceId: Workspace["id"]) =>
    client.useTx("rows.workspaces.remove", async (db) => {
      // Get execution IDs
      const execResult = await db.query<[Array<{ id: unknown }>]>(
        `SELECT meta::id(id) AS id FROM executions WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );
      const executionIds = (execResult[0] ?? []).map((r) => String(r.id));

      // Get credentials for postgres secret handles
      const credResult = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT tokenProviderId, tokenHandle, refreshTokenProviderId, refreshTokenHandle FROM credentials WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );
      const credRows = credResult[0] ?? [];
      const postgresSecretHandles = postgresSecretHandlesFromCredentials(
        credRows as Array<{
          tokenProviderId: string;
          tokenHandle: string;
          refreshTokenProviderId: string | null;
          refreshTokenHandle: string | null;
        }>,
      );

      if (executionIds.length > 0) {
        await db.query(
          `DELETE execution_interactions WHERE executionId IN $executionIds`,
          { executionIds },
        );
      }

      await db.query(
        `DELETE executions WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE source_auth_sessions WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE source_credential_bindings WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE credentials WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE sources WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE policies WHERE scopeType = 'workspace' AND workspaceId = $workspaceId`,
        { workspaceId },
      );

      await db.query(
        `DELETE local_installations WHERE workspaceId = $workspaceId`,
        { workspaceId },
      );

      if (postgresSecretHandles.length > 0) {
        await db.query(
          `DELETE secret_materials WHERE id IN $secretIds`,
          { secretIds: postgresSecretHandles },
        );
      }

      const deleted = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::thing('workspaces', $id) RETURN BEFORE *`,
        { id: workspaceId },
      );
      const rows = deleted[0] ?? [];
      return rows.length > 0;
    }),
});
