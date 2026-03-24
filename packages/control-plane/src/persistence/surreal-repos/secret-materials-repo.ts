import {
  type SecretMaterial,
  SecretMaterialSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId, withoutCreatedAt } from "./shared";

const decodeSecretMaterial = Schema.decodeUnknownSync(SecretMaterialSchema);

export const createSecretMaterialsRepo = (client: SurrealClient) => ({
  getById: (id: SecretMaterial["id"]) =>
    client.use("rows.secret_materials.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM secret_materials WHERE id = type::thing('secret_materials', $id) LIMIT 1`,
        { id },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeSecretMaterial(normalizeId(row.value)))
        : Option.none<SecretMaterial>();
    }),

  listAll: () =>
    client.use("rows.secret_materials.list_all", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT meta::id(id) AS id, name, purpose, createdAt, updatedAt FROM secret_materials ORDER BY updatedAt DESC`,
      );
      const rows = result[0] ?? [];
      return rows.map((row) => normalizeId(row)) as Array<{
        id: string;
        name: string | null;
        purpose: string;
        createdAt: number;
        updatedAt: number;
      }>;
    }),

  upsert: (material: SecretMaterial) =>
    client.use("rows.secret_materials.upsert", async (db) => {
      await db.query(
        `INSERT INTO secret_materials $content ON DUPLICATE KEY UPDATE name = $content.name, purpose = $content.purpose, value = $content.value, updatedAt = $content.updatedAt`,
        { content: material },
      );
    }),

  updateById: (id: SecretMaterial["id"], update: { name?: string | null; value?: string }) =>
    client.use("rows.secret_materials.update_by_id", async (db) => {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (update.name !== undefined) patch.name = update.name;
      if (update.value !== undefined) patch.value = update.value;

      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::thing('secret_materials', $id) MERGE $patch RETURN meta::id(id) AS id, name, purpose, createdAt, updatedAt`,
        { id, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(normalizeId(row.value) as { id: string; name: string | null; purpose: string; createdAt: number; updatedAt: number })
        : Option.none();
    }),

  removeById: (id: SecretMaterial["id"]) =>
    client.use("rows.secret_materials.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::thing('secret_materials', $id) RETURN BEFORE *`,
        { id },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),

  /**
   * For each secret, find the sources that reference it via credentials.
   * Returns a map of secretId -> Array<{ sourceId, sourceName }>.
   */
  listLinkedSources: () =>
    client.use("rows.secret_materials.list_linked_sources", async (db) => {
      // Query credentials that use postgres provider
      const credResult = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT meta::id(id) AS id, workspaceId, tokenProviderId, tokenHandle, refreshTokenProviderId, refreshTokenHandle FROM credentials WHERE tokenProviderId = 'postgres' OR refreshTokenProviderId = 'postgres'`,
      );
      const credentials = (credResult[0] ?? []).map(normalizeId) as Array<{
        id: string;
        workspaceId: string;
        tokenProviderId: string;
        tokenHandle: string;
        refreshTokenProviderId: string | null;
        refreshTokenHandle: string | null;
      }>;

      if (credentials.length === 0) {
        return new Map<string, Array<{ sourceId: string; sourceName: string }>>();
      }

      const credentialIds = credentials.map((c) => c.id);

      // Query bindings for those credentials
      const bindingResult = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT meta::id(id) AS id, workspaceId, sourceId, credentialId FROM source_credential_bindings WHERE credentialId IN $credentialIds`,
        { credentialIds },
      );
      const bindings = (bindingResult[0] ?? []).map(normalizeId) as Array<{
        id: string;
        workspaceId: string;
        sourceId: string;
        credentialId: string;
      }>;

      if (bindings.length === 0) {
        return new Map<string, Array<{ sourceId: string; sourceName: string }>>();
      }

      // Collect unique (workspaceId, sourceId) pairs
      const sourceKeys = [...new Set(bindings.map((b) => `${b.workspaceId}:${b.sourceId}`))];
      const workspaceIds = [...new Set(bindings.map((b) => b.workspaceId))];
      const sourceIds = [...new Set(bindings.map((b) => b.sourceId))];

      // Query sources
      const sourceResult = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT workspaceId, sourceId, name FROM sources WHERE workspaceId IN $workspaceIds AND sourceId IN $sourceIds`,
        { workspaceIds, sourceIds },
      );
      const sources = (sourceResult[0] ?? []) as Array<{
        workspaceId: string;
        sourceId: string;
        name: string;
      }>;

      // Build lookup
      const sourceNameMap = new Map<string, string>();
      for (const s of sources) {
        sourceNameMap.set(`${s.workspaceId}:${s.sourceId}`, s.name);
      }

      // Build credential → bindings map
      const credentialBindings = new Map<string, Array<{ sourceId: string; sourceName: string }>>();
      for (const binding of bindings) {
        let links = credentialBindings.get(binding.credentialId);
        if (!links) {
          links = [];
          credentialBindings.set(binding.credentialId, links);
        }
        const name = sourceNameMap.get(`${binding.workspaceId}:${binding.sourceId}`) ?? binding.sourceId;
        if (!links.some((l) => l.sourceId === binding.sourceId)) {
          links.push({ sourceId: binding.sourceId, sourceName: name });
        }
      }

      // Build result map: secretId → sources
      const result = new Map<string, Array<{ sourceId: string; sourceName: string }>>();

      const addLink = (secretId: string, links: Array<{ sourceId: string; sourceName: string }>) => {
        let existing = result.get(secretId);
        if (!existing) {
          existing = [];
          result.set(secretId, existing);
        }
        for (const link of links) {
          if (!existing.some((l) => l.sourceId === link.sourceId)) {
            existing.push(link);
          }
        }
      };

      for (const cred of credentials) {
        const links = credentialBindings.get(cred.id) ?? [];
        if (cred.tokenProviderId === "postgres") {
          addLink(cred.tokenHandle, links);
        }
        if (cred.refreshTokenProviderId === "postgres" && cred.refreshTokenHandle) {
          addLink(cred.refreshTokenHandle, links);
        }
      }

      return result;
    }),
});
