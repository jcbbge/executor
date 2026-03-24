import {
  type StoredToolArtifactParameterRecord,
  StoredToolArtifactParameterRecordSchema,
  type StoredToolArtifactRecord,
  StoredToolArtifactRecordSchema,
  type StoredToolArtifactRefHintKeyRecord,
  StoredToolArtifactRefHintKeyRecordSchema,
  type StoredToolArtifactRequestBodyContentTypeRecord,
  StoredToolArtifactRequestBodyContentTypeRecordSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption } from "./shared";

const decodeStoredToolArtifactRecord = Schema.decodeUnknownSync(StoredToolArtifactRecordSchema);
const encodeStoredToolArtifactRecord = Schema.encodeSync(StoredToolArtifactRecordSchema);
const decodeStoredToolArtifactParameterRecord = Schema.decodeUnknownSync(StoredToolArtifactParameterRecordSchema);
const encodeStoredToolArtifactParameterRecord = Schema.encodeSync(StoredToolArtifactParameterRecordSchema);
const decodeStoredToolArtifactRequestBodyContentTypeRecord = Schema.decodeUnknownSync(StoredToolArtifactRequestBodyContentTypeRecordSchema);
const encodeStoredToolArtifactRequestBodyContentTypeRecord = Schema.encodeSync(StoredToolArtifactRequestBodyContentTypeRecordSchema);
const decodeStoredToolArtifactRefHintKeyRecord = Schema.decodeUnknownSync(StoredToolArtifactRefHintKeyRecordSchema);
const encodeStoredToolArtifactRefHintKeyRecord = Schema.encodeSync(StoredToolArtifactRefHintKeyRecordSchema);

type ReplaceableToolArtifactRecord = {
  artifact: StoredToolArtifactRecord;
  parameters?: readonly StoredToolArtifactParameterRecord[];
  requestBodyContentTypes?: readonly StoredToolArtifactRequestBodyContentTypeRecord[];
  refHintKeys?: readonly StoredToolArtifactRefHintKeyRecord[];
};

const ARTIFACT_COLS = `workspaceId, path, toolId, sourceId, title, description, searchNamespace, searchText, inputSchemaJson, outputSchemaJson, providerKind, mcpToolName, openApiMethod, openApiPathTemplate, openApiOperationHash, openApiRawToolId, openApiOperationId, openApiTagsJson, openApiRequestBodyRequired, createdAt, updatedAt`;
const PARAM_COLS = `workspaceId, path, position, name, location, required`;
const CONTENT_TYPE_COLS = `workspaceId, path, position, contentType`;
const REF_HINT_COLS = `workspaceId, path, position, refHintKey`;

const tokenizeQuery = (value: string | undefined): string[] =>
  value
    ?.trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}_]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    ?? [];

const buildSearchFilter = (tokens: string[]): string => {
  if (tokens.length === 0) return "false";
  return tokens
    .map((_, i) => `string::contains(string::lowercase(searchText), $tokens[${i}])`)
    .join(" AND ");
};

const buildAnyTokenFilter = (tokens: string[]): string => {
  if (tokens.length === 0) return "false";
  return tokens
    .map((_, i) => `string::contains(string::lowercase(searchText), $tokens[${i}])`)
    .join(" OR ");
};

