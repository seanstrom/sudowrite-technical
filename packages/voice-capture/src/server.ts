import { Effect } from "effect";
import {
  VoiceAudioMime,
  VoiceCaptureLimits,
  VoiceFailure,
  VoiceTranscriptionCommandType,
  VoiceTranscriptionResult,
  voiceAudioFormatForMime,
  type VoiceAudioFormat,
  type VoiceAudioMime as VoiceAudioMimeValue,
  type VoiceFailure as VoiceFailureValue,
  type VoiceTranscriptionCommand,
  type VoiceTranscriptionRequest,
  type VoiceTranscriptionResult as VoiceTranscriptionResultValue,
} from "./domain.ts";

export type ValidatedVoiceTranscriptionRequest = Readonly<{
  request: VoiceTranscriptionRequest;
  audioBytes: Uint8Array;
  format: VoiceAudioFormat;
}>;

export const VoiceRequestValidationType = {
  Accepted: "Accepted",
  Rejected: "Rejected",
} as const;

type AcceptedVoiceRequest = Readonly<{
  type: typeof VoiceRequestValidationType.Accepted;
  value: ValidatedVoiceTranscriptionRequest;
}>;
type RejectedVoiceRequest = Readonly<{
  type: typeof VoiceRequestValidationType.Rejected;
  failure: VoiceFailureValue;
}>;

export const VoiceRequestValidation = {
  Accepted: (
    value: ValidatedVoiceTranscriptionRequest,
  ): AcceptedVoiceRequest => ({
    type: VoiceRequestValidationType.Accepted,
    value,
  }),
  Rejected: (failure: VoiceFailureValue): RejectedVoiceRequest => ({
    type: VoiceRequestValidationType.Rejected,
    failure,
  }),
} as const;

export type VoiceRequestValidation = ReturnType<
  (typeof VoiceRequestValidation)[keyof typeof VoiceRequestValidation]
>;

export type VoiceBase64Decoder = (
  encoded: string,
) => Uint8Array | null;

export type VoiceTranscriptionPort = Readonly<{
  transcribe: (
    request: ValidatedVoiceTranscriptionRequest,
  ) => Effect.Effect<string, VoiceFailureValue>;
}>;

const IdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isBoundedIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= VoiceCaptureLimits.MaximumIdentifierLength &&
    IdentifierPattern.test(value)
  );
}

function isVoiceAudioMime(value: string): value is VoiceAudioMimeValue {
  return Object.values(VoiceAudioMime).some((mimeType) => mimeType === value);
}

export function decodeBase64Strict(encoded: string): Uint8Array | null {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    return null;
  }

  const bytes = Buffer.from(encoded, "base64");
  return bytes.toString("base64") === encoded ? new Uint8Array(bytes) : null;
}

export function validateVoiceTranscriptionRequest(
  request: VoiceTranscriptionRequest,
  decodeBase64: VoiceBase64Decoder = decodeBase64Strict,
): VoiceRequestValidation {
  const { operationId, editorContext } = request;
  const captureId = editorContext.captureId;
  const reject = (message: string): VoiceRequestValidation =>
    VoiceRequestValidation.Rejected(
      VoiceFailure.InvalidRequest(operationId, captureId, message),
    );

  if (
    !isBoundedIdentifier(operationId) ||
    !isBoundedIdentifier(captureId) ||
    !isBoundedIdentifier(editorContext.documentId) ||
    !isBoundedIdentifier(editorContext.documentFingerprint)
  ) {
    return reject("Voice request identity is invalid.");
  }
  if (
    !Number.isSafeInteger(editorContext.selectionLength) ||
    editorContext.selectionLength < 0 ||
    editorContext.selectionLength > 1_000_000 ||
    editorContext.hasSelection !== (editorContext.selectionLength > 0)
  ) {
    return reject("Voice editor context is inconsistent.");
  }
  if (!isVoiceAudioMime(request.mimeType)) {
    return VoiceRequestValidation.Rejected(
      VoiceFailure.UnsupportedMime(operationId, captureId),
    );
  }
  if (
    !Number.isFinite(request.durationMs) ||
    request.durationMs <= 0 ||
    request.durationMs > VoiceCaptureLimits.MaximumDurationMs
  ) {
    return VoiceRequestValidation.Rejected(
      VoiceFailure.DurationExceeded(operationId, captureId),
    );
  }
  if (
    !Number.isSafeInteger(request.byteLength) ||
    request.byteLength <= 0 ||
    request.byteLength > VoiceCaptureLimits.MaximumAudioBytes
  ) {
    return VoiceRequestValidation.Rejected(
      VoiceFailure.AudioTooLarge(operationId, captureId),
    );
  }

  const audioBytes = decodeBase64(request.audioBase64);
  if (audioBytes === null || audioBytes.byteLength !== request.byteLength) {
    return reject("Voice audio encoding does not match its declared size.");
  }

  return VoiceRequestValidation.Accepted({
    request,
    audioBytes,
    format: voiceAudioFormatForMime(request.mimeType),
  });
}

function validateCancellationIdentity(
  operationId: string,
  captureId: string,
): VoiceFailureValue | null {
  return isBoundedIdentifier(operationId) && isBoundedIdentifier(captureId)
    ? null
    : VoiceFailure.InvalidRequest(
        operationId,
        captureId,
        "Voice cancellation identity is invalid.",
      );
}

export function runVoiceTranscription(
  command: VoiceTranscriptionCommand,
  port: VoiceTranscriptionPort,
): Effect.Effect<VoiceTranscriptionResultValue> {
  switch (command.type) {
    case VoiceTranscriptionCommandType.Transcribe: {
      const validation = validateVoiceTranscriptionRequest(command.request);
      if (validation.type === VoiceRequestValidationType.Rejected) {
        return Effect.succeed(
          VoiceTranscriptionResult.Rejected(validation.failure),
        );
      }

      const { operationId, editorContext } = command.request;
      return port.transcribe(validation.value).pipe(
        Effect.map((transcript) =>
          VoiceTranscriptionResult.Transcribed(
            operationId,
            editorContext.captureId,
            transcript,
          ),
        ),
        Effect.catchAll((failure) =>
          Effect.succeed(VoiceTranscriptionResult.Rejected(failure)),
        ),
      );
    }
    case VoiceTranscriptionCommandType.Cancel: {
      const failure = validateCancellationIdentity(
        command.operationId,
        command.captureId,
      );
      return Effect.succeed(
        failure === null
          ? VoiceTranscriptionResult.Cancelled(
              command.operationId,
              command.captureId,
            )
          : VoiceTranscriptionResult.Rejected(failure),
      );
    }
    default:
      command satisfies never;
      return Effect.succeed(
        VoiceTranscriptionResult.Rejected(
          VoiceFailure.InvalidRequest("unknown", "unknown", "Invalid command."),
        ),
      );
  }
}
