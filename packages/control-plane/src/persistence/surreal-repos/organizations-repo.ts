import {
  type Organization,
  type OrganizationMembership,
  OrganizationMembershipSchema,
  OrganizationSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import {
  firstOption,
  normalizeId,
  normalizeIds,
  postgresSecretHandlesFromCredentials,
} from "./shared";

const decodeOrganization = Schema.decodeUnknownSync(OrganizationSchema);
const decodeOrganizationMembership = Schema.decodeUnknownSync(OrganizationMembershipSchema);

export const createOrganizationsRepo = (client: SurrealClient) => ({
  list: () =>
    client.use("rows.organizations.list", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organizations ORDER BY updatedAt ASC, id ASC`,
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeOrganization(normalizeId(row)));
    }),

  getById: (organizationId: Organization["id"]) =>
    client.use("rows.organizations.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organizations WHERE id = type::thing('organizations', $id) LIMIT 1`,
        { id: organizationId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeOrganization(normalizeId(row.value)))
        : Option.none<Organization>();
    }),

  getBySlug: (slug: Organization["slug"]) =>
    client.use("rows.organizations.get_by_slug", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organizations WHERE slug = $slug LIMIT 1`,
        { slug },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeOrganization(normalizeId(row.value)))
        : Option.none<Organization>();
    }),

  insert: (organization: Organization) =>
    client.use("rows.organizations.insert", async (db) => {
      await db.query(
        `INSERT INTO organizations $content`,
        { content: organization },
      );
    }),

  insertWithOwnerMembership: (
    organization: Organization,
    ownerMembership: OrganizationMembership | null,
  ) =>
    client.useTx("rows.organizations.insert_with_owner_membership", async (db) => {
      await db.query(
        `INSERT INTO organizations $content`,
        { content: organization },
      );

      if (ownerMembership !== null) {
        const decoded = decodeOrganizationMembership(ownerMembership);
        await db.query(
          `INSERT INTO organization_memberships $content ON DUPLICATE KEY UPDATE id = $content.id, organizationId = $content.organizationId, accountId = $content.accountId, role = $content.role, updatedAt = $content.updatedAt`,
          { content: decoded },
        );
      }
    }),

  update: (
    organizationId: Organization["id"],
    patch: Partial<Omit<Organization, "id" | "createdAt">>,
  ) =>
    client.use("rows.organizations.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::thing('organizations', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id: organizationId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeOrganization(normalizeId(row.value)))
        : Option.none<Organization>();
    }),

  removeById: (organizationId: Organization["id"]) =>
    client.use("rows.organizations.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::thing('organizations', $id) RETURN BEFORE *`,
        { id: organizationId },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),

  removeTreeById: (organizationId: Organization["id"]) =>
    client.useTx("rows.organizations.remove_tree", async (db) => {
      // Get workspace IDs
      const wsResult = await db.query<[Array<{ id: unknown }>]>(
        `SELECT meta::id(id) AS id FROM workspaces WHERE organizationId = $orgId`,
        { orgId: organizationId },
      );
      const workspaceRows = wsResult[0] ?? [];
      const workspaceIds = workspaceRows.map((r) => String(r.id));

      if (workspaceIds.length > 0) {
        // Get execution IDs
        const execResult = await db.query<[Array<{ id: unknown }>]>(
          `SELECT meta::id(id) AS id FROM executions WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );
        const executionIds = (execResult[0] ?? []).map((r) => String(r.id));

        // Get credentials for postgres secret handles
        const credResult = await db.query<[Array<Record<string, unknown>>]>(
          `SELECT tokenProviderId, tokenHandle, refreshTokenProviderId, refreshTokenHandle FROM credentials WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
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
          `DELETE executions WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE source_auth_sessions WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE source_credential_bindings WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE credentials WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE sources WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE policies WHERE workspaceId IN $workspaceIds`,
          { workspaceIds },
        );

        await db.query(
          `DELETE workspaces WHERE id IN $workspaceIds`,
          { workspaceIds },
        );

        if (postgresSecretHandles.length > 0) {
          await db.query(
            `DELETE secret_materials WHERE id IN $secretIds`,
            { secretIds: postgresSecretHandles },
          );
        }
      }

      await db.query(
        `DELETE local_installations WHERE organizationId = $orgId`,
        { orgId: organizationId },
      );

      await db.query(
        `DELETE organization_memberships WHERE organizationId = $orgId`,
        { orgId: organizationId },
      );

      await db.query(
        `DELETE policies WHERE organizationId = $orgId`,
        { orgId: organizationId },
      );

      const deleted = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE type::thing('organizations', $id) RETURN BEFORE *`,
        { id: organizationId },
      );
      const rows = deleted[0] ?? [];
      return rows.length > 0;
    }),
});
