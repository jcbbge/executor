import {
  type SourceAuthSession,
  SourceAuthSessionSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeSourceAuthSession = Schema.decodeUnknownSync(SourceAuthSessionSchema);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type SourceAuthSessionPatch = Partial<
  Omit<Mutable<SourceAuthSession>, "id" | "workspaceId" | "sourceId" | "createdAt">
>;

export const createSourceAuthSessionsRepo = (client: SurrealClient) => ({
  listByWorkspaceId: (workspaceId: SourceAuthSession["workspaceId"]) =>
    client.use("rows.source_auth_sessions.list_by_workspace", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_auth_sessions WHERE workspaceId = $workspaceId ORDER BY updatedAt ASC, id ASC`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeSourceAuthSession(normalizeId(row)));
    }),

  getById: (id: SourceAuthSession["id"]) =>
    client.use("rows.source_auth_sessions.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_auth_sessions WHERE id = type::record('source_auth_sessions', $id) LIMIT 1`,
        { id },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSourceAuthSession(normalizeId(row.value)))
        : Option.none<SourceAuthSession>();
    }),

  getByState: (state: SourceAuthSession["state"]) =>
    client.use("rows.source_auth_sessions.get_by_state", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_auth_sessions WHERE state = $state LIMIT 1`,
        { state },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSourceAuthSession(normalizeId(row.value)))
        : Option.none<SourceAuthSession>();
    }),

  getPendingByWorkspaceAndSourceId: (
    workspaceId: SourceAuthSession["workspaceId"],
    sourceId: SourceAuthSession["sourceId"],
  ) =>
    client.use("rows.source_auth_sessions.get_pending_by_workspace_and_source_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM source_auth_sessions WHERE workspaceId = $workspaceId AND sourceId = $sourceId AND status = 'pending' ORDER BY updatedAt ASC, id ASC LIMIT 1`,
        { workspaceId, sourceId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSourceAuthSession(normalizeId(row.value)))
        : Option.none<SourceAuthSession>();
    }),

  insert: (session: SourceAuthSession) =>
    client.use("rows.source_auth_sessions.insert", async (db) => {
      await db.query(
        `INSERT INTO source_auth_sessions $content`,
        { content: session },
      );
    }),

  update: (
    id: SourceAuthSession["id"],
    patch: SourceAuthSessionPatch,
  ) =>
    client.use("rows.source_auth_sessions.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::record('source_auth_sessions', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSourceAuthSession(normalizeId(row.value)))
        : Option.none<SourceAuthSession>();
    }),

  upsert: (session: SourceAuthSession) =>
    client.use("rows.source_auth_sessions.upsert", async (db) => {
      await db.query(
        `INSERT INTO source_auth_sessions $content ON DUPLICATE KEY UPDATE workspaceId = $content.workspaceId, sourceId = $content.sourceId, executionId = $content.executionId, interactionId = $content.interactionId, strategy = $content.strategy, status = $content.status, endpoint = $content.endpoint, state = $content.state, redirectUri = $content.redirectUri, scope = $content.scope, resourceMetadataUrl = $content.resourceMetadataUrl, authorizationServerUrl = $content.authorizationServerUrl, resourceMetadataJson = $content.resourceMetadataJson, authorizationServerMetadataJson = $content.authorizationServerMetadataJson, clientInformationJson = $content.clientInformationJson, codeVerifier = $content.codeVerifier, authorizationUrl = $content.authorizationUrl, errorText = $content.errorText, completedAt = $content.completedAt, updatedAt = $content.updatedAt`,
        { content: session },
      );
    }),

  removeByWorkspaceAndSourceId: (
    workspaceId: SourceAuthSession["workspaceId"],
    sourceId: SourceAuthSession["sourceId"],
  ) =>
    client.use("rows.source_auth_sessions.remove_by_workspace_and_source_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE source_auth_sessions WHERE workspaceId = $workspaceId AND sourceId = $sourceId RETURN BEFORE`,
        { workspaceId, sourceId },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),
});
