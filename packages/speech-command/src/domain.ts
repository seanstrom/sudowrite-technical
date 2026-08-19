export const SpeechTextScope = {
  Selection: "Selection",
  Document: "Document",
} as const;

export type SpeechTextScope =
  (typeof SpeechTextScope)[keyof typeof SpeechTextScope];

export const SpeechInsertionTarget = {
  BeforeSelection: "BeforeSelection",
  AfterSelection: "AfterSelection",
  DocumentEnd: "DocumentEnd",
} as const;

export type SpeechInsertionTarget =
  (typeof SpeechInsertionTarget)[keyof typeof SpeechInsertionTarget];

export const SpeechTextOccurrence = {
  First: "First",
  All: "All",
} as const;

export type SpeechTextOccurrence =
  (typeof SpeechTextOccurrence)[keyof typeof SpeechTextOccurrence];

export const SpeechSelectionMark = {
  Bold: "Bold",
  Italic: "Italic",
} as const;

export type SpeechSelectionMark =
  (typeof SpeechSelectionMark)[keyof typeof SpeechSelectionMark];

export const SpeechCommandIntentType = {
  ReplaceLiteral: "ReplaceLiteral",
  InsertLiteral: "InsertLiteral",
  SetSelectionMark: "SetSelectionMark",
  RewriteSelection: "RewriteSelection",
} as const;

type ReplaceLiteralIntent = Readonly<{
  type: typeof SpeechCommandIntentType.ReplaceLiteral;
  scope: SpeechTextScope;
  occurrence: SpeechTextOccurrence;
  matchText: string;
  replacementText: string;
}>;

type InsertLiteralIntent = Readonly<{
  type: typeof SpeechCommandIntentType.InsertLiteral;
  target: SpeechInsertionTarget;
  text: string;
}>;

type SetSelectionMarkIntent = Readonly<{
  type: typeof SpeechCommandIntentType.SetSelectionMark;
  mark: SpeechSelectionMark;
  enabled: boolean;
}>;

type RewriteSelectionIntent = Readonly<{
  type: typeof SpeechCommandIntentType.RewriteSelection;
  instruction: string;
}>;

export const SpeechCommandIntent = {
  ReplaceLiteral: (
    scope: SpeechTextScope,
    occurrence: SpeechTextOccurrence,
    matchText: string,
    replacementText: string,
  ): ReplaceLiteralIntent => ({
    type: SpeechCommandIntentType.ReplaceLiteral,
    scope,
    occurrence,
    matchText,
    replacementText,
  }),

  InsertLiteral: (
    target: SpeechInsertionTarget,
    text: string,
  ): InsertLiteralIntent => ({
    type: SpeechCommandIntentType.InsertLiteral,
    target,
    text,
  }),

  SetSelectionMark: (
    mark: SpeechSelectionMark,
    enabled: boolean,
  ): SetSelectionMarkIntent => ({
    type: SpeechCommandIntentType.SetSelectionMark,
    mark,
    enabled,
  }),

  RewriteSelection: (instruction: string): RewriteSelectionIntent => ({
    type: SpeechCommandIntentType.RewriteSelection,
    instruction,
  }),
} as const;

export type SpeechCommandIntent = ReturnType<
  (typeof SpeechCommandIntent)[keyof typeof SpeechCommandIntent]
>;

export const SpeechCommandDecisionType = {
  Classified: "Classified",
  Ambiguous: "Ambiguous",
  Unsupported: "Unsupported",
} as const;

type ClassifiedDecision = Readonly<{
  type: typeof SpeechCommandDecisionType.Classified;
  intent: SpeechCommandIntent;
}>;

type AmbiguousDecision = Readonly<{
  type: typeof SpeechCommandDecisionType.Ambiguous;
  reason: string;
  clarification: string;
}>;

type UnsupportedDecision = Readonly<{
  type: typeof SpeechCommandDecisionType.Unsupported;
  reason: string;
}>;

export const SpeechCommandDecision = {
  Classified: (intent: SpeechCommandIntent): ClassifiedDecision => ({
    type: SpeechCommandDecisionType.Classified,
    intent,
  }),

  Ambiguous: (reason: string, clarification: string): AmbiguousDecision => ({
    type: SpeechCommandDecisionType.Ambiguous,
    reason,
    clarification,
  }),

  Unsupported: (reason: string): UnsupportedDecision => ({
    type: SpeechCommandDecisionType.Unsupported,
    reason,
  }),
} as const;

export type SpeechCommandDecision = ReturnType<
  (typeof SpeechCommandDecision)[keyof typeof SpeechCommandDecision]
>;

