import * as Effect from "effect/Effect";
import { Surreal } from "surrealdb";
import { toPersistenceError, type ControlPlanePersistenceError } from "./persistence-errors";

export type SurrealClient = {
  use: <A>(operation: string, run: (db: Surreal) => Promise<A>) => Effect.Effect<A, ControlPlanePersistenceError>;
  useTx: <A>(operation: string, run: (db: Surreal) => Promise<A>) => Effect.Effect<A, ControlPlanePersistenceError>;
};

export const createSurrealClient = (db: Surreal): SurrealClient => {
  // Serialize useTx calls to prevent overlapping transactions
  let queue = Promise.resolve<void>(undefined);

  const use = <A>(operation: string, run: (db: Surreal) => Promise<A>): Effect.Effect<A, ControlPlanePersistenceError> =>
    Effect.tryPromise({
      try: () => run(db),
      catch: (cause) => toPersistenceError(operation, cause),
    });

  const useTx = <A>(operation: string, run: (db: Surreal) => Promise<A>): Effect.Effect<A, ControlPlanePersistenceError> => {
    const next = queue.then(async () => {
      await db.query("BEGIN TRANSACTION");
      try {
        const result = await run(db);
        await db.query("COMMIT TRANSACTION");
        return result;
      } catch (e) {
        try { await db.query("CANCEL TRANSACTION"); } catch {}
        throw e;
      }
    });
    queue = next.then(() => undefined, () => undefined);
    return Effect.tryPromise({
      try: () => next,
      catch: (cause) => toPersistenceError(operation, cause),
    });
  };

  return { use, useTx };
};

export const connectSurrealDb = async (url: string): Promise<Surreal> => {
  const db = new Surreal();
  await db.connect(url);
  await db.signin({ username: "root", password: "root" });
  await db.use({ namespace: "stack", database: "catalog" });
  return db;
};
