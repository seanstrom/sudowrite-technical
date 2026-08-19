import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { VoiceFailure } from "@app/voice-capture";
import { makeOpenRouterTranscriptionPort } from "@app/voice-capture/openrouter";
import type { VoiceTranscriptionPort } from "@app/voice-capture/server";
import { createTiptapMarkdownCodec } from "@app/editor";
import { SpeechCommandIntentType, SpeechTextScope } from "@app/speech-command";
import {
  makeOpenRouterClassifierPort,
  makeOpenRouterMarkdownRewriteProviderPort,
  makeOpenRouterSelectionRewritePort,
} from "@app/speech-command/openrouter";

import { createServerRuntime } from "./runtime";
import {
  makeSpeechInterpretationService,
  makeTiptapDocumentRewritePort,
  type SpeechInterpretationService,
} from "./speech-interpretation";

function makeTranscriptionPort(): VoiceTranscriptionPort {
  if (process.env.TRANSCRIPTION_MODE === "fake") {
    return { transcribe: () => Effect.succeed("Replace the selection with clearer prose") };
  }
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  return apiKey.length > 0
    ? makeOpenRouterTranscriptionPort({
        apiKey,
        model: process.env.OPENROUTER_STT_MODEL ?? "openai/whisper-large-v3",
        fetch,
      })
    : {
        transcribe: (request) =>
          Effect.fail(
            VoiceFailure.ProviderFailed(
              request.request.operationId,
              request.request.editorContext.captureId,
            ),
          ),
      };
}

function makeInterpretationRuntime(): Readonly<{
  service: SpeechInterpretationService;
  dispose: () => void;
}> {
  const codec = createTiptapMarkdownCodec();
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (process.env.INTERPRETATION_MODE === "fake" || process.env.TRANSCRIPTION_MODE === "fake") {
    const classifier = {
      classify: (request: Readonly<{ userPrompt: string }>) => {
        const payload = JSON.parse(request.userPrompt) as { transcript: string };
        const documentScope = /document|whole draft|entire draft/iu.test(payload.transcript);
        return Effect.succeed({
          kind: "Classified",
          intent: SpeechCommandIntentType.Rewrite,
          scope: documentScope ? SpeechTextScope.Document : SpeechTextScope.Selection,
          occurrence: null,
          mark: null,
          enabled: null,
          matchText: null,
          replacementText: null,
          insertionText: null,
          rewriteInstruction: payload.transcript,
          reason: null,
          clarification: null,
        });
      },
    };
    return {
      service: makeSpeechInterpretationService({
        classifier,
        selectionRewriter: {
          rewrite: (request) => {
            const literal = request.instruction.match(/replace (?:the )?selection with\s+(.+)$/iu)?.[1];
            return Effect.succeed(literal?.trim() || "Clearer revised prose");
          },
        },
        documentRewriter: makeTiptapDocumentRewritePort(
          { rewrite: () => Effect.succeed("# Revised draft\n\nClearer revised prose.") },
          codec,
        ),
      }),
      dispose: codec.dispose,
    };
  }

  const configuration = {
    apiKey,
    classifierModel: process.env.OPENROUTER_CLASSIFIER_MODEL ?? "openai/gpt-4o-mini",
    rewriteModel: process.env.OPENROUTER_REWRITE_MODEL ?? "openai/gpt-4o-mini",
    fetch,
  };
  return {
    service: makeSpeechInterpretationService({
      classifier: makeOpenRouterClassifierPort(configuration),
      selectionRewriter: makeOpenRouterSelectionRewritePort(configuration),
      documentRewriter: makeTiptapDocumentRewritePort(
        makeOpenRouterMarkdownRewriteProviderPort(configuration),
        codec,
      ),
    }),
    dispose: codec.dispose,
  };
}

const interpretation = makeInterpretationRuntime();

const runtime = await createServerRuntime({
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/speech-edit.sqlite"),
  migrationsFolder: process.env.MIGRATIONS_PATH ?? fileURLToPath(
    new URL("../../../packages/storage-sqlite/drizzle", import.meta.url),
  ),
  port: Number(process.env.SERVER_PORT ?? 3001),
  transcriptionPort: makeTranscriptionPort(),
  interpretationService: interpretation.service,
  disposeInterpretation: interpretation.dispose,
});

await runtime.start();
console.log("Speech-to-Edit server ready at http://127.0.0.1:3001/rpc");

const stop = async () => {
  await runtime.dispose();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
