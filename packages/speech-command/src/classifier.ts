import { Effect } from "effect";
import {
  SpeechCommandDecision,
  SpeechCommandIntent,
  SpeechCommandIntentType,
  SpeechInsertionTarget,
  SpeechInterpretationFailure,
  SpeechInterpretationOperation,
  SpeechResultType,
  SpeechTextOccurrence,
  SpeechTextScope,
  type SpeechCommandCapabilityFacts,
  type SpeechCommandDecision as SpeechCommandDecisionValue,
  type SpeechInterpretationFailure as SpeechInterpretationFailureValue,
} from "./domain.ts";
import {
  decodeSpeechCommandClassifierEnvelope,
  SpeechCommandClassifierEnvelopeKind,
  type SpeechCommandClassifierEnvelope,
} from "./provider-schema.ts";
import {
  makeSpeechCommandClassifierRequest,
  type SpeechCommandClassifierProviderRequest,
} from "./prompt.ts";

export type SpeechCommandClassifierPort = Readonly<{
  classify: (
    request: SpeechCommandClassifierProviderRequest,
  ) => Effect.Effect<unknown, SpeechInterpretationFailureValue>;
}>;

const MaximumTranscriptLength = 2_000;

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function allNull(values: ReadonlyArray<unknown>): boolean {
  return values.every((value) => value === null);
}

function invalidEnvelope(message: string): SpeechInterpretationFailureValue {
  return SpeechInterpretationFailure.InvalidProviderResponse(
    SpeechInterpretationOperation.ClassifyTranscript,
    message,
  );
}

