import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { classifyTranscript } from "./classifier.ts";
import {
  SpeechCommandDecisionType,
  SpeechCommandIntentType,
  SpeechInterpretationFailureType,
  SpeechResultType,
  SpeechTextOccurrence,
  SpeechTextScope,
} from "./domain.ts";
import {
  decodeSpeechCommandClassifierEnvelope,
  SpeechCommandClassifierEnvelopeKind,
  type SpeechCommandClassifierEnvelope,
} from "./provider-schema.ts";

function classifiedReplaceEnvelope(): SpeechCommandClassifierEnvelope {
  return {
    kind: SpeechCommandClassifierEnvelopeKind.Classified,
    intent: SpeechCommandIntentType.ReplaceLiteral,
    scope: SpeechTextScope.Document,
    occurrence: SpeechTextOccurrence.All,
    mark: null,
    enabled: null,
    matchText: "cat",
    replacementText: "dog",
    insertionText: null,
    rewriteInstruction: null,
    reason: null,
    clarification: null,
  };
}

describe("speech command classifier", () => {
  it("rejects extra provider fields", () => {
    const decoded = decodeSpeechCommandClassifierEnvelope({
      ...classifiedReplaceEnvelope(),
      arbitraryCode: "doSomething()",
    });

    expect(decoded.type).toBe(SpeechResultType.Error);
  });

  it("sends only transcript and capability facts to the provider", async () => {
    const requests: Array<unknown> = [];
    const result = await Effect.runPromise(
      classifyTranscript(
        "Uh, replace every cat with dog.",
        {
          hasSelection: false,
          selectionLength: 0,
          documentIsEmpty: false,
        },
        {
          classify: (request) => {
            requests.push(JSON.parse(request.userPrompt));
            return Effect.succeed(classifiedReplaceEnvelope());
          },
        },
      ),
    );

    expect(result.type).toBe(SpeechCommandDecisionType.Classified);
    if (result.type === SpeechCommandDecisionType.Classified) {
      expect(result.intent.type).toBe(SpeechCommandIntentType.ReplaceLiteral);
    }
    expect(requests).toEqual([
      {
        transcript: "Uh, replace every cat with dog.",
        capabilities: {
          hasSelection: false,
          selectionLength: 0,
          documentIsEmpty: false,
        },
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain("documentText");
    expect(JSON.stringify(requests)).not.toContain("selectedText");
  });

  it("turns contradictory classified output into typed failure data", async () => {
    const result = await Effect.runPromise(
      classifyTranscript(
        "Replace every cat with dog.",
        {
          hasSelection: false,
          selectionLength: 0,
          documentIsEmpty: false,
        },
        {
          classify: () =>
            Effect.succeed({
              ...classifiedReplaceEnvelope(),
              rewriteInstruction: "also improve it",
            }),
        },
      ).pipe(
        Effect.match({
          onFailure: (failure) => failure,
          onSuccess: () => null,
        }),
      ),
    );

    expect(result?.type).toBe(
      SpeechInterpretationFailureType.InvalidProviderResponse,
    );
  });
});
