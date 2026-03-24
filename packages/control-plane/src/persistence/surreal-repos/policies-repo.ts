import { type Policy, PolicySchema } from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodePolicy = Schema.decodeUnknownSync(PolicySchema);

export const createPoliciesRepo = (client: SurrealClient) => ({
  listByOrganizationId: (organizationId: Policy["organizationId"]) =>
    client.use("rows.policies.list_by_organization", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM policies WHERE organizationId = $organizationId AND scopeType = 'organization' ORDER BY priority DESC, updatedAt ASC`,
        { organizationId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodePolicy(normalizeId(row)));
    }),

  listByWorkspaceId: (workspaceId: Exclude<Policy["workspaceId"], null>) =>
    client.use("rows.policies.list_by_workspace", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM policies WHERE workspaceId = $workspaceId AND scopeType = 'workspace' ORDER BY priority DESC, updatedAt ASC`,
        { workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodePolicy(normalizeId(row)));
    }),

  listForWorkspaceContext: (input: {
    organizationId: Policy["organizationId"];
    workspaceId: Exclude<Policy["workspaceId"], null>;
  }) =>
    client.use("rows.policies.list_for_workspace_context", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM policies WHERE organizationId = $organizationId AND (scopeType = 'organization' OR (scopeType = 'workspace' AND workspaceId = $workspaceId)) ORDER BY priority DESC, updatedAt ASC`,
        { organizationId: input.organizationId, workspaceId: input.workspaceId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodePolicy(normalizeId(row)));
    }),

  getById: (policyId: Policy["id"]) =>
    client.use("rows.policies.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM policies WHERE id = type::thing('policies', $id) LIMIT 1`,
        { id: policyId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodePolicy(normalizeId(row.value)))
        : Option.none<Policy>();
    }),

  insert: (policy: Policy) =>
    client.use("rows.policies.insert", async (db) => {
      await db.query(
        `INSERT INTO policies $content`,
        { content: policy },
      );
    }),

  update: (
    policyId: Policy["id"],
    patch: Partial<Omit<Policy, "id" | "scopeType" | "organizationId" | "workspaceId" | "createdAt">>,
  ) =>
    client.use("rows.policies.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::thing('policies', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id: policyId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodePolicy(normalizeId(row.value)))
        : Option.none<Policy>();
    }),

  removeById: (policyId: Policy["id"]) =>
    client.use("rows.policies.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::thing('policies', $id) RETURN BEFORE *`,
        { id: policyId },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),
});
