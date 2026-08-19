import {
  DocumentId,
  EditorProposalOutcomeType,
  ProposedEditorCommandType,
  type CapturedEditorContext,
} from "@app/contracts";
import {
  SpeechEditCommand,
  SpeechInterpretationOutcome,
  SpeechSelectionMark,
} from "@app/speech-command";
import { describe, expect, it } from "vitest";

import { toCapturedSpeechContext, toWireOutcome } from "./application";

const context: CapturedEditorContext = {
  captureId: "capture-1",
  documentId: DocumentId.make("draft"),
  documentRevision: 3,
  documentContent: { type: "doc", content: [{ type: "paragraph" }] },
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
    const captured = toCapturedSpeechContext(context);
    const result = toWireOutcome(
      SpeechInterpretationOutcome.Proposed({
        proposalId: "proposal-1",
        transcript: "remove bold",
        context: captured.identity,
        summary: "Remove Bold.",
        command: SpeechEditCommand.SetMark(SpeechSelectionMark.Bold, false),
      }),
      context,
    );
    expect(result).toMatchObject({
      _tag: EditorProposalOutcomeType.Proposed,
      context,
      command: { _tag: ProposedEditorCommandType.SetMark, mark: "Bold", enabled: false },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("keeps unsupported instructions typed", () => {
    expect(toWireOutcome(
      SpeechInterpretationOutcome.Unsupported("make it sing", "Unsupported."),
      context,
    )._tag).toBe(EditorProposalOutcomeType.Unsupported);
  });
});
