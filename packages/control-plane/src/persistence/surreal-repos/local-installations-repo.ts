import {
  type LocalInstallation,
  LocalInstallationSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeLocalInstallation = Schema.decodeUnknownSync(LocalInstallationSchema);

export const createLocalInstallationsRepo = (client: SurrealClient) => ({
  getById: (installationId: LocalInstallation["id"]) =>
    client.use("rows.local_installations.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM local_installations WHERE id = type::record('local_installations', $id) LIMIT 1`,
        { id: installationId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeLocalInstallation(normalizeId(row.value)))
        : Option.none<LocalInstallation>();
    }),

  upsert: (installation: LocalInstallation) =>
    client.use("rows.local_installations.upsert", async (db) => {
      await db.query(
        `INSERT INTO local_installations $content ON DUPLICATE KEY UPDATE accountId = $content.accountId, organizationId = $content.organizationId, workspaceId = $content.workspaceId, updatedAt = $content.updatedAt`,
        { content: installation },
      );
    }),
});
