import {
  type StoredSourceRecord,
  StoredSourceRecordSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption } from "./shared";

const decodeStoredSourceRecord = Schema.decodeUnknownSync(StoredSourceRecordSchema);
const encodeStoredSourceRecord = Schema.encodeSync(StoredSourceRecordSchema);

// Explicit column list — no SurrealDB `id` field for composite-PK table
const SOURCE_COLS = `workspaceId, sourceId, name, kind, endpoint, status, enabled, namespace, transport, queryParamsJson, headersJson, specUrl, defaultHeadersJson, sourceHash, sourceDocumentText, lastError, createdAt, updatedAt`;

const tokenizeQuery = (value: string | undefined): string[] =>
  value
    ?.trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}_]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    ?? [];

export const createSourcesRepo = (client: SurrealClient) => ({
  listByWorkspaceId: (workspaceId: StoredSourceRecord["workspaceId"]) =>
    client.use("rows.sources.list_by_workspace", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${SOURCE_COLS} FROM sources WHERE workspaceId = $workspaceId ORDER BY updatedAt ASC, sourceId ASC`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredSourceRecord(row));
    }),

  getByWorkspaceAndId: (
    workspaceId: StoredSourceRecord["workspaceId"],
    sourceId: StoredSourceRecord["id"],
  ) =>
    client.use("rows.sources.get_by_workspace_and_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${SOURCE_COLS} FROM sources WHERE workspaceId = $workspaceId AND sourceId = $sourceId LIMIT 1`,
        { workspaceId, sourceId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeStoredSourceRecord(row.value))
        : Option.none<StoredSourceRecord>();
    }),

  insert: (source: StoredSourceRecord) =>
    client.use("rows.sources.insert", async (db) => {
      const encoded = encodeStoredSourceRecord(source);
      await db.query(
        `INSERT INTO sources $content`,
        { content: encoded },
      );
    }),

  update: (
    workspaceId: StoredSourceRecord["workspaceId"],
    sourceId: StoredSourceRecord["id"],
    patch: Partial<Omit<StoredSourceRecord, "id" | "workspaceId" | "createdAt">>,
  ) =>
    client.use("rows.sources.update", async (db) => {
      // UPDATE ... WHERE for composite PK table — returns updated rows with explicit cols
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE sources MERGE $patch WHERE workspaceId = $workspaceId AND sourceId = $sourceId RETURN ${SOURCE_COLS}`,
        { workspaceId, sourceId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeStoredSourceRecord(row.value))
        : Option.none<StoredSourceRecord>();
    }),

  removeByWorkspaceAndId: (
    workspaceId: StoredSourceRecord["workspaceId"],
    sourceId: StoredSourceRecord["id"],
  ) =>
    client.use("rows.sources.remove", async (db) => {
      // Get existing tool artifact paths
      const pathResult = await db.query<[Array<{ path: string }>]>(
        `SELECT path FROM tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId`,
        { workspaceId, sourceId },
      );
      const existingToolPaths = (pathResult[0] ?? []).map((r) => r.path);

      if (existingToolPaths.length > 0) {
        await db.query(
          `DELETE tool_artifact_parameters WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingToolPaths },
        );

        await db.query(
          `DELETE tool_artifact_request_body_content_types WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingToolPaths },
        );

        await db.query(
          `DELETE tool_artifact_ref_hint_keys WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingToolPaths },
        );
      }

      await db.query(
        `DELETE tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId`,
        { workspaceId, sourceId },
      );

      const deleted = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE sources WHERE workspaceId = $workspaceId AND sourceId = $sourceId RETURN BEFORE`,
        { workspaceId, sourceId },
      );
      const rows = deleted[0] ?? [];
      return rows.length > 0;
    }),
});