export const createToolArtifactsRepo = (client: SurrealClient) => ({
  listByWorkspaceId: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    input?: {
      sourceId?: StoredToolArtifactRecord["sourceId"];
      namespace?: string;
      query?: string;
      limit?: number;
    },
  ) =>
    client.use("rows.tool_artifacts.list_by_workspace", async (db) => {
      const tokens = tokenizeQuery(input?.query);
      const conditions = [
        `workspaceId = $workspaceId`,
        input?.sourceId ? `sourceId = $sourceId` : null,
        input?.namespace ? `searchNamespace = $namespace` : null,
        tokens.length > 0 ? `(${buildSearchFilter(tokens)})` : null,
      ].filter(Boolean).join(" AND ");

      const limitClause = `LIMIT ${input?.limit ?? 200}`;

      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${ARTIFACT_COLS} FROM tool_artifacts WHERE ${conditions} ORDER BY searchNamespace ASC, path ASC ${limitClause}`,
        {
          workspaceId,
          sourceId: input?.sourceId,
          namespace: input?.namespace,
          tokens,
        },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredToolArtifactRecord(row));
    }),

  listNamespacesByWorkspaceId: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    input?: { limit?: number },
  ) =>
    client.use("rows.tool_artifacts.list_namespaces_by_workspace", async (db) => {
      const limit = input?.limit ?? 200;
      const result = await db.query<[Array<{ namespace: string; toolCount: number }>]>(
        `SELECT searchNamespace AS namespace, count() AS toolCount FROM tool_artifacts WHERE workspaceId = $workspaceId GROUP BY searchNamespace ORDER BY searchNamespace ASC LIMIT ${limit}`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => ({
        namespace: row.namespace,
        toolCount: Number(row.toolCount),
      }));
    }),

  searchByWorkspaceId: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    input: {
      namespace?: string;
      query: string;
      limit?: number;
    },
  ) =>
    client.use("rows.tool_artifacts.search_by_workspace", async (db) => {
      const tokens = tokenizeQuery(input.query);

      if (tokens.length === 0) {
        return [];
      }

      const conditions = [
        `workspaceId = $workspaceId`,
        input.namespace ? `searchNamespace = $namespace` : null,
        `(${buildAnyTokenFilter(tokens)})`,
      ].filter(Boolean).join(" AND ");

      const limitClause = input.limit !== undefined ? `LIMIT ${input.limit}` : "";

      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${ARTIFACT_COLS} FROM tool_artifacts WHERE ${conditions} ORDER BY searchNamespace ASC, path ASC ${limitClause}`,
        {
          workspaceId,
          namespace: input.namespace,
          tokens,
        },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredToolArtifactRecord(row));
    }),

  getByWorkspaceAndPath: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    path: StoredToolArtifactRecord["path"],
  ) =>
    client.use("rows.tool_artifacts.get_by_workspace_and_path", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${ARTIFACT_COLS} FROM tool_artifacts WHERE workspaceId = $workspaceId AND path = $path LIMIT 1`,
        { workspaceId, path },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeStoredToolArtifactRecord(row.value))
        : Option.none<StoredToolArtifactRecord>();
    }),

  listParametersByWorkspaceAndPath: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    path: StoredToolArtifactRecord["path"],
  ) =>
    client.use("rows.tool_artifacts.list_parameters_by_workspace_and_path", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${PARAM_COLS} FROM tool_artifact_parameters WHERE workspaceId = $workspaceId AND path = $path ORDER BY position ASC`,
        { workspaceId, path },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredToolArtifactParameterRecord(row));
    }),

  listRequestBodyContentTypesByWorkspaceAndPath: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    path: StoredToolArtifactRecord["path"],
  ) =>
    client.use("rows.tool_artifacts.list_request_body_content_types_by_workspace_and_path", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${CONTENT_TYPE_COLS} FROM tool_artifact_request_body_content_types WHERE workspaceId = $workspaceId AND path = $path ORDER BY position ASC`,
        { workspaceId, path },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredToolArtifactRequestBodyContentTypeRecord(row));
    }),

  listRefHintKeysByWorkspaceAndPath: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    path: StoredToolArtifactRecord["path"],
  ) =>
    client.use("rows.tool_artifacts.list_ref_hint_keys_by_workspace_and_path", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT ${REF_HINT_COLS} FROM tool_artifact_ref_hint_keys WHERE workspaceId = $workspaceId AND path = $path ORDER BY position ASC`,
        { workspaceId, path },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeStoredToolArtifactRefHintKeyRecord(row));
    }),

  replaceForSource: (input: {
    workspaceId: StoredToolArtifactRecord["workspaceId"];
    sourceId: StoredToolArtifactRecord["sourceId"];
    artifacts: readonly ReplaceableToolArtifactRecord[];
  }) =>
    client.useTx("rows.tool_artifacts.replace_for_source", async (db) => {
      const pathResult = await db.query<[Array<{ path: string }>]>(
        `SELECT path FROM tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId`,
        { workspaceId: input.workspaceId, sourceId: input.sourceId },
      );
      const existingPaths = (pathResult[0] ?? []).map((r) => r.path);

      if (existingPaths.length > 0) {
        await db.query(
          `DELETE tool_artifact_parameters WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId: input.workspaceId, paths: existingPaths },
        );
        await db.query(
          `DELETE tool_artifact_request_body_content_types WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId: input.workspaceId, paths: existingPaths },
        );
        await db.query(
          `DELETE tool_artifact_ref_hint_keys WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId: input.workspaceId, paths: existingPaths },
        );
      }

      await db.query(
        `DELETE tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId`,
        { workspaceId: input.workspaceId, sourceId: input.sourceId },
      );

      if (input.artifacts.length === 0) {
        return;
      }

      for (const { artifact } of input.artifacts) {
        await db.query(
          `INSERT INTO tool_artifacts $content`,
          { content: encodeStoredToolArtifactRecord(artifact) },
        );
      }

      const parameterRows = input.artifacts.flatMap(({ parameters = [] }) => parameters);
      for (const record of parameterRows) {
        await db.query(
          `INSERT INTO tool_artifact_parameters $content`,
          { content: encodeStoredToolArtifactParameterRecord(record) },
        );
      }

      const requestBodyContentTypeRows = input.artifacts.flatMap(
        ({ requestBodyContentTypes = [] }) => requestBodyContentTypes,
      );
      for (const record of requestBodyContentTypeRows) {
        await db.query(
          `INSERT INTO tool_artifact_request_body_content_types $content`,
          { content: encodeStoredToolArtifactRequestBodyContentTypeRecord(record) },
        );
      }

      const refHintKeyRows = input.artifacts.flatMap(({ refHintKeys = [] }) => refHintKeys);
      for (const record of refHintKeyRows) {
        await db.query(
          `INSERT INTO tool_artifact_ref_hint_keys $content`,
          { content: encodeStoredToolArtifactRefHintKeyRecord(record) },
        );
      }
    }),

  removeByWorkspaceAndSourceId: (
    workspaceId: StoredToolArtifactRecord["workspaceId"],
    sourceId: StoredToolArtifactRecord["sourceId"],
  ) =>
    client.useTx("rows.tool_artifacts.remove_by_workspace_and_source_id", async (db) => {
      const pathResult = await db.query<[Array<{ path: string }>]>(
        `SELECT path FROM tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId`,
        { workspaceId, sourceId },
      );
      const existingPaths = (pathResult[0] ?? []).map((r) => r.path);

      if (existingPaths.length > 0) {
        await db.query(
          `DELETE tool_artifact_parameters WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingPaths },
        );
        await db.query(
          `DELETE tool_artifact_request_body_content_types WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingPaths },
        );
        await db.query(
          `DELETE tool_artifact_ref_hint_keys WHERE workspaceId = $workspaceId AND path IN $paths`,
          { workspaceId, paths: existingPaths },
        );
      }

      const deleted = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE tool_artifacts WHERE workspaceId = $workspaceId AND sourceId = $sourceId RETURN BEFORE *`,
        { workspaceId, sourceId },
      );
      const rows = deleted[0] ?? [];
      return rows.length;
    }),
});
