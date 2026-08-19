import { Effect } from "effect";
import { classifyTranscript, type SpeechCommandClassifierPort } from "./classifier.ts";
import type { SpeechCommandFixture } from "./fixtures.ts";
import {
  SpeechCommandClassifierPromptVersion,
  SpeechCommandRegistryVersion,
} from "./prompt.ts";

export type SpeechCommandEvaluationCase = Readonly<{
  id: string;
  passed: boolean;
  latencyMs: number;
  failureType: string | null;
}>;

export type SpeechCommandEvaluationReport = Readonly<{
  promptVersion: typeof SpeechCommandClassifierPromptVersion.V1;
  registryVersion: typeof SpeechCommandRegistryVersion.V1;
  model: string;
  total: number;
  passed: number;
  cases: ReadonlyArray<SpeechCommandEvaluationCase>;
}>;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function evaluateSpeechCommandFixtures(
  model: string,
  provider: SpeechCommandClassifierPort,
  fixtures: ReadonlyArray<SpeechCommandFixture>,
): Promise<SpeechCommandEvaluationReport> {
  const cases: Array<SpeechCommandEvaluationCase> = [];

  for (const fixture of fixtures) {
    const startedAt = performance.now();
    const result = await Effect.runPromise(
      classifyTranscript(
        fixture.transcript,
        fixture.capabilities,
        provider,
      ).pipe(
        Effect.match({
          onFailure: (failure) => ({ failure, value: null }),
          onSuccess: (value) => ({ failure: null, value }),
        }),
      ),
    );

    cases.push({
      id: fixture.id,
      passed: result.failure === null && sameValue(result.value, fixture.expected),
      latencyMs: Math.round(performance.now() - startedAt),
      failureType: result.failure?.type ?? null,
    });
  }

  return {
    promptVersion: SpeechCommandClassifierPromptVersion.V1,
    registryVersion: SpeechCommandRegistryVersion.V1,
    model,
    total: cases.length,
    passed: cases.filter((entry) => entry.passed).length,
    cases,
  };
}
