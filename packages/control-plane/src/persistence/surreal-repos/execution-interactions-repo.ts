import {
  type ExecutionInteraction,
  ExecutionInteractionSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeExecutionInteraction = Schema.decodeUnknownSync(ExecutionInteractionSchema);

export const createExecutionInteractionsRepo = (client: SurrealClient) => ({
  getById: (interactionId: ExecutionInteraction["id"]) =>
    client.use("rows.execution_interactions.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM execution_interactions WHERE id = type::record('execution_interactions', $id) LIMIT 1`,
        { id: interactionId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecutionInteraction(normalizeId(row.value)))
        : Option.none<ExecutionInteraction>();
    }),

  listByExecutionId: (executionId: ExecutionInteraction["executionId"]) =>
    client.use("rows.execution_interactions.list_by_execution_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM execution_interactions WHERE executionId = $executionId ORDER BY updatedAt DESC, id DESC`,
        { executionId },
      );
      const rows = result[0] ?? [];
      return rows.map((row) => decodeExecutionInteraction(normalizeId(row)));
    }),

  getPendingByExecutionId: (executionId: ExecutionInteraction["executionId"]) =>
    client.use("rows.execution_interactions.get_pending_by_execution_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM execution_interactions WHERE executionId = $executionId AND status = 'pending' ORDER BY updatedAt DESC, id DESC LIMIT 1`,
        { executionId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecutionInteraction(normalizeId(row.value)))
        : Option.none<ExecutionInteraction>();
    }),

  insert: (interaction: ExecutionInteraction) =>
    client.use("rows.execution_interactions.insert", async (db) => {
      await db.query(
        `INSERT INTO execution_interactions $content`,
        { content: interaction },
      );
    }),

  update: (
    interactionId: ExecutionInteraction["id"],
    patch: Partial<Omit<ExecutionInteraction, "id" | "executionId" | "createdAt">>,
  ) =>
    client.use("rows.execution_interactions.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::record('execution_interactions', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id: interactionId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecutionInteraction(normalizeId(row.value)))
        : Option.none<ExecutionInteraction>();
    }),
});
