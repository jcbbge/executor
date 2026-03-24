import {
  type OrganizationMembership,
  OrganizationMembershipSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeOrganizationMembership = Schema.decodeUnknownSync(OrganizationMembershipSchema);

export const createOrganizationMembershipsRepo = (client: SurrealClient) => ({
  listByOrganizationId: (organizationId: OrganizationMembership["organizationId"]) =>
    client.use("rows.organization_memberships.list_by_organization", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organization_memberships WHERE organizationId = $organizationId ORDER BY updatedAt ASC, id ASC`,
        { organizationId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeOrganizationMembership(normalizeId(row)));
    }),

  listByAccountId: (accountId: OrganizationMembership["accountId"]) =>
    client.use("rows.organization_memberships.list_by_account", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organization_memberships WHERE accountId = $accountId ORDER BY updatedAt ASC, id ASC`,
        { accountId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeOrganizationMembership(normalizeId(row)));
    }),

  getByOrganizationAndAccount: (
    organizationId: OrganizationMembership["organizationId"],
    accountId: OrganizationMembership["accountId"],
  ) =>
    client.use("rows.organization_memberships.get_by_organization_and_account", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM organization_memberships WHERE organizationId = $organizationId AND accountId = $accountId LIMIT 1`,
        { organizationId, accountId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeOrganizationMembership(normalizeId(row.value)))
        : Option.none<OrganizationMembership>();
    }),

  upsert: (membership: OrganizationMembership) =>
    client.use("rows.organization_memberships.upsert", async (db) => {
      await db.query(
        `INSERT INTO organization_memberships $content ON DUPLICATE KEY UPDATE id = $content.id, organizationId = $content.organizationId, accountId = $content.accountId, role = $content.role, updatedAt = $content.updatedAt`,
        { content: membership },
      );
    }),

  removeByOrganizationAndAccount: (
    organizationId: OrganizationMembership["organizationId"],
    accountId: OrganizationMembership["accountId"],
  ) =>
    client.use("rows.organization_memberships.remove", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `DELETE organization_memberships WHERE organizationId = $organizationId AND accountId = $accountId RETURN BEFORE`,
        { organizationId, accountId },
      );
      const rows = result[0] ?? [];
      return rows.length > 0;
    }),
});
