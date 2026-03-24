import {
  type SourceCredentialBinding,
  SourceCredentialBindingSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeSourceCredentialBinding = Schema.decodeUnknownSync(SourceCredentialBindingSchema);

export const createSourceCredentialBindingsRepo = (client: SurrealClient) => ({
  listByWorkspaceId: (workspaceId: SourceCredentialBinding["workspaceId"]) =>
    client.use("rows.source_credential_bindings.list_by_workspace", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_credential_bindings WHERE workspaceId = $workspaceId ORDER BY updatedAt ASC, sourceId ASC`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeSourceCredentialBinding(normalizeId(row)));
    }),

  getByWorkspaceAndSourceId: (
    workspaceId: SourceCredentialBinding["workspaceId"],
    sourceId: SourceCredentialBinding["sourceId"],
  ) =>
    client.use("rows.source_credential_bindings.get_by_workspace_and_source_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_credential_bindings WHERE workspaceId = $workspaceId AND sourceId = $sourceId LIMIT 1`,
        { workspaceId, sourceId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSourceCredentialBinding(normalizeId(row.value)))
        : Option.none<SourceCredentialBinding>();
    }),

  upsert: (binding: SourceCredentialBinding) =>
    client.use("rows.source_credential_bindings.upsert", async (db) => {
      await db.query(
        `INSERT INTO source_credential_bindings $content ON DUPLICATE KEY UPDATE workspaceId = $content.workspaceId, sourceId = $content.sourceId, credentialId = $content.credentialId, updatedAt = $content.updatedAt`,
        { content: binding },
      );
    }),

  removeByWorkspaceAndSourceId: (
    workspaceId: SourceCredentialBinding["workspaceId"],
    sourceId: SourceCredentialBinding["sourceId"],
  ) =>
    client.use("rows.source_credential_bindings.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE source_credential_bindings WHERE workspaceId = $workspaceId AND sourceId = $sourceId RETURN BEFORE *`,
        { workspaceId, sourceId },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),
});
