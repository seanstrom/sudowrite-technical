import { evaluateSpeechCommandFixtures } from "./evaluation.ts";
import { SpeechCommandFixtures } from "./fixtures.ts";
import { makeOpenRouterClassifierPort } from "./openrouter.ts";

const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
const model =
  process.env.OPENROUTER_CLASSIFIER_MODEL?.trim() || "openai/gpt-4o-mini";

if (apiKey.length === 0) {
  console.log("Live classifier evaluation skipped: OPENROUTER_API_KEY is absent.");
} else {
  const report = await evaluateSpeechCommandFixtures(
    model,
    makeOpenRouterClassifierPort({
      apiKey,
      classifierModel: model,
      rewriteModel: model,
      fetch: globalThis.fetch,
    }),
    SpeechCommandFixtures,
  );

  console.log(
    JSON.stringify(
      {
        promptVersion: report.promptVersion,
        registryVersion: report.registryVersion,
        model: report.model,
        passed: report.passed,
        total: report.total,
        cases: report.cases,
      },
      null,
      2,
    ),
  );

  if (report.passed !== report.total) {
    process.exitCode = 1;
  }
}