export const SpeechEditCommandType = {
  ReplaceText: "ReplaceText",
  InsertText: "InsertText",
  SetMark: "SetMark",
  ReplaceSelection: "ReplaceSelection",
} as const;

type ReplaceTextCommand = Readonly<{
  type: typeof SpeechEditCommandType.ReplaceText;
  scope: SpeechTextScope;
  occurrence: SpeechTextOccurrence;
  matchText: string;
  replacementText: string;
}>;

type InsertTextCommand = Readonly<{
  type: typeof SpeechEditCommandType.InsertText;
  target: SpeechInsertionTarget;
  text: string;
}>;

type SetMarkCommand = Readonly<{
  type: typeof SpeechEditCommandType.SetMark;
  mark: SpeechSelectionMark;
  enabled: boolean;
}>;

type ReplaceSelectionCommand = Readonly<{
  type: typeof SpeechEditCommandType.ReplaceSelection;
  replacementText: string;
}>;

export const SpeechEditCommand = {
  ReplaceText: (
    scope: SpeechTextScope,
    occurrence: SpeechTextOccurrence,
    matchText: string,
    replacementText: string,
  ): ReplaceTextCommand => ({
    type: SpeechEditCommandType.ReplaceText,
    scope,
    occurrence,
    matchText,
    replacementText,
  }),

  InsertText: (
    target: SpeechInsertionTarget,
    text: string,
  ): InsertTextCommand => ({
    type: SpeechEditCommandType.InsertText,
    target,
    text,
  }),

  SetMark: (mark: SpeechSelectionMark, enabled: boolean): SetMarkCommand => ({
    type: SpeechEditCommandType.SetMark,
    mark,
    enabled,
  }),

  ReplaceSelection: (replacementText: string): ReplaceSelectionCommand => ({
    type: SpeechEditCommandType.ReplaceSelection,
    replacementText,
  }),
} as const;

export type SpeechEditCommand = ReturnType<
  (typeof SpeechEditCommand)[keyof typeof SpeechEditCommand]
>;

export type SpeechCommandCapabilityFacts = Readonly<{
  hasSelection: boolean;
  selectionLength: number;
  documentIsEmpty: boolean;
}>;

export type SpeechEditorContextIdentity = Readonly<{
  captureId: string;
  documentId: string;
  documentRevision: string;
  documentFingerprint: string;
}>;

export type SpeechEditorSelection = Readonly<{
  from: number;
  to: number;
  text: string;
}>;

export type CapturedSpeechEditorContext = Readonly<{
  identity: SpeechEditorContextIdentity;
  documentText: string;
  selection: SpeechEditorSelection | null;
}>;

export const SpeechInterpretationOperation = {
  ClassifyTranscript: "ClassifyTranscript",
  RewriteSelection: "RewriteSelection",
} as const;

export type SpeechInterpretationOperation =
  (typeof SpeechInterpretationOperation)[keyof typeof SpeechInterpretationOperation];

export const SpeechInterpretationFailureType = {
  InvalidTranscript: "InvalidTranscript",
  ProviderFailed: "ProviderFailed",
  InvalidProviderResponse: "InvalidProviderResponse",
  InvalidContext: "InvalidContext",
  RewriteFailed: "RewriteFailed",
  Cancelled: "Cancelled",
} as const;

type InvalidTranscriptFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.InvalidTranscript;
  message: string;
}>;

type ProviderFailedFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.ProviderFailed;
  operation: SpeechInterpretationOperation;
  message: string;
  status: number | null;
}>;

type InvalidProviderResponseFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.InvalidProviderResponse;
  operation: SpeechInterpretationOperation;
  message: string;
}>;

type InvalidContextFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.InvalidContext;
  message: string;
}>;

type RewriteFailedFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.RewriteFailed;
  message: string;
}>;

type CancelledFailure = Readonly<{
  type: typeof SpeechInterpretationFailureType.Cancelled;
  operation: SpeechInterpretationOperation;
  reason: string;
}>;

export const SpeechInterpretationFailure = {
  InvalidTranscript: (message: string): InvalidTranscriptFailure => ({
    type: SpeechInterpretationFailureType.InvalidTranscript,
    message,
  }),

  ProviderFailed: (
    operation: SpeechInterpretationOperation,
    message: string,
    status: number | null,
  ): ProviderFailedFailure => ({
    type: SpeechInterpretationFailureType.ProviderFailed,
    operation,
    message,
    status,
  }),

  InvalidProviderResponse: (
    operation: SpeechInterpretationOperation,
    message: string,
  ): InvalidProviderResponseFailure => ({
    type: SpeechInterpretationFailureType.InvalidProviderResponse,
    operation,
    message,
  }),

  InvalidContext: (message: string): InvalidContextFailure => ({
    type: SpeechInterpretationFailureType.InvalidContext,
    message,
  }),

  RewriteFailed: (message: string): RewriteFailedFailure => ({
    type: SpeechInterpretationFailureType.RewriteFailed,
    message,
  }),

  Cancelled: (
    operation: SpeechInterpretationOperation,
    reason: string,
  ): CancelledFailure => ({
    type: SpeechInterpretationFailureType.Cancelled,
    operation,
    reason,
  }),
} as const;

