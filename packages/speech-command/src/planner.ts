import { Effect } from "effect";
import {
  SpeechCommandDecisionType,
  SpeechCommandIntentType,
  SpeechEditCommand,
  SpeechEditCommandType,
  SpeechInsertionTarget,
  SpeechInterpretationFailure,
  SpeechInterpretationFailureType,
  SpeechInterpretationOperation,
  SpeechInterpretationOutcome,
  SpeechProposalValidation,
  SpeechTextScope,
  type CapturedSpeechEditorContext,
  type SpeechCommandDecision,
  type SpeechCommandIntent,
  type SpeechEditCommand as SpeechEditCommandValue,
  type SpeechEditProposal,
  type SpeechDocumentPreview,
  type SpeechEditorContextIdentity,
  type SpeechInterpretationFailure as SpeechInterpretationFailureValue,
  type SpeechInterpretationOutcome as SpeechInterpretationOutcomeValue,
  type SpeechProposalValidation as SpeechProposalValidationValue,
} from "./domain.ts";
import {
  classifyTranscript,
  type SpeechCommandClassifierPort,
} from "./classifier.ts";

export type SelectionRewriteRequest = Readonly<{
  instruction: string;
  selectedText: string;
  maximumOutputLength: number;
}>;

export type SelectionRewritePort = Readonly<{
  rewrite: (
    request: SelectionRewriteRequest,
  ) => Effect.Effect<string, SpeechInterpretationFailureValue>;
}>;

export type DocumentRewriteRequest = Readonly<{
  instruction: string;
  documentContent: unknown;
  maximumOutputLength: number;
}>;

export type DocumentRewriteResult = Readonly<{
  replacementContent: unknown;
  preview: SpeechDocumentPreview;
}>;

export type DocumentRewritePort = Readonly<{
  rewrite: (
    request: DocumentRewriteRequest,
  ) => Effect.Effect<DocumentRewriteResult, SpeechInterpretationFailureValue>;
}>;

export type InterpretTranscriptInput = Readonly<{
  requestId: string;
  transcript: string;
  context: CapturedSpeechEditorContext;
}>;

export type InterpretTranscriptPorts = Readonly<{
  classifier: SpeechCommandClassifierPort;
  selectionRewriter: SelectionRewritePort;
  documentRewriter: DocumentRewritePort;
}>;

const MaximumRewriteInputLength = 8_000;
const MaximumRewriteOutputLength = 8_000;

export function projectSpeechCommandCapabilities(
  context: CapturedSpeechEditorContext,
) {
  const selectionLength = context.selection?.text.length ?? 0;

  return {
    hasSelection: selectionLength > 0,
    selectionLength,
    documentIsEmpty: context.documentText.length === 0,
  } as const;
}

function contextTextForScope(
  scope: (typeof SpeechTextScope)[keyof typeof SpeechTextScope],
  context: CapturedSpeechEditorContext,
): string | null {
  switch (scope) {
    case SpeechTextScope.Document:
      return context.documentText;
    case SpeechTextScope.Selection:
      return context.selection?.text ?? null;
    default:
      scope satisfies never;
      return null;
  }
}

function commandSummary(command: SpeechEditCommandValue): string {
  switch (command.type) {
    case SpeechEditCommandType.ReplaceText:
      return `Replace ${command.occurrence.toLowerCase()} occurrence(s) of “${command.matchText}”.`;
    case SpeechEditCommandType.InsertText:
      return `Insert text at ${command.target}.`;
    case SpeechEditCommandType.SetMark:
      return `${command.enabled ? "Apply" : "Remove"} ${command.mark}.`;
    case SpeechEditCommandType.ReplaceSelection:
      return "Replace the captured selection with generated prose.";
    case SpeechEditCommandType.ReplaceDocument:
      return "Replace the entire document with a reviewed Markdown rewrite.";
    default:
      command satisfies never;
      return "Review the proposed edit.";
  }
}

