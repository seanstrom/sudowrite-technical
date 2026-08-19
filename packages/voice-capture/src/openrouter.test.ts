import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  VoiceAudioMime,
  VoiceFailureType,
  VoiceTranscriptionCommand,
  VoiceTranscriptionResultType,
  type VoiceTranscriptionRequest,
} from "./domain.ts";
import {
  DefaultOpenRouterTranscriptionEndpoint,
  makeOpenRouterTranscriptionPort,
} from "./openrouter.ts";
import { runVoiceTranscription } from "./server.ts";

const AudioBytes = Buffer.from("webm-audio");
const Request: VoiceTranscriptionRequest = {
  operationId: "operation-1",
  editorContext: {
    captureId: "capture-1",
    documentId: "document-1",
    documentFingerprint: "revision-1",
    hasSelection: false,
    selectionLength: 0,
  },
  audioBase64: AudioBytes.toString("base64"),
  mimeType: VoiceAudioMime.WebmOpus,
  durationMs: 1_200,
  byteLength: AudioBytes.byteLength,
};

describe("OpenRouter transcription adapter", () => {
  it("maps validated browser audio to the dedicated STT endpoint", async () => {
    const providerFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ text: "make this more vivid" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const port = makeOpenRouterTranscriptionPort({
      apiKey: "test-key",
      model: "openai/whisper-large-v3",
      language: "en",
      fetch: providerFetch,
    });
    const result = await Effect.runPromise(
      runVoiceTranscription(VoiceTranscriptionCommand.Transcribe(Request), port),
    );

    expect(result).toMatchObject({
      type: VoiceTranscriptionResultType.Transcribed,
      transcript: "make this more vivid",
    });
    expect(providerFetch).toHaveBeenCalledOnce();
    const [url, init] = providerFetch.mock.calls[0] ?? [];
    expect(url).toBe(DefaultOpenRouterTranscriptionEndpoint);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "openai/whisper-large-v3",
      input_audio: { data: Request.audioBase64, format: "webm" },
      language: "en",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("interrupts a timed-out fetch and returns a sanitized typed failure", async () => {
    const observedSignal: { current: AbortSignal | null } = { current: null };
    const providerFetch = vi.fn<typeof fetch>((_input, init) => {
      observedSignal.current = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal.current?.addEventListener("abort", () =>
          reject(new DOMException("secret provider body", "AbortError")),
        );
      });
    });
    const port = makeOpenRouterTranscriptionPort({
      apiKey: "sensitive-test-key",
      model: "openai/whisper-large-v3",
      fetch: providerFetch,
      timeoutMs: 1,
    });
    const result = await Effect.runPromise(
      runVoiceTranscription(VoiceTranscriptionCommand.Transcribe(Request), port),
    );

    expect(result).toMatchObject({
      type: VoiceTranscriptionResultType.Rejected,
      failure: { type: VoiceFailureType.ProviderTimedOut },
    });
    expect(observedSignal.current?.aborted).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sensitive-test-key");
    expect(JSON.stringify(result)).not.toContain("secret provider body");
  });

  it("does not expose provider response bodies through rejection data", async () => {
    const port = makeOpenRouterTranscriptionPort({
      apiKey: "test-key",
      model: "openai/whisper-large-v3",
      fetch: async () =>
        new Response("private upstream diagnostic", { status: 503 }),
    });
    const result = await Effect.runPromise(
      runVoiceTranscription(VoiceTranscriptionCommand.Transcribe(Request), port),
    );

    expect(result).toMatchObject({
      type: VoiceTranscriptionResultType.Rejected,
      failure: { type: VoiceFailureType.ProviderFailed, status: 503 },
    });
    expect(JSON.stringify(result)).not.toContain("private upstream diagnostic");
  });
});