export function normalizeSpeechCommandClassifierEnvelope(
  envelope: SpeechCommandClassifierEnvelope,
  capabilities: SpeechCommandCapabilityFacts,
): Effect.Effect<SpeechCommandDecisionValue, SpeechInterpretationFailureValue> {
  switch (envelope.kind) {
    case SpeechCommandClassifierEnvelopeKind.Ambiguous:
      if (
        envelope.intent === null &&
        hasText(envelope.reason) &&
        hasText(envelope.clarification) &&
        allNull([
          envelope.scope,
          envelope.occurrence,
          envelope.mark,
          envelope.enabled,
          envelope.matchText,
          envelope.replacementText,
          envelope.insertionText,
          envelope.rewriteInstruction,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Ambiguous(
            envelope.reason.trim(),
            envelope.clarification.trim(),
          ),
        );
      }
      return Effect.fail(
        invalidEnvelope("Ambiguous response contains contradictory fields."),
      );

    case SpeechCommandClassifierEnvelopeKind.Unsupported:
      if (
        envelope.intent === null &&
        hasText(envelope.reason) &&
        envelope.clarification === null &&
        allNull([
          envelope.scope,
          envelope.occurrence,
          envelope.mark,
          envelope.enabled,
          envelope.matchText,
          envelope.replacementText,
          envelope.insertionText,
          envelope.rewriteInstruction,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Unsupported(envelope.reason.trim()),
        );
      }
      return Effect.fail(
        invalidEnvelope("Unsupported response contains contradictory fields."),
      );

    case SpeechCommandClassifierEnvelopeKind.Classified:
      if (envelope.reason !== null || envelope.clarification !== null) {
        return Effect.fail(
          invalidEnvelope("Classified response must not include outcome prose."),
        );
      }
      break;

    default:
      envelope.kind satisfies never;
      return Effect.fail(invalidEnvelope("Unknown classifier response kind."));
  }

  switch (envelope.intent) {
    case SpeechCommandIntentType.ReplaceLiteral: {
      const scope =
        envelope.scope ??
        (capabilities.hasSelection
          ? SpeechTextScope.Selection
          : SpeechTextScope.Document);
      const occurrence = envelope.occurrence ?? SpeechTextOccurrence.All;
      if (
        (scope === SpeechTextScope.Selection ||
          scope === SpeechTextScope.Document) &&
        hasText(envelope.matchText) &&
        envelope.replacementText !== null &&
        allNull([
          envelope.mark,
          envelope.enabled,
          envelope.insertionText,
          envelope.rewriteInstruction,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Classified(
            SpeechCommandIntent.ReplaceLiteral(
              scope,
              occurrence,
              envelope.matchText,
              envelope.replacementText,
            ),
          ),
        );
      }
      return Effect.fail(invalidEnvelope("ReplaceLiteral fields are invalid."));
    }

    case SpeechCommandIntentType.InsertLiteral:
      if (
        (envelope.scope === SpeechInsertionTarget.BeforeSelection ||
          envelope.scope === SpeechInsertionTarget.AfterSelection ||
          envelope.scope === SpeechInsertionTarget.DocumentEnd) &&
        hasText(envelope.insertionText) &&
        allNull([
          envelope.occurrence,
          envelope.mark,
          envelope.enabled,
          envelope.matchText,
          envelope.replacementText,
          envelope.rewriteInstruction,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Classified(
            SpeechCommandIntent.InsertLiteral(
              envelope.scope,
              envelope.insertionText,
            ),
          ),
        );
      }
      return Effect.fail(invalidEnvelope("InsertLiteral fields are invalid."));

    case SpeechCommandIntentType.SetSelectionMark:
      if (
        envelope.scope === SpeechTextScope.Selection &&
        envelope.mark !== null &&
        envelope.enabled !== null &&
        allNull([
          envelope.occurrence,
          envelope.matchText,
          envelope.replacementText,
          envelope.insertionText,
          envelope.rewriteInstruction,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Classified(
            SpeechCommandIntent.SetSelectionMark(
              envelope.mark,
              envelope.enabled,
            ),
          ),
        );
      }
      return Effect.fail(
        invalidEnvelope("SetSelectionMark fields are invalid."),
      );

    case SpeechCommandIntentType.Rewrite: {
      const scope =
        envelope.scope ??
        (capabilities.hasSelection
          ? SpeechTextScope.Selection
          : SpeechTextScope.Document);
      if (
        (scope === SpeechTextScope.Selection ||
          scope === SpeechTextScope.Document) &&
        hasText(envelope.rewriteInstruction) &&
        allNull([
          envelope.occurrence,
          envelope.mark,
          envelope.enabled,
          envelope.matchText,
          envelope.replacementText,
          envelope.insertionText,
        ])
      ) {
        return Effect.succeed(
          SpeechCommandDecision.Classified(
            SpeechCommandIntent.Rewrite(
              scope,
              envelope.rewriteInstruction.trim(),
            ),
          ),
        );
      }
      return Effect.fail(
        invalidEnvelope("Rewrite fields are invalid."),
      );
    }

    case null:
      return Effect.fail(
        invalidEnvelope("Classified response is missing an intent."),
      );

    default:
      envelope.intent satisfies never;
      return Effect.fail(invalidEnvelope("Unknown classifier intent."));
  }
}

export function classifyTranscript(
  transcript: string,
  capabilities: SpeechCommandCapabilityFacts,
  provider: SpeechCommandClassifierPort,
): Effect.Effect<SpeechCommandDecisionValue, SpeechInterpretationFailureValue> {
  const normalizedTranscript = transcript.trim();

  if (normalizedTranscript.length === 0) {
    return Effect.fail(
      SpeechInterpretationFailure.InvalidTranscript(
        "Transcript must contain an editing instruction.",
      ),
    );
  }

  if (normalizedTranscript.length > MaximumTranscriptLength) {
    return Effect.fail(
      SpeechInterpretationFailure.InvalidTranscript(
        `Transcript exceeds ${MaximumTranscriptLength} characters.`,
      ),
    );
  }

  return provider
    .classify(
      makeSpeechCommandClassifierRequest(normalizedTranscript, capabilities),
    )
    .pipe(
      Effect.flatMap((providerOutput) => {
        const decoded = decodeSpeechCommandClassifierEnvelope(providerOutput);

        switch (decoded.type) {
          case SpeechResultType.Ok:
            return normalizeSpeechCommandClassifierEnvelope(
              decoded.value,
              capabilities,
            );
          case SpeechResultType.Error:
            return Effect.fail(invalidEnvelope(decoded.error));
          default:
            decoded satisfies never;
            return Effect.fail(invalidEnvelope("Unknown decode result."));
        }
      }),
    );
}