function deterministicCommand(
  intent: Exclude<
    SpeechCommandIntent,
    Readonly<{ type: typeof SpeechCommandIntentType.Rewrite }>
  >,
  context: CapturedSpeechEditorContext,
): Effect.Effect<SpeechEditCommandValue, SpeechInterpretationFailureValue> {
  switch (intent.type) {
    case SpeechCommandIntentType.ReplaceLiteral: {
      const sourceText = contextTextForScope(intent.scope, context);

      if (sourceText === null) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            "ReplaceLiteral requires a captured selection for Selection scope.",
          ),
        );
      }

      if (!sourceText.includes(intent.matchText)) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            "The requested literal match does not exist in the captured scope.",
          ),
        );
      }

      return Effect.succeed(
        SpeechEditCommand.ReplaceText(
          intent.scope,
          intent.occurrence,
          intent.matchText,
          intent.replacementText,
        ),
      );
    }

    case SpeechCommandIntentType.InsertLiteral:
      if (
        (intent.target === SpeechInsertionTarget.BeforeSelection ||
          intent.target === SpeechInsertionTarget.AfterSelection) &&
        (context.selection === null || context.selection.text.length === 0)
      ) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            "The insertion target requires a captured selection.",
          ),
        );
      }

      return Effect.succeed(
        SpeechEditCommand.InsertText(intent.target, intent.text),
      );

    case SpeechCommandIntentType.SetSelectionMark:
      if (context.selection === null || context.selection.text.length === 0) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            "Formatting requires a non-empty captured selection.",
          ),
        );
      }

      return Effect.succeed(
        SpeechEditCommand.SetMark(intent.mark, intent.enabled),
      );

    default:
      intent satisfies never;
      return Effect.fail(
        SpeechInterpretationFailure.InvalidContext(
          "Unknown deterministic command intent.",
        ),
      );
  }
}

export function planSpeechCommand(
  intent: SpeechCommandIntent,
  context: CapturedSpeechEditorContext,
  rewriters: Readonly<{
    selection: SelectionRewritePort;
    document: DocumentRewritePort;
  }>,
): Effect.Effect<SpeechEditCommandValue, SpeechInterpretationFailureValue> {
  switch (intent.type) {
    case SpeechCommandIntentType.ReplaceLiteral:
    case SpeechCommandIntentType.InsertLiteral:
    case SpeechCommandIntentType.SetSelectionMark:
      return deterministicCommand(intent, context);

    case SpeechCommandIntentType.Rewrite: {
      if (intent.scope === SpeechTextScope.Document) {
        if (context.documentText.length > MaximumRewriteInputLength) {
          return Effect.fail(
            SpeechInterpretationFailure.InvalidContext(
              `Document text exceeds ${MaximumRewriteInputLength} characters.`,
            ),
          );
        }

        return rewriters.document
          .rewrite({
            instruction: intent.instruction,
            documentContent: context.documentContent,
            maximumOutputLength: MaximumRewriteOutputLength,
          })
          .pipe(
            Effect.map((result) =>
              SpeechEditCommand.ReplaceDocument(
                result.replacementContent,
                result.preview,
              ),
            ),
          );
      }

      const selectedText = context.selection?.text ?? "";

      if (selectedText.length === 0) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            "Selection rewrite requires a non-empty captured selection.",
          ),
        );
      }

      if (selectedText.length > MaximumRewriteInputLength) {
        return Effect.fail(
          SpeechInterpretationFailure.InvalidContext(
            `Selected text exceeds ${MaximumRewriteInputLength} characters.`,
          ),
        );
      }

      return rewriters.selection
        .rewrite({
          instruction: intent.instruction,
          selectedText,
          maximumOutputLength: MaximumRewriteOutputLength,
        })
        .pipe(
          Effect.flatMap((replacementText) => {
            const normalizedReplacement = replacementText.trim();

            if (
              normalizedReplacement.length === 0 ||
              normalizedReplacement.length > MaximumRewriteOutputLength
            ) {
              return Effect.fail(
                SpeechInterpretationFailure.RewriteFailed(
                  "Rewrite provider returned an empty or oversized result.",
                ),
              );
            }

            return Effect.succeed(
              SpeechEditCommand.ReplaceSelection(normalizedReplacement),
            );
          }),
        );
    }

    default:
      intent satisfies never;
      return Effect.fail(
        SpeechInterpretationFailure.InvalidContext(
          "Unknown speech command intent.",
        ),
      );
  }
}

