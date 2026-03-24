import * as Option from "effect/Option";
import { RecordId } from "surrealdb";

export const firstOption = <A>(rows: ReadonlyArray<A>): Option.Option<A> =>
  rows.length > 0 ? Option.some(rows[0] as A) : Option.none<A>();

export const normalizeId = (row: Record<string, unknown>): Record<string, unknown> => {
  if (!('id' in row)) return row;
  const id = row.id;
  if (id instanceof RecordId) {
    const raw = id.id;
    return { ...row, id: typeof raw === 'string' ? raw : String(raw) };
  }
  return row;
};

export const normalizeIds = (rows: ReadonlyArray<Record<string, unknown>>): ReadonlyArray<Record<string, unknown>> =>
  rows.map(normalizeId);

export const withoutCreatedAt = <A extends { createdAt: unknown }>(
  value: A,
): Omit<A, "createdAt"> => {
  const { createdAt: _createdAt, ...rest } = value;
  return rest;
};

const POSTGRES_SECRET_PROVIDER_ID = "postgres";

export const postgresSecretHandlesFromCredentials = (
  credentials: ReadonlyArray<{
    tokenProviderId: string;
    tokenHandle: string;
    refreshTokenProviderId: string | null;
    refreshTokenHandle: string | null;
  }>,
): ReadonlyArray<string> => {
  const handles = new Set<string>();

  for (const credential of credentials) {
    if (credential.tokenProviderId === POSTGRES_SECRET_PROVIDER_ID) {
      handles.add(credential.tokenHandle);
    }

    if (
      credential.refreshTokenProviderId === POSTGRES_SECRET_PROVIDER_ID
      && credential.refreshTokenHandle !== null
    ) {
      handles.add(credential.refreshTokenHandle);
    }
  }

  return [...handles];
};
