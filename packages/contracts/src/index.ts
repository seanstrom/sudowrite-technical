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
  captureId: Schema.String,
  documentId: DocumentId,
  documentRevision: Schema.Number,
  target: EditorTarget,
  documentContent: TiptapDocumentContent,
  documentText: Schema.String,
});
export type CapturedEditorContext = typeof CapturedEditorContext.Type;

export const ProposedEditorCommandType = {
  ReplaceSelection: "ReplaceSelection",
  ReplaceText: "ReplaceText",
  InsertText: "InsertText",
  SetMark: "SetMark",
  ReplaceDocument: "ReplaceDocument",
} as const;

export const ReplaceSelectionCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.ReplaceSelection,
  { text: Schema.String },
);
export const ReplaceTextCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.ReplaceText,
  {
    scope: Schema.Literal("Selection", "Document"),
    occurrence: Schema.Literal("First", "All"),
    matchText: Schema.String,
    replacementText: Schema.String,
  },
);
export const InsertTextCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.InsertText,
  {
    text: Schema.String,
    target: Schema.Literal("BeforeSelection", "AfterSelection", "DocumentEnd"),
  },
);
export const SetMarkCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.SetMark,
  { mark: Schema.Literal("Bold", "Italic"), enabled: Schema.Boolean },
);
export const DocumentRewritePreview = Schema.Struct({
  beforeExcerpt: Schema.String,
  afterExcerpt: Schema.String,
  beforeWordCount: Schema.Number,
  afterWordCount: Schema.Number,
  beforeBlockCount: Schema.Number,
  afterBlockCount: Schema.Number,
});
export const ReplaceDocumentCommand = Schema.TaggedStruct(
  ProposedEditorCommandType.ReplaceDocument,
  { content: TiptapDocumentContent, preview: DocumentRewritePreview },
);
export const ProposedEditorCommand = Schema.Union(
  ReplaceSelectionCommand,
  ReplaceTextCommand,
  InsertTextCommand,
  SetMarkCommand,
  ReplaceDocumentCommand,
);
export type ProposedEditorCommand = typeof ProposedEditorCommand.Type;

export const EditorProposalOutcomeType = {
  Proposed: "ProposedEditorCommand",
  Ambiguous: "AmbiguousEditorCommand",
  Unsupported: "UnsupportedEditorCommand",
  Cancelled: "CancelledEditorCommand",
  Failed: "FailedEditorCommand",
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
export const AmbiguousEditorCommandResult = Schema.TaggedStruct(
  EditorProposalOutcomeType.Ambiguous,
  { transcript: Schema.String, reason: Schema.String, clarification: Schema.String },
);
export const CancelledEditorCommandResult = Schema.TaggedStruct(
  EditorProposalOutcomeType.Cancelled,
  { reason: Schema.String },
);
export const FailedEditorCommandResult = Schema.TaggedStruct(
  EditorProposalOutcomeType.Failed,
  { reason: Schema.String },
);
export const EditorProposalOutcome = Schema.Union(
  ProposedEditorCommandResult,
  AmbiguousEditorCommandResult,
  UnsupportedEditorCommandResult,
  CancelledEditorCommandResult,
  FailedEditorCommandResult,
);
export type EditorProposalOutcome = typeof EditorProposalOutcome.Type;

export const ProposeEditorCommand = Rpc.make("ProposeEditorCommand", {
  payload: { transcript: Schema.String, context: CapturedEditorContext },
  success: EditorProposalOutcome,
  error: DocumentUnavailable,
});

export const VoiceAudioMime = Schema.Literal(
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/wav",
);
export const VoiceEditorContextMetadata = Schema.Struct({
  captureId: Schema.String,
  documentId: Schema.String,
  documentFingerprint: Schema.String,
  hasSelection: Schema.Boolean,
  selectionLength: Schema.Number,
});
export const VoiceTranscriptionRequest = Schema.Struct({
  operationId: Schema.String,
  editorContext: VoiceEditorContextMetadata,
  audioBase64: Schema.String,
  mimeType: VoiceAudioMime,
  durationMs: Schema.Number,
  byteLength: Schema.Number,
});
export type VoiceTranscriptionRequest =
  typeof VoiceTranscriptionRequest.Type;

export const VoiceFailureType = {
  InvalidRequest: "InvalidRequest",
  PermissionDenied: "PermissionDenied",
  UnsupportedMime: "UnsupportedMime",
  CaptureFailed: "CaptureFailed",
  AudioTooLarge: "AudioTooLarge",
  DurationExceeded: "DurationExceeded",
  ProviderFailed: "ProviderFailed",
  ProviderTimedOut: "ProviderTimedOut",
  InvalidProviderResponse: "InvalidProviderResponse",
} as const;
export const VoiceFailure = Schema.Struct({
  type: Schema.Literal(...Object.values(VoiceFailureType)),
  operationId: Schema.String,
  captureId: Schema.String,
  message: Schema.String,
  status: Schema.optional(Schema.NullOr(Schema.Number)),
});
export const VoiceTranscriptionResultType = {
  Transcribed: "Transcribed",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
} as const;
export const TranscribedVoice = Schema.Struct({
  type: Schema.Literal(VoiceTranscriptionResultType.Transcribed),
  operationId: Schema.String,
  captureId: Schema.String,
  transcript: Schema.String,
});
export const RejectedVoiceTranscription = Schema.Struct({
  type: Schema.Literal(VoiceTranscriptionResultType.Rejected),
  failure: VoiceFailure,
});
export const CancelledVoiceTranscription = Schema.Struct({
  type: Schema.Literal(VoiceTranscriptionResultType.Cancelled),
  operationId: Schema.String,
  captureId: Schema.String,
});
export const VoiceTranscriptionResult = Schema.Union(
  TranscribedVoice,
  RejectedVoiceTranscription,
  CancelledVoiceTranscription,
);
export type VoiceTranscriptionResult =
  typeof VoiceTranscriptionResult.Type;

export const TranscribeVoice = Rpc.make("TranscribeVoice", {
  payload: { request: VoiceTranscriptionRequest },
  success: VoiceTranscriptionResult,
  error: DocumentUnavailable,
});

export const DocumentRpcs = RpcGroup.make(
  GetDocument,
  SaveDocument,
  ProposeEditorCommand,
  TranscribeVoice,
);
export const DefaultDocumentId = DocumentId.make("draft");
