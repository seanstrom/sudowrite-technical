import {
  DocumentRepositoryFailure,
  DocumentRepositoryOperation,
  SaveDocumentOutcome,
  type DocumentRecord,
  type DocumentRepositoryPort,
} from "@app/domain";
import {
  parseLegacyHtmlToTiptapContent,
  validateTiptapDocumentContent,
} from "@app/editor";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { eq } from "drizzle-orm";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { Data, Effect } from "effect";

import { dataMigrations, documents } from "./schema";

type Schema = {
  documents: typeof documents;
  dataMigrations: typeof dataMigrations;
};

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
const LegacyLiteralEnvelopeMigrationHash =
  "fe03b8a0207176f98408deda7f9a13cc02ad6e06cb7a7bd59ab5307136822690";
const LegacyContentDataMigrationId = "tiptap-json-legacy-html-v1";
const DefaultContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Your draft" }] },
    { type: "paragraph", content: [{ type: "text", text: "Start writing, then use your voice to revise it." }] },
  ],
} as const;

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
            content: DefaultContent,
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
             SET title = ?, content = ?, revision = ?, updated_at = ?
             WHERE id = ? AND revision = ?`,
          ).run(
            input.title,
            JSON.stringify(input.content),
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
            content: input.content,
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
    try: async () => {
      await migrate(state.database, async (queries) => {
        state.client.exec("BEGIN");
        try {
          queries.forEach((query) => state.client.exec(query));
          state.client.exec("COMMIT");
        } catch (cause) {
          state.client.exec("ROLLBACK");
          throw cause;
        }
      }, { migrationsFolder });
      normalizeLegacyDocumentContent(state);
    },
    catch: (cause) => new SqliteMigrationFailure({ migrationsFolder, cause }),
  });
}

function normalizeLegacyDocumentContent(state: SqliteStorageState): void {
  const alreadyApplied = state.client.prepare(
    "SELECT 1 FROM app_data_migrations WHERE id = ? LIMIT 1",
  ).get(LegacyContentDataMigrationId);
  if (alreadyApplied) return;
  const migrationRows = state.client.prepare(
    "SELECT hash FROM __drizzle_migrations",
  ).all() as unknown as ReadonlyArray<Readonly<{ hash: string }>>;
  const unwrapLiteralEnvelope = migrationRows.some(
    ({ hash }) => hash === LegacyLiteralEnvelopeMigrationHash,
  );
  const rows = state.client.prepare(
    "SELECT id, content FROM documents",
  ).all() as unknown as ReadonlyArray<Readonly<{ id: string; content: string }>>;
  const updates = rows.flatMap(({ id, content }) => {
    const normalized = normalizeLegacyContentValue(content, unwrapLiteralEnvelope);
    return normalized ? [{ id, content: normalized }] : [];
  });
  state.client.exec("BEGIN");
  try {
    const update = state.client.prepare("UPDATE documents SET content = ? WHERE id = ?");
    updates.forEach(({ id, content }) => update.run(JSON.stringify(content), id));
    state.client.prepare(
      "INSERT INTO app_data_migrations (id, applied_at) VALUES (?, ?)",
    ).run(LegacyContentDataMigrationId, Date.now());
    state.client.exec("COMMIT");
  } catch (cause) {
    state.client.exec("ROLLBACK");
    throw cause;
  }
}

function normalizeLegacyContentValue(
  storedContent: string,
  unwrapLiteralEnvelope: boolean,
): ReturnType<typeof validateTiptapDocumentContent> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedContent);
  } catch {
    return parseLegacyHtmlToTiptapContent(storedContent);
  }
  const validated = validateTiptapDocumentContent(parsed);
  if (!unwrapLiteralEnvelope) return undefined;
  const legacyHtml = extractLiteralLegacyHtmlEnvelope(validated);
  if (legacyHtml === undefined) return undefined;
  const normalized = parseLegacyHtmlToTiptapContent(legacyHtml);
  return JSON.stringify(normalized) === JSON.stringify(validated) ? undefined : normalized;
}

function extractLiteralLegacyHtmlEnvelope(
  content: ReturnType<typeof validateTiptapDocumentContent>,
): string | undefined {
  if (content.type !== "doc" || content.content?.length !== 1) return undefined;
  const paragraph = content.content[0];
  if (paragraph?.type !== "paragraph" || paragraph.content?.length !== 1) return undefined;
  const text = paragraph.content[0];
  if (text?.type !== "text" || typeof text.text !== "string" || text.marks?.length) return undefined;
  return text.text;
}

export function closeSqliteStorage(state: SqliteStorageState): void {
  if (state.closed) return;
  state.closed = true;
  state.client.close();
}
