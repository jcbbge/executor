import {
  CredentialSchema,
  type Credential,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeCredential = Schema.decodeUnknownSync(CredentialSchema);

export const createCredentialsRepo = (client: SurrealClient) => ({
  listByWorkspaceId: (workspaceId: Credential["workspaceId"]) =>
    client.use("rows.credentials.list_by_workspace", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM credentials WHERE workspaceId = $workspaceId ORDER BY updatedAt ASC, id ASC`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeCredential(normalizeId(row)));
    }),

  getById: (id: Credential["id"]) =>
    client.use("rows.credentials.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM credentials WHERE id = type::record('credentials', $id) LIMIT 1`,
        { id },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeCredential(normalizeId(row.value)))
        : Option.none<Credential>();
    }),

  upsert: (credential: Credential) =>
    client.use("rows.credentials.upsert", async (db) => {
      await db.query(
        `INSERT INTO credentials $content ON DUPLICATE KEY UPDATE workspaceId = $content.workspaceId, name = $content.name, tokenProviderId = $content.tokenProviderId, tokenHandle = $content.tokenHandle, refreshTokenProviderId = $content.refreshTokenProviderId, refreshTokenHandle = $content.refreshTokenHandle, updatedAt = $content.updatedAt`,
        { content: credential },
      );
    }),

  removeById: (id: Credential["id"]) =>
    client.use("rows.credentials.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::record('credentials', $id) RETURN BEFORE`,
        { id },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),
});
