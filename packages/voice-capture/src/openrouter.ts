import { Effect } from "effect";
import {
  VoiceCaptureLimits,
  VoiceFailure,
  type VoiceFailure as VoiceFailureValue,
} from "./domain.ts";
import type {
  ValidatedVoiceTranscriptionRequest,
  VoiceTranscriptionPort,
} from "./server.ts";

export type OpenRouterTranscriptionConfiguration = Readonly<{
  apiKey: string;
  model: string;
  fetch: typeof fetch;
  endpoint?: string;
  language?: string;
  timeoutMs?: number;
}>;

export const DefaultOpenRouterTranscriptionEndpoint =
  "https://openrouter.ai/api/v1/audio/transcriptions";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerFailure(
  request: ValidatedVoiceTranscriptionRequest,
  status: number | null = null,
): VoiceFailureValue {
  return VoiceFailure.ProviderFailed(
    request.request.operationId,
    request.request.editorContext.captureId,
    status,
  );
}

function transcribeWithOpenRouter(
  configuration: OpenRouterTranscriptionConfiguration,
  request: ValidatedVoiceTranscriptionRequest,
): Effect.Effect<string, VoiceFailureValue> {
  const operationId = request.request.operationId;
  const captureId = request.request.editorContext.captureId;
  if (configuration.apiKey.trim().length === 0) {
    return Effect.fail(providerFailure(request));
  }

  const body = {
    model: configuration.model,
    input_audio: {
      data: request.request.audioBase64,
      format: request.format,
    },
    ...(configuration.language === undefined
      ? {}
      : { language: configuration.language }),
  };

  return Effect.tryPromise({
    try: (signal) =>
      configuration.fetch(
        configuration.endpoint ?? DefaultOpenRouterTranscriptionEndpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${configuration.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        },
      ),
    catch: () => providerFailure(request),
  }).pipe(
    Effect.timeoutFail({
      duration: configuration.timeoutMs ?? 20_000,
      onTimeout: () => VoiceFailure.ProviderTimedOut(operationId, captureId),
    }),
    Effect.flatMap((response) =>
      response.ok
        ? Effect.succeed(response)
        : Effect.fail(providerFailure(request, response.status)),
    ),
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: () => VoiceFailure.InvalidProviderResponse(operationId, captureId),
      }),
    ),
    Effect.flatMap((response) => {
      const transcript = isRecord(response) ? response.text : null;
      return typeof transcript === "string" &&
        transcript.trim().length > 0 &&
        transcript.length <= VoiceCaptureLimits.MaximumTranscriptLength
        ? Effect.succeed(transcript.trim())
        : Effect.fail(
            VoiceFailure.InvalidProviderResponse(operationId, captureId),
          );
    }),
  );
}

export function makeOpenRouterTranscriptionPort(
  configuration: OpenRouterTranscriptionConfiguration,
): VoiceTranscriptionPort {
  return {
    transcribe: (request) =>
      transcribeWithOpenRouter(configuration, request),
  };
}
