import { describe, expect, it } from "vitest";
import { DocumentId } from "@app/contracts";

import {
  DocumentAction,
  DocumentPhase,
  initialDocumentModel,
  updateDocument,
} from "./document-model";

const document = {
  id: DocumentId.make("draft"),
  title: "Draft",
  content: { type: "doc", content: [{ type: "paragraph" }] } as const,
  revision: 1,
  updatedAt: "2026-08-19T00:00:00.000Z",
};

describe("document model", () => {
  it("reports load, local change, save, and conflict states", () => {
    const loaded = updateDocument(initialDocumentModel(), DocumentAction.LoadedDocument(document));
    expect(loaded.phase).toBe(DocumentPhase.Ready);
    const dirty = updateDocument(loaded, DocumentAction.ChangedDocument());
    expect(dirty.phase).toBe(DocumentPhase.Dirty);
    const saving = updateDocument(dirty, DocumentAction.BeganDocumentSave());
    expect(saving.phase).toBe(DocumentPhase.Saving);
    const conflicted = updateDocument(saving, DocumentAction.ConflictedDocument(document));
    expect(conflicted.phase).toBe(DocumentPhase.Conflicted);
  });
});
