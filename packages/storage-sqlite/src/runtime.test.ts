import { resolve } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { SaveDocumentOutcomeType } from "@app/domain";
import { createSqliteStorage } from "./runtime";

const migrationsFolder = resolve(process.cwd(), "packages/storage-sqlite/drizzle");

describe("SQLite document repository", () => {
  it("persists revisions and rejects stale writers", async () => {
    const storage = createSqliteStorage({ databasePath: ":memory:", migrationsFolder });
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
});
