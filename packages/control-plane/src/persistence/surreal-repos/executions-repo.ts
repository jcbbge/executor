import { type Execution, ExecutionSchema } from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeExecution = Schema.decodeUnknownSync(ExecutionSchema);

export const createExecutionsRepo = (client: SurrealClient) => ({
  getById: (executionId: Execution["id"]) =>
    client.use("rows.executions.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM executions WHERE id = type::record('executions', $id) LIMIT 1`,
        { id: executionId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecution(normalizeId(row.value)))
        : Option.none<Execution>();
    }),

  getByWorkspaceAndId: (
    workspaceId: Execution["workspaceId"],
    executionId: Execution["id"],
  ) =>
    client.use("rows.executions.get_by_workspace_and_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM executions WHERE workspaceId = $workspaceId AND id = type::record('executions', $id) LIMIT 1`,
        { workspaceId, id: executionId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecution(normalizeId(row.value)))
        : Option.none<Execution>();
    }),

  insert: (execution: Execution) =>
    client.use("rows.executions.insert", async (db) => {
      await db.query(
        `INSERT INTO executions $content`,
        { content: execution },
      );
    }),

  update: (
    executionId: Execution["id"],
    patch: Partial<Omit<Execution, "id" | "workspaceId" | "createdByAccountId" | "createdAt">>,
  ) =>
    client.use("rows.executions.update", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE type::record('executions', $id) MERGE $patch RETURN *, meta::id(id) AS id`,
        { id: executionId, patch },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeExecution(normalizeId(row.value)))
        : Option.none<Execution>();
    }),
});
