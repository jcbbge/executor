import { type Account, AccountSchema } from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";

import type { SurrealClient } from "../surreal-client";
import { firstOption, normalizeId } from "./shared";

const decodeAccount = Schema.decodeUnknownSync(AccountSchema);

export const createAccountsRepo = (client: SurrealClient) => ({
  getById: (accountId: Account["id"]) =>
    client.use("rows.accounts.get_by_id", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM accounts WHERE id = type::thing('accounts', $id) LIMIT 1`,
        { id: accountId },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeAccount(normalizeId(row.value)))
        : Option.none<Account>();
    }),

  getByProviderAndSubject: (
    provider: Account["provider"],
    subject: Account["subject"],
  ) =>
    client.use("rows.accounts.get_by_provider_and_subject", async (db) => {
      const result = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT *, meta::id(id) AS id FROM accounts WHERE provider = $provider AND subject = $subject LIMIT 1`,
        { provider, subject },
      );
      const rows = result[0] ?? [];
      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeAccount(normalizeId(row.value)))
        : Option.none<Account>();
    }),

  insert: (account: Account) =>
    client.use("rows.accounts.insert", async (db) => {
      await db.query(
        `INSERT INTO accounts $content`,
        { content: account },
      );
    }),

  upsert: (account: Account) =>
    client.use("rows.accounts.upsert", async (db) => {
      await db.query(
        `INSERT INTO accounts $content ON DUPLICATE KEY UPDATE email = $content.email, displayName = $content.displayName, updatedAt = $content.updatedAt`,
        { content: account },
      );
    }),
});
