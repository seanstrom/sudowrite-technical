import {
  DocumentRepositoryFailure,
  DocumentRepositoryOperation,
  SaveDocumentOutcome,
  type DocumentRecord,
  type DocumentRepositoryPort,
} from "@app/domain";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { eq } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { Data, Effect } from "effect";

import { documents } from "./schema";

type Schema = { documents: typeof documents };

export type SqliteStorageState = {
  client: DatabaseSync;
  database: SqliteRemoteDatabase<Schema>;
  closed: boolean;
};

export type SqliteStorageRuntime = Readonly<{
  state: SqliteStorageState;
  repository: DocumentRepositoryPort;
  migrate: Effect.Effect<void, SqliteMigrationFailure>;
  close: () => void;
}>;

export class SqliteMigrationFailure extends Data.TaggedError(
  "SqliteMigrationFailure",
)<Readonly<{ migrationsFolder: string; cause: unknown }>> {}

export type CreateSqliteStorageOptions = Readonly<{
  databasePath: string;
  migrationsFolder?: string;
}>;

const DefaultMigrationsFolder = resolve(process.cwd(), "packages/storage-sqlite/drizzle");
const DefaultHtml = "<h1>Your draft</h1><p>Start writing, then use your voice to revise it.</p>";

export function createSqliteStorage(options: CreateSqliteStorageOptions): SqliteStorageRuntime {
  if (options.databasePath !== ":memory:") {
    mkdirSync(dirname(options.databasePath), { recursive: true });
  }
  const client = new DatabaseSync(options.databasePath);
  client.exec("PRAGMA foreign_keys = ON");
  const database = createDrizzleDatabase(client);
  const state: SqliteStorageState = { client, database, closed: false };
  const migrationsFolder = options.migrationsFolder ?? DefaultMigrationsFolder;
  return {
    state,
    repository: makeDocumentRepository(state),
    migrate: migrateStorage(state, migrationsFolder),
    close: () => closeSqliteStorage(state),
  };
}

function createDrizzleDatabase(client: DatabaseSync): SqliteRemoteDatabase<Schema> {
  return drizzle<Schema>(async (query, params, method) => {
    const statement = client.prepare(query);
    const values = params as SQLInputValue[];
    switch (method) {
      case "run":
        statement.run(...values);
        return { rows: [] };
      case "all":
      case "values":
        return { rows: statement.all(...values).map(Object.values) as unknown[][] };
      case "get": {
        const row = statement.get(...values);
        return { rows: row ? Object.values(row) : [] };
      }
      default:
        method satisfies never;
        return { rows: [] };
    }
  });
}

const toDocumentRecord = (row: typeof documents.$inferSelect): DocumentRecord => ({
  ...row,
  updatedAt: new Date(row.updatedAt),
});

function makeDocumentRepository(state: SqliteStorageState): DocumentRepositoryPort {
  return {
    read: (documentId) =>
      Effect.tryPromise({
        try: async () => {
          const [existing] = await state.database.select().from(documents)
            .where(eq(documents.id, documentId)).limit(1);
          if (existing) return toDocumentRecord(existing);
          const now = new Date();
          const created: DocumentRecord = {
            id: documentId,
            title: "Voice draft",
            html: DefaultHtml,
            revision: 0,
            updatedAt: now,
          };
          await state.database.insert(documents).values(created);
          return created;
        },
        catch: (cause) => new DocumentRepositoryFailure({
          operation: DocumentRepositoryOperation.Read,
          documentId,
          cause,
        }),
      }),
    save: (input) =>
      Effect.tryPromise({
        try: async () => {
          const [current] = await state.database.select().from(documents)
            .where(eq(documents.id, input.documentId)).limit(1);
          if (!current) {
            throw new Error("Document disappeared while saving.");
          }
          if (current.revision !== input.expectedRevision) {
            return SaveDocumentOutcome.Conflicted(toDocumentRecord(current));
          }
          const now = new Date();
          const result = state.client.prepare(
            `UPDATE documents
             SET title = ?, html = ?, revision = ?, updated_at = ?
             WHERE id = ? AND revision = ?`,
          ).run(
            input.title,
            input.html,
            input.expectedRevision + 1,
            now.getTime(),
            input.documentId,
            input.expectedRevision,
          );
          if (result.changes === 0) {
            const [latest] = await state.database.select().from(documents)
              .where(eq(documents.id, input.documentId)).limit(1);
            if (!latest) throw new Error("Document disappeared while saving.");
            return SaveDocumentOutcome.Conflicted(toDocumentRecord(latest));
          }
          return SaveDocumentOutcome.Saved({
            id: input.documentId,
            title: input.title,
            html: input.html,
            revision: input.expectedRevision + 1,
            updatedAt: now,
          });
        },
        catch: (cause) => new DocumentRepositoryFailure({
          operation: DocumentRepositoryOperation.Save,
          documentId: input.documentId,
          cause,
        }),
      }),
  };
}

function migrateStorage(
  state: SqliteStorageState,
  migrationsFolder: string,
): Effect.Effect<void, SqliteMigrationFailure> {
  return Effect.tryPromise({
    try: () => migrate(state.database, async (queries) => {
      state.client.exec("BEGIN");
      try {
        queries.forEach((query) => state.client.exec(query));
        state.client.exec("COMMIT");
      } catch (cause) {
        state.client.exec("ROLLBACK");
        throw cause;
      }
    }, { migrationsFolder }),
    catch: (cause) => new SqliteMigrationFailure({ migrationsFolder, cause }),
  });
}

export function closeSqliteStorage(state: SqliteStorageState): void {
  if (state.closed) return;
  state.closed = true;
  state.client.close();
}
