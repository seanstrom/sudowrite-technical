import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  SpeechCommandDecisionType,
  SpeechCommandIntentType,
  SpeechInsertionTarget,
  SpeechTextScope,
  type SpeechCommandDecision,
} from "./domain.ts";
import { evaluateSpeechCommandFixtures } from "./evaluation.ts";
import { SpeechCommandFixtures } from "./fixtures.ts";
import {
  SpeechCommandClassifierEnvelopeKind,
  type SpeechCommandClassifierEnvelope,
} from "./provider-schema.ts";

function emptyEnvelope(): SpeechCommandClassifierEnvelope {
  return {
    kind: SpeechCommandClassifierEnvelopeKind.Classified,
    intent: null,
    scope: null,
    occurrence: null,
    mark: null,
    enabled: null,
    matchText: null,
    replacementText: null,
    insertionText: null,
    rewriteInstruction: null,
    reason: null,
    clarification: null,
  };
}

function providerEnvelope(
  decision: SpeechCommandDecision,
): SpeechCommandClassifierEnvelope {
  switch (decision.type) {
    case SpeechCommandDecisionType.Ambiguous:
      return {
        ...emptyEnvelope(),
        kind: SpeechCommandClassifierEnvelopeKind.Ambiguous,
        reason: decision.reason,
        clarification: decision.clarification,
      };

    case SpeechCommandDecisionType.Unsupported:
      return {
        ...emptyEnvelope(),
        kind: SpeechCommandClassifierEnvelopeKind.Unsupported,
        reason: decision.reason,
      };

    case SpeechCommandDecisionType.Classified:
      break;

    default:
      decision satisfies never;
      return emptyEnvelope();
  }

  switch (decision.intent.type) {
    case SpeechCommandIntentType.ReplaceLiteral:
      return {
        ...emptyEnvelope(),
        intent: decision.intent.type,
        scope: decision.intent.scope,
        occurrence: decision.intent.occurrence,
        matchText: decision.intent.matchText,
        replacementText: decision.intent.replacementText,
      };

    case SpeechCommandIntentType.InsertLiteral:
      return {
        ...emptyEnvelope(),
        intent: decision.intent.type,
        scope: decision.intent.target,
        insertionText: decision.intent.text,
      };

    case SpeechCommandIntentType.SetSelectionMark:
      return {
        ...emptyEnvelope(),
        intent: decision.intent.type,
        scope: SpeechTextScope.Selection,
        mark: decision.intent.mark,
        enabled: decision.intent.enabled,
      };

    case SpeechCommandIntentType.RewriteSelection:
      return {
        ...emptyEnvelope(),
        intent: decision.intent.type,
        scope: SpeechTextScope.Selection,
        rewriteInstruction: decision.intent.instruction,
      };

    default:
      decision.intent satisfies never;
      return emptyEnvelope();
  }
}

describe("speech command evaluation", () => {
  it("produces a sanitized repeatable report", async () => {
    const report = await evaluateSpeechCommandFixtures(
      "fixture-provider",
      {
        classify: (request) => {
          const input = JSON.parse(request.userPrompt) as {
            transcript: string;
          };
          const fixture = SpeechCommandFixtures.find(
            (candidate) => candidate.transcript === input.transcript,
          );

          if (fixture === undefined) {
            return Effect.succeed({
              ...emptyEnvelope(),
              kind: SpeechCommandClassifierEnvelopeKind.Unsupported,
              reason: "Fixture is missing.",
            });
          }

          return Effect.succeed(providerEnvelope(fixture.expected));
        },
      },
      SpeechCommandFixtures,
    );

    expect(report.passed).toBe(report.total);
    expect(report.cases.every((entry) => entry.failureType === null)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("transcript");
    expect(JSON.stringify(report)).not.toContain("documentText");
  });

  it("keeps insertion targets and text scopes as distinct vocabularies", () => {
    expect(SpeechInsertionTarget.DocumentEnd).not.toBe(
      SpeechTextScope.Document,
    );
  });
});
