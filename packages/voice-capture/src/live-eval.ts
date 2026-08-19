import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Effect } from "effect";
import {
  VoiceAudioMime,
  VoiceTranscriptionCommand,
  VoiceTranscriptionResultType,
  type VoiceAudioMime as VoiceAudioMimeValue,
  type VoiceTranscriptionRequest,
} from "./domain.ts";
import { makeOpenRouterTranscriptionPort } from "./openrouter.ts";
import { runVoiceTranscription } from "./server.ts";

const MimeByExtension: Readonly<Record<string, VoiceAudioMimeValue>> = {
  ".webm": VoiceAudioMime.Webm,
  ".ogg": VoiceAudioMime.OggOpus,
  ".m4a": VoiceAudioMime.Mp4,
  ".mp4": VoiceAudioMime.Mp4,
  ".wav": VoiceAudioMime.Wav,
};

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const fixturePath = process.env.VOICE_TRANSCRIPTION_FIXTURE;
  if (apiKey === undefined || apiKey.length === 0) {
    console.log("Live transcription skipped: OPENROUTER_API_KEY is absent.");
    return;
  }
  if (fixturePath === undefined || fixturePath.length === 0) {
    console.log("Live transcription skipped: VOICE_TRANSCRIPTION_FIXTURE is absent.");
    return;
  }

  const mimeType = MimeByExtension[extname(fixturePath).toLowerCase()];
  if (mimeType === undefined) {
    console.log("Live transcription skipped: fixture format is unsupported.");
    return;
  }

  const bytes = await readFile(fixturePath);
  const request: VoiceTranscriptionRequest = {
    operationId: "live-evaluation",
    editorContext: {
      captureId: "live-capture",
      documentId: "live-document",
      documentFingerprint: "live-fingerprint",
      hasSelection: false,
      selectionLength: 0,
    },
    audioBase64: bytes.toString("base64"),
    mimeType,
    durationMs: 1,
    byteLength: bytes.byteLength,
  };
  const port = makeOpenRouterTranscriptionPort({
    apiKey,
    model: process.env.OPENROUTER_STT_MODEL ?? "openai/whisper-large-v3",
    fetch,
  });
  const result = await Effect.runPromise(
    runVoiceTranscription(VoiceTranscriptionCommand.Transcribe(request), port),
  );
  switch (result.type) {
    case VoiceTranscriptionResultType.Transcribed:
      console.log("Live transcription succeeded.");
      return;
    case VoiceTranscriptionResultType.Rejected:
      console.log(`Live transcription finished with ${result.failure.type}.`);
      return;
    case VoiceTranscriptionResultType.Cancelled:
      console.log("Live transcription was cancelled.");
      return;
    default:
      result satisfies never;
      return;
  }
}

void main();
