import {
  DocumentId,
  EditorProposalOutcomeType,
  SaveDocumentResult,
  type TiptapDocumentContent,
} from "@app/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentPhase } from "./document-model";
import {
  createDocumentRuntime,
  type DocumentGateway,
  type DraftRecoveryPort,
} from "./runtime";

const documentId = DocumentId.make("draft");
const initialContent = { type: "doc", content: [{ type: "paragraph" }] } as const;

function makeRecovery(): DraftRecoveryPort & { values: Map<string, TiptapDocumentContent> } {
  const values = new Map<string, TiptapDocumentContent>();
  return {
    values,
    read: (id) => values.get(id),
    write: (id, content) => { values.set(id, content); },
    clear: (id) => { values.delete(id); },
  };
}

afterEach(() => vi.useRealTimers());

describe("document runtime", () => {
  it("retains a failed dirty JSON draft and clears it only after retry succeeds", async () => {
    vi.useFakeTimers();
    let shouldFail = true;
    const gateway: DocumentGateway = {
      load: async () => ({ id: documentId, title: "Draft", content: initialContent, revision: 0, updatedAt: new Date(0).toISOString() }),
      save: async (input) => {
        if (shouldFail) throw new Error("offline");
        return SaveDocumentResult.Saved({ ...input, id: input.documentId, revision: 1, updatedAt: new Date(1).toISOString() });
      },
      propose: async ({ transcript }) => ({ _tag: EditorProposalOutcomeType.Unsupported, transcript, reason: "unused" }),
      dispose: async () => undefined,
    };
    const recovery = makeRecovery();
    const runtime = createDocumentRuntime(gateway, documentId, recovery);
    runtime.load();
    await vi.waitFor(() => expect(runtime.store.getState().phase).toBe(DocumentPhase.Ready));
    const changed = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recovered" }] }] } as const;
    runtime.queueSave(changed);
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(runtime.store.getState().phase).toBe(DocumentPhase.Failed));
    expect(recovery.read(documentId)).toEqual(changed);
    expect(runtime.state.pendingContent).toEqual(changed);

    shouldFail = false;
    runtime.retrySave();
    await vi.waitFor(() => expect(runtime.store.getState().phase).toBe(DocumentPhase.Ready));
    expect(recovery.read(documentId)).toBeUndefined();
    await runtime.dispose();
  });

  it("leaves dirty recovery intact when disposed before the debounce fires", async () => {
    vi.useFakeTimers();
    const gateway: DocumentGateway = {
      load: async () => ({ id: documentId, title: "Draft", content: initialContent, revision: 0, updatedAt: new Date(0).toISOString() }),
      save: async () => { throw new Error("must not save"); },
      propose: async ({ transcript }) => ({ _tag: EditorProposalOutcomeType.Unsupported, transcript, reason: "unused" }),
      dispose: async () => undefined,
    };
    const recovery = makeRecovery();
    const runtime = createDocumentRuntime(gateway, documentId, recovery);
    const changed = { type: "doc", content: [{ type: "paragraph" }] } as const;
    runtime.queueSave(changed);
    await runtime.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(recovery.read(documentId)).toEqual(changed);
  });
});