export type SpeechInterpretationFailure = ReturnType<
  (typeof SpeechInterpretationFailure)[keyof typeof SpeechInterpretationFailure]
>;

export type SpeechEditProposal = Readonly<{
  proposalId: string;
  transcript: string;
  context: SpeechEditorContextIdentity;
  summary: string;
  command: SpeechEditCommand;
}>;

export const SpeechInterpretationOutcomeType = {
  Proposed: "Proposed",
  Ambiguous: "Ambiguous",
  Unsupported: "Unsupported",
  Cancelled: "Cancelled",
  Failed: "Failed",
} as const;

type ProposedOutcome = Readonly<{
  type: typeof SpeechInterpretationOutcomeType.Proposed;
  proposal: SpeechEditProposal;
}>;

type AmbiguousOutcome = Readonly<{
  type: typeof SpeechInterpretationOutcomeType.Ambiguous;
  transcript: string;
  reason: string;
  clarification: string;
}>;

type UnsupportedOutcome = Readonly<{
  type: typeof SpeechInterpretationOutcomeType.Unsupported;
  transcript: string;
  reason: string;
}>;

type CancelledOutcome = Readonly<{
  type: typeof SpeechInterpretationOutcomeType.Cancelled;
  reason: string;
}>;

type FailedOutcome = Readonly<{
  type: typeof SpeechInterpretationOutcomeType.Failed;
  failure: SpeechInterpretationFailure;
}>;

export const SpeechInterpretationOutcome = {
  Proposed: (proposal: SpeechEditProposal): ProposedOutcome => ({
    type: SpeechInterpretationOutcomeType.Proposed,
    proposal,
  }),

  Ambiguous: (
    transcript: string,
    reason: string,
    clarification: string,
  ): AmbiguousOutcome => ({
    type: SpeechInterpretationOutcomeType.Ambiguous,
    transcript,
    reason,
    clarification,
  }),

  Unsupported: (transcript: string, reason: string): UnsupportedOutcome => ({
    type: SpeechInterpretationOutcomeType.Unsupported,
    transcript,
    reason,
  }),

  Cancelled: (reason: string): CancelledOutcome => ({
    type: SpeechInterpretationOutcomeType.Cancelled,
    reason,
  }),

  Failed: (failure: SpeechInterpretationFailure): FailedOutcome => ({
    type: SpeechInterpretationOutcomeType.Failed,
    failure,
  }),
} as const;

export type SpeechInterpretationOutcome = ReturnType<
  (typeof SpeechInterpretationOutcome)[keyof typeof SpeechInterpretationOutcome]
>;

export const SpeechProposalValidationType = {
  Applicable: "Applicable",
  Stale: "Stale",
} as const;

type ApplicableProposal = Readonly<{
  type: typeof SpeechProposalValidationType.Applicable;
  command: SpeechEditCommand;
}>;

type StaleProposal = Readonly<{
  type: typeof SpeechProposalValidationType.Stale;
  reason: string;
}>;

export const SpeechProposalValidation = {
  Applicable: (command: SpeechEditCommand): ApplicableProposal => ({
    type: SpeechProposalValidationType.Applicable,
    command,
  }),

  Stale: (reason: string): StaleProposal => ({
    type: SpeechProposalValidationType.Stale,
    reason,
  }),
} as const;

export type SpeechProposalValidation = ReturnType<
  (typeof SpeechProposalValidation)[keyof typeof SpeechProposalValidation]
>;

export const SpeechResultType = {
  Ok: "Ok",
  Error: "Error",
} as const;

type SpeechResultOk<Value> = Readonly<{
  type: typeof SpeechResultType.Ok;
  value: Value;
}>;

type SpeechResultError<Error> = Readonly<{
  type: typeof SpeechResultType.Error;
  error: Error;
}>;

export const SpeechResult = {
  Ok: <Value>(value: Value): SpeechResultOk<Value> => ({
    type: SpeechResultType.Ok,
    value,
  }),

  Error: <Error>(error: Error): SpeechResultError<Error> => ({
    type: SpeechResultType.Error,
    error,
  }),
} as const;

export type SpeechResult<Value, Error> =
  | SpeechResultOk<Value>
  | SpeechResultError<Error>;
