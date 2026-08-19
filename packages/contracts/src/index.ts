import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

export const DocumentId = Schema.String.pipe(Schema.brand("DocumentId"));
export type DocumentId = typeof DocumentId.Type;

export const TiptapDocumentContent = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.optional(Schema.Array(Schema.Unknown)),
});
export type TiptapDocumentContent = typeof TiptapDocumentContent.Type;

export const DocumentSnapshot = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  content: TiptapDocumentContent,
  revision: Schema.Number,
  updatedAt: Schema.String,
});
export type DocumentSnapshot = typeof DocumentSnapshot.Type;

export const SaveDocumentResultType = {
  Saved: "SavedDocument",
  Conflicted: "ConflictedDocument",
} as const;

export const SavedDocument = Schema.TaggedStruct(
  SaveDocumentResultType.Saved,
  { document: DocumentSnapshot },
);
export const ConflictedDocument = Schema.TaggedStruct(
  SaveDocumentResultType.Conflicted,
  { current: DocumentSnapshot },
);
export const SaveDocumentResultSchema = Schema.Union(
  SavedDocument,
  ConflictedDocument,
);

export const SaveDocumentResult = {
  Saved: (document: DocumentSnapshot) => ({
    _tag: SaveDocumentResultType.Saved,
    document,
  }) as const,
  Conflicted: (current: DocumentSnapshot) => ({
    _tag: SaveDocumentResultType.Conflicted,
    current,
  }) as const,
};
export type SaveDocumentResult = ReturnType<
  (typeof SaveDocumentResult)[keyof typeof SaveDocumentResult]
>;

export class DocumentUnavailable extends Schema.TaggedError<DocumentUnavailable>()(
  "DocumentUnavailable",
  { message: Schema.String },
) {}

export const GetDocument = Rpc.make("GetDocument", {
  payload: { documentId: DocumentId },
  success: DocumentSnapshot,
  error: DocumentUnavailable,
});

export const SaveDocument = Rpc.make("SaveDocument", {
  payload: {
    documentId: DocumentId,
    title: Schema.String,
    content: TiptapDocumentContent,
    expectedRevision: Schema.Number,
  },
  success: SaveDocumentResultSchema,
  error: DocumentUnavailable,
});

export const EditorMark = Schema.Literal("bold", "italic");
export const EditorTarget = Schema.Struct({
  targetId: Schema.String,
  from: Schema.Number,
  to: Schema.Number,
  selectedText: Schema.String,
  documentFingerprint: Schema.String,
});
export const CapturedEditorContext = Schema.Struct({
  documentId: DocumentId,
  target: EditorTarget,
  documentText: Schema.String,
});
export type CapturedEditorContext = typeof CapturedEditorContext.Type;

export const ProposedEditorCommandType = {
  ReplaceSelection: "ReplaceSelection",
  ReplaceAll: "ReplaceAll",
  InsertText: "InsertText",
  SetMark: "SetMark",
} as const;

export const ReplaceSelectionCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.ReplaceSelection,
  { text: Schema.String },
);
export const ReplaceAllCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.ReplaceAll,
  { search: Schema.String, replacement: Schema.String },
);
export const InsertTextCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.InsertText,
  { text: Schema.String, at: Schema.Literal("Before", "After") },
);
export const SetMarkCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.SetMark,
  { mark: EditorMark, enabled: Schema.Boolean },
);
export const ProposedEditorCommand = Schema.Union(
  ReplaceSelectionCommand,
  ReplaceAllCommand,
  InsertTextCommand,
  SetMarkCommand,
);
export type ProposedEditorCommand = typeof ProposedEditorCommand.Type;

export const EditorProposalOutcomeType = {
  Proposed: "ProposedEditorCommand",
  Unsupported: "UnsupportedEditorCommand",
} as const;
export const ProposedEditorCommandResult = Schema.TaggedStruct(
  EditorProposalOutcomeType.Proposed,
  {
    proposalId: Schema.String,
    transcript: Schema.String,
    summary: Schema.String,
    context: CapturedEditorContext,
    command: ProposedEditorCommand,
  },
);
export const UnsupportedEditorCommandResult = Schema.TaggedStruct(
  EditorProposalOutcomeType.Unsupported,
  { transcript: Schema.String, reason: Schema.String },
);
export const EditorProposalOutcome = Schema.Union(
  ProposedEditorCommandResult,
  UnsupportedEditorCommandResult,
);
export type EditorProposalOutcome = typeof EditorProposalOutcome.Type;

export const ProposeEditorCommand = Rpc.make("ProposeEditorCommand", {
  payload: { transcript: Schema.String, context: CapturedEditorContext },
  success: EditorProposalOutcome,
  error: DocumentUnavailable,
});

export const DocumentRpcs = RpcGroup.make(GetDocument, SaveDocument, ProposeEditorCommand);
export const DefaultDocumentId = DocumentId.make("draft");