function makeProposal(
  input: InterpretTranscriptInput,
  command: SpeechEditCommandValue,
): SpeechEditProposal {
  return {
    proposalId: input.requestId,
    transcript: input.transcript,
    context: input.context.identity,
    summary: commandSummary(command),
    command,
  };
}

function interpretationFailureOutcome(
  transcript: string,
  failure: SpeechInterpretationFailureValue,
): SpeechInterpretationOutcomeValue {
  switch (failure.type) {
    case SpeechInterpretationFailureType.InvalidContext:
      return SpeechInterpretationOutcome.Ambiguous(
        transcript,
        failure.message,
        "Clarify the target or capture the intended text, then retry.",
      );
    case SpeechInterpretationFailureType.Cancelled:
      return SpeechInterpretationOutcome.Cancelled(failure.reason);
    case SpeechInterpretationFailureType.InvalidTranscript:
    case SpeechInterpretationFailureType.ProviderFailed:
    case SpeechInterpretationFailureType.InvalidProviderResponse:
    case SpeechInterpretationFailureType.RewriteFailed:
      return SpeechInterpretationOutcome.Failed(failure);
    default:
      failure satisfies never;
      return SpeechInterpretationOutcome.Failed(
        SpeechInterpretationFailure.InvalidContext(
          "Unknown speech interpretation failure.",
        ),
      );
  }
}

function decisionToOutcome(
  input: InterpretTranscriptInput,
  decision: SpeechCommandDecision,
  rewriters: Readonly<{
    selection: SelectionRewritePort;
    document: DocumentRewritePort;
  }>,
): Effect.Effect<SpeechInterpretationOutcomeValue> {
  switch (decision.type) {
    case SpeechCommandDecisionType.Ambiguous:
      return Effect.succeed(
        SpeechInterpretationOutcome.Ambiguous(
          input.transcript,
          decision.reason,
          decision.clarification,
        ),
      );

    case SpeechCommandDecisionType.Unsupported:
      return Effect.succeed(
        SpeechInterpretationOutcome.Unsupported(
          input.transcript,
          decision.reason,
        ),
      );

    case SpeechCommandDecisionType.Classified:
      return planSpeechCommand(decision.intent, input.context, rewriters).pipe(
        Effect.match({
          onFailure: (failure): SpeechInterpretationOutcomeValue =>
            interpretationFailureOutcome(input.transcript, failure),
          onSuccess: (command): SpeechInterpretationOutcomeValue =>
            SpeechInterpretationOutcome.Proposed(makeProposal(input, command)),
        }),
      );

    default:
      decision satisfies never;
      return Effect.succeed(
        SpeechInterpretationOutcome.Failed(
          SpeechInterpretationFailure.InvalidProviderResponse(
            SpeechInterpretationOperation.ClassifyTranscript,
            "Unknown classifier decision.",
          ),
        ),
      );
  }
}

export function interpretTranscript(
  input: InterpretTranscriptInput,
  ports: InterpretTranscriptPorts,
): Effect.Effect<SpeechInterpretationOutcomeValue> {
  return classifyTranscript(
    input.transcript,
    projectSpeechCommandCapabilities(input.context),
    ports.classifier,
  ).pipe(
    Effect.flatMap((decision) =>
      decisionToOutcome(input, decision, {
        selection: ports.selectionRewriter,
        document: ports.documentRewriter,
      }),
    ),
    Effect.catchAll((failure) =>
      Effect.succeed(interpretationFailureOutcome(input.transcript, failure)),
    ),
  );
}

export function validateSpeechEditProposal(
  proposal: SpeechEditProposal,
  current: SpeechEditorContextIdentity,
): SpeechProposalValidationValue {
  const expected = proposal.context;

  if (
    expected.captureId !== current.captureId ||
    expected.documentId !== current.documentId ||
    expected.documentRevision !== current.documentRevision ||
    expected.documentFingerprint !== current.documentFingerprint
  ) {
    return SpeechProposalValidation.Stale(
      "The editor changed after this proposal was created.",
    );
  }

  return SpeechProposalValidation.Applicable(proposal.command);
}
