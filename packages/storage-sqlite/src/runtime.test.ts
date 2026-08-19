import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { SaveDocumentOutcomeType } from "@app/domain";
import { createSqliteStorage } from "./runtime";

const migrationsFolder = resolve(process.cwd(), "packages/storage-sqlite/drizzle");
const InitialMigrationHash = "338cdb7c71f9d09b9d1e1b81fa2af0b97eee89752a6a9685d485934e866744db";
const LiteralEnvelopeMigrationHash = "fe03b8a0207176f98408deda7f9a13cc02ad6e06cb7a7bd59ab5307136822690";
const InitialMigrationTime = 1787160267458;
const ContentMigrationTime = 1787161977706;
const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

function createLegacyDatabase(
  storedContent: string,
  state: "BeforeContentMigration" | "LiteralEnvelopeMigration",
): string {
  const directory = mkdtempSync(join(tmpdir(), "speech-edit-migration-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "documents.sqlite");
  const client = new DatabaseSync(path);
  const contentColumn = state === "BeforeContentMigration" ? "html" : "content";
  client.exec(`CREATE TABLE documents (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    ${contentColumn} text NOT NULL,
    revision integer NOT NULL,
    updated_at integer NOT NULL
  )`);
  client.exec(`CREATE TABLE __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
  client.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
    .run(InitialMigrationHash, InitialMigrationTime);
  if (state === "LiteralEnvelopeMigration") {
    client.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(LiteralEnvelopeMigrationHash, ContentMigrationTime);
  }
  client.prepare(`INSERT INTO documents (id, title, ${contentColumn}, revision, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run("draft", "Legacy", storedContent, 3, 0);
  client.close();
  return path;
}

describe("SQLite document repository", () => {
  it("persists revisions and rejects stale writers", async () => {
    const storage = createSqliteStorage({ databasePath: ":memory:", migrationsFolder });
    await Effect.runPromise(storage.migrate);
    await Effect.runPromise(storage.migrate);
    const initial = await Effect.runPromise(storage.repository.read("draft"));
    const saved = await Effect.runPromise(storage.repository.save({
      documentId: initial.id,
      title: initial.title,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Revised" }] }] },
      expectedRevision: initial.revision,
    }));
    expect(saved._tag).toBe(SaveDocumentOutcomeType.Saved);
    const conflicted = await Effect.runPromise(storage.repository.save({
      documentId: initial.id,
      title: initial.title,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Stale" }] }] },
      expectedRevision: initial.revision,
    }));
    expect(conflicted._tag).toBe(SaveDocumentOutcomeType.Conflicted);
    storage.close();
  });

  it("migrates legacy HTML with structure and marks, then remains idempotent", async () => {
    const html = "<h2>Plan</h2><p>Hello <strong>bold</strong>.</p>";
    const path = createLegacyDatabase(html, "BeforeContentMigration");
    const storage = createSqliteStorage({ databasePath: path, migrationsFolder });
    await Effect.runPromise(storage.migrate);
    const first = await Effect.runPromise(storage.repository.read("draft"));
    expect(first.content).toMatchObject({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
        { type: "paragraph", content: [
          { type: "text", text: "Hello " },
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "text", text: "." },
        ] },
      ],
    });
    await Effect.runPromise(storage.migrate);
    expect((await Effect.runPromise(storage.repository.read("draft"))).content).toEqual(first.content);
    storage.close();
  });

  it("repairs databases already upgraded by the literal-HTML envelope migration", async () => {
    const html = "<p>First paragraph.</p><blockquote><p>Quoted <em>text</em>.</p></blockquote>";
    const literalEnvelope = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: html }] }],
    });
    const path = createLegacyDatabase(literalEnvelope, "LiteralEnvelopeMigration");
    const storage = createSqliteStorage({ databasePath: path, migrationsFolder });
    await Effect.runPromise(storage.migrate);
    const content = (await Effect.runPromise(storage.repository.read("draft"))).content;
    expect(content).toMatchObject({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First paragraph." }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [
          { type: "text", text: "Quoted " },
          { type: "text", marks: [{ type: "italic" }], text: "text" },
          { type: "text", text: "." },
        ] }] },
      ],
    });
    await Effect.runPromise(storage.migrate);
    expect((await Effect.runPromise(storage.repository.read("draft"))).content).toEqual(content);
    storage.close();
  });
});
