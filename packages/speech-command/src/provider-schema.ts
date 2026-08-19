import {
  SpeechCommandDecisionType,
  SpeechCommandIntentType,
  SpeechInsertionTarget,
  SpeechResult,
  SpeechSelectionMark,
  SpeechTextOccurrence,
  SpeechTextScope,
  type SpeechResult as SpeechResultValue,
} from "./domain.ts";

export const SpeechCommandClassifierEnvelopeKind = {
  Classified: SpeechCommandDecisionType.Classified,
  Ambiguous: SpeechCommandDecisionType.Ambiguous,
  Unsupported: SpeechCommandDecisionType.Unsupported,
} as const;

export type SpeechCommandClassifierEnvelope = Readonly<{
  kind:
    (typeof SpeechCommandClassifierEnvelopeKind)[keyof typeof SpeechCommandClassifierEnvelopeKind];
  intent:
    | (typeof SpeechCommandIntentType)[keyof typeof SpeechCommandIntentType]
    | null;
  scope:
    | (typeof SpeechTextScope)[keyof typeof SpeechTextScope]
    | (typeof SpeechInsertionTarget)[keyof typeof SpeechInsertionTarget]
    | null;
  occurrence:
    | (typeof SpeechTextOccurrence)[keyof typeof SpeechTextOccurrence]
    | null;
  mark: (typeof SpeechSelectionMark)[keyof typeof SpeechSelectionMark] | null;
  enabled: boolean | null;
  matchText: string | null;
  replacementText: string | null;
  insertionText: string | null;
  rewriteInstruction: string | null;
  reason: string | null;
  clarification: string | null;
}>;

const ClassifierEnvelopeKeys = [
  "kind",
  "intent",
  "scope",
  "occurrence",
  "mark",
  "enabled",
  "matchText",
  "replacementText",
  "insertionText",
  "rewriteInstruction",
  "reason",
  "clarification",
] as const;

export const SpeechCommandClassifierResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ClassifierEnvelopeKeys,
  properties: {
    kind: {
      type: "string",
      enum: Object.values(SpeechCommandClassifierEnvelopeKind),
    },
    intent: {
      anyOf: [
        { type: "string", enum: Object.values(SpeechCommandIntentType) },
        { type: "null" },
      ],
    },
    scope: {
      anyOf: [
        {
          type: "string",
          enum: [
            ...Object.values(SpeechTextScope),
            ...Object.values(SpeechInsertionTarget),
          ],
        },
        { type: "null" },
      ],
    },
    occurrence: {
      anyOf: [
        { type: "string", enum: Object.values(SpeechTextOccurrence) },
        { type: "null" },
      ],
    },
    mark: {
      anyOf: [
        { type: "string", enum: Object.values(SpeechSelectionMark) },
        { type: "null" },
      ],
    },
    enabled: { type: ["boolean", "null"] },
    matchText: { type: ["string", "null"] },
    replacementText: { type: ["string", "null"] },
    insertionText: { type: ["string", "null"] },
    rewriteInstruction: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
    clarification: { type: ["string", "null"] },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<Value extends string>(
  value: unknown,
  vocabulary: Readonly<Record<string, Value>>,
): value is Value {
  return (
    typeof value === "string" &&
    Object.values(vocabulary).some((candidate) => candidate === value)
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...ClassifierEnvelopeKeys].sort();

  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

export function decodeSpeechCommandClassifierEnvelope(
  input: unknown,
): SpeechResultValue<SpeechCommandClassifierEnvelope, string> {
  if (!isRecord(input) || !hasExactKeys(input)) {
    return SpeechResult.Error(
      "Classifier response must contain exactly the V1 schema fields.",
    );
  }

  if (!isOneOf(input.kind, SpeechCommandClassifierEnvelopeKind)) {
    return SpeechResult.Error("Classifier response kind is invalid.");
  }

  if (
    input.intent !== null &&
    !isOneOf(input.intent, SpeechCommandIntentType)
  ) {
    return SpeechResult.Error("Classifier response intent is invalid.");
  }

  const scopeVocabulary = {
    ...SpeechTextScope,
    ...SpeechInsertionTarget,
  } as const;

  if (input.scope !== null && !isOneOf(input.scope, scopeVocabulary)) {
    return SpeechResult.Error("Classifier response scope is invalid.");
  }

  if (
    input.occurrence !== null &&
    !isOneOf(input.occurrence, SpeechTextOccurrence)
  ) {
    return SpeechResult.Error("Classifier response occurrence is invalid.");
  }

  if (
    input.mark !== null &&
    !isOneOf(input.mark, SpeechSelectionMark)
  ) {
    return SpeechResult.Error("Classifier response mark is invalid.");
  }

  if (
    input.enabled !== null &&
    typeof input.enabled !== "boolean"
  ) {
    return SpeechResult.Error("Classifier response enabled flag is invalid.");
  }

  const textFields = [
    input.matchText,
    input.replacementText,
    input.insertionText,
    input.rewriteInstruction,
    input.reason,
    input.clarification,
  ];

  if (!textFields.every(isNullableString)) {
    return SpeechResult.Error("Classifier response text fields are invalid.");
  }

  return SpeechResult.Ok({
    kind: input.kind,
    intent: input.intent,
    scope: input.scope,
    occurrence: input.occurrence,
    mark: input.mark,
    enabled: input.enabled,
    matchText: input.matchText as string | null,
    replacementText: input.replacementText as string | null,
    insertionText: input.insertionText as string | null,
    rewriteInstruction: input.rewriteInstruction as string | null,
    reason: input.reason as string | null,
    clarification: input.clarification as string | null,
  });
}
