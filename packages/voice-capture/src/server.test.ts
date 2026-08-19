import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  VoiceAudioMime,
  VoiceCaptureLimits,
  VoiceFailureType,
  VoiceTranscriptionCommand,
  VoiceTranscriptionResultType,
  type VoiceTranscriptionRequest,
} from "./domain.ts";
import {
  VoiceRequestValidationType,
  runVoiceTranscription,
  validateVoiceTranscriptionRequest,
  type VoiceTranscriptionPort,
} from "./server.ts";

function makeRequest(
  overrides: Partial<VoiceTranscriptionRequest> = {},
): VoiceTranscriptionRequest {
  const bytes = Buffer.from("voice-audio");
  return {
    operationId: "operation-1",
    editorContext: {
      captureId: "capture-1",
      documentId: "document-1",
      documentFingerprint: "revision-1",
      hasSelection: false,
      selectionLength: 0,
    },
    audioBase64: bytes.toString("base64"),
    mimeType: VoiceAudioMime.WebmOpus,
    durationMs: 800,
    byteLength: bytes.byteLength,
    ...overrides,
  };
}

describe("voice transcription server boundary", () => {
  it("decodes, validates, and delegates a valid request", async () => {
    const transcribe = vi.fn<VoiceTranscriptionPort["transcribe"]>(() =>
      Effect.succeed("replace the selected sentence"),
    );
    const result = await Effect.runPromise(
      runVoiceTranscription(
        VoiceTranscriptionCommand.Transcribe(makeRequest()),
        { transcribe },
      ),
    );

    expect(result).toEqual({
      type: VoiceTranscriptionResultType.Transcribed,
      operationId: "operation-1",
      captureId: "capture-1",
      transcript: "replace the selected sentence",
    });
    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({
      format: "webm",
      audioBytes: new Uint8Array(Buffer.from("voice-audio")),
    });
  });

  it("rejects unsupported MIME, oversize, duration, and mismatched bytes", () => {
    const unsupported = validateVoiceTranscriptionRequest(
      makeRequest({ mimeType: "audio/x-private" as VoiceAudioMime }),
    );
    const oversized = validateVoiceTranscriptionRequest(
      makeRequest({ byteLength: VoiceCaptureLimits.MaximumAudioBytes + 1 }),
    );
    const tooLong = validateVoiceTranscriptionRequest(
      makeRequest({ durationMs: VoiceCaptureLimits.MaximumDurationMs + 1 }),
    );
    const mismatched = validateVoiceTranscriptionRequest(
      makeRequest({ byteLength: 2 }),
    );

    expect(unsupported).toMatchObject({
      type: VoiceRequestValidationType.Rejected,
      failure: { type: VoiceFailureType.UnsupportedMime },
    });
    expect(oversized).toMatchObject({
      type: VoiceRequestValidationType.Rejected,
      failure: { type: VoiceFailureType.AudioTooLarge },
    });
    expect(tooLong).toMatchObject({
      type: VoiceRequestValidationType.Rejected,
      failure: { type: VoiceFailureType.DurationExceeded },
    });
    expect(mismatched).toMatchObject({
      type: VoiceRequestValidationType.Rejected,
      failure: { type: VoiceFailureType.InvalidRequest },
    });
  });

  it("validates cancellation identity without invoking the provider", async () => {
    const transcribe = vi.fn<VoiceTranscriptionPort["transcribe"]>(() =>
      Effect.succeed("unused"),
    );
    const result = await Effect.runPromise(
      runVoiceTranscription(
        VoiceTranscriptionCommand.Cancel("operation-1", "capture-1"),
        { transcribe },
      ),
    );

    expect(result).toEqual({
      type: VoiceTranscriptionResultType.Cancelled,
      operationId: "operation-1",
      captureId: "capture-1",
    });
    expect(transcribe).not.toHaveBeenCalled();
  });
});
