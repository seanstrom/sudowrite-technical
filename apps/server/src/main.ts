import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { VoiceFailure } from "@app/voice-capture";
import { makeOpenRouterTranscriptionPort } from "@app/voice-capture/openrouter";
import type { VoiceTranscriptionPort } from "@app/voice-capture/server";

import { createServerRuntime } from "./runtime";

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

const runtime = await createServerRuntime({
  databasePath: resolve(process.env.DATABASE_PATH ?? "./data/speech-edit.sqlite"),
  migrationsFolder: process.env.MIGRATIONS_PATH ?? fileURLToPath(
    new URL("../../../packages/storage-sqlite/drizzle", import.meta.url),
  ),
  port: Number(process.env.SERVER_PORT ?? 3001),
  transcriptionPort: makeTranscriptionPort(),
});

await runtime.start();
console.log("Speech-to-Edit server ready at http://127.0.0.1:3001/rpc");

const stop = async () => {
  await runtime.dispose();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
