import {
  DocumentId,
  EditorProposalOutcomeType,
  ProposedEditorCommandType,
  type CapturedEditorContext,
} from "@app/contracts";
import { describe, expect, it } from "vitest";

import { proposeEditorCommand } from "./application";

const context: CapturedEditorContext = {
  documentId: DocumentId.make("draft"),
  documentText: "Hello world",
  target: {
    targetId: "1:6:5",
    from: 1,
    to: 6,
    selectedText: "Hello",
    documentFingerprint: "fingerprint",
  },
};

describe("editor command proposal", () => {
  it("returns a serializable, explicit SetMark proposal", () => {
    const result = proposeEditorCommand("remove bold", context);
    expect(result).toMatchObject({
      _tag: EditorProposalOutcomeType.Proposed,
      context,
      command: { _tag: ProposedEditorCommandType.SetMark, mark: "bold", enabled: false },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("keeps unsupported instructions typed", () => {
    expect(proposeEditorCommand("make it sing", context)._tag).toBe(EditorProposalOutcomeType.Unsupported);
  });
});
