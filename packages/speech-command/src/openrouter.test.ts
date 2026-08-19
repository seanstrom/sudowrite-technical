import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import * as PublicApi from "./index.ts";
import {
  SpeechCommandIntentType,
  SpeechInterpretationFailureType,
  SpeechTextOccurrence,
  SpeechTextScope,
} from "./domain.ts";
import { makeSpeechCommandClassifierRequest } from "./prompt.ts";
import { makeOpenRouterClassifierPort } from "./openrouter.ts";
import { SpeechCommandClassifierEnvelopeKind } from "./provider-schema.ts";

describe("OpenRouter classifier adapter", () => {
  it("is isolated from the browser-compatible root export", () => {
    expect("makeOpenRouterClassifierPort" in PublicApi).toBe(false);
  });

  it("sends a strict schema request without exposing the credential in results", async () => {
    const calls: Array<Readonly<{ input: string; init: RequestInit }>> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({
        input: String(input),
        init: init ?? {},
      });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
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
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = makeOpenRouterClassifierPort({
      apiKey: "secret-for-test",
      classifierModel: "openai/gpt-4o-mini",
      rewriteModel: "openai/gpt-4o-mini",
      fetch,
    });
    const result = await Effect.runPromise(
      provider.classify(
        makeSpeechCommandClassifierRequest("Replace every cat with dog.", {
          hasSelection: false,
          selectionLength: 0,
          documentIsEmpty: false,
        }),
      ),
    );

    expect(result).toMatchObject({
      intent: SpeechCommandIntentType.ReplaceLiteral,
      matchText: "cat",
      replacementText: "dog",
    });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("models missing configuration without returning the missing secret", async () => {
    const provider = makeOpenRouterClassifierPort({
      apiKey: "",
      classifierModel: "openai/gpt-4o-mini",
      rewriteModel: "openai/gpt-4o-mini",
      fetch: globalThis.fetch,
    });
    const failure = await Effect.runPromise(
      provider
        .classify(
          makeSpeechCommandClassifierRequest("Make this bold.", {
            hasSelection: true,
            selectionLength: 4,
            documentIsEmpty: false,
          }),
        )
        .pipe(
          Effect.match({
            onFailure: (error) => error,
            onSuccess: () => null,
          }),
        ),
    );

    expect(failure?.type).toBe(SpeechInterpretationFailureType.ProviderFailed);
    expect(JSON.stringify(failure)).not.toContain("Authorization");
  });
});
