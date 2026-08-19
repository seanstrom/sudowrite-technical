export const VoiceCaptureLimits = {
  MaximumDurationMs: 30_000,
  MaximumAudioBytes: 6 * 1024 * 1024,
  PreferredAudioBitsPerSecond: 64_000,
  MaximumIdentifierLength: 128,
  MaximumTranscriptLength: 16_000,
} as const;

export const VoiceAudioMime = {
  WebmOpus: "audio/webm;codecs=opus",
  Webm: "audio/webm",
  OggOpus: "audio/ogg;codecs=opus",
  Mp4: "audio/mp4",
  Wav: "audio/wav",
} as const;

export type VoiceAudioMime =
  (typeof VoiceAudioMime)[keyof typeof VoiceAudioMime];

export const VoiceAudioFormat = {
  Webm: "webm",
  Ogg: "ogg",
  M4a: "m4a",
  Wav: "wav",
} as const;

export type VoiceAudioFormat =
  (typeof VoiceAudioFormat)[keyof typeof VoiceAudioFormat];

export const VoiceAudioMimePreference = [
  VoiceAudioMime.WebmOpus,
  VoiceAudioMime.OggOpus,
  VoiceAudioMime.Mp4,
  VoiceAudioMime.Webm,
  VoiceAudioMime.Wav,
] as const;

export function voiceAudioFormatForMime(
  mimeType: VoiceAudioMime,
): VoiceAudioFormat {
  switch (mimeType) {
    case VoiceAudioMime.WebmOpus:
    case VoiceAudioMime.Webm:
      return VoiceAudioFormat.Webm;
    case VoiceAudioMime.OggOpus:
      return VoiceAudioFormat.Ogg;
    case VoiceAudioMime.Mp4:
      return VoiceAudioFormat.M4a;
    case VoiceAudioMime.Wav:
      return VoiceAudioFormat.Wav;
    default:
      mimeType satisfies never;
      return VoiceAudioFormat.Webm;
  }
}

export type VoiceEditorContextMetadata = Readonly<{
  captureId: string;
  documentId: string;
  documentFingerprint: string;
  hasSelection: boolean;
  selectionLength: number;
}>;

export type StartVoiceCaptureInput = Readonly<{
  operationId: string;
  editorContext: VoiceEditorContextMetadata;
}>;

export type VoiceTranscriptionRequest = Readonly<{
  operationId: string;
  editorContext: VoiceEditorContextMetadata;
  audioBase64: string;
  mimeType: VoiceAudioMime;
  durationMs: number;
  byteLength: number;
}>;

export const VoiceFailureType = {
  InvalidRequest: "InvalidRequest",
  PermissionDenied: "PermissionDenied",
  UnsupportedMime: "UnsupportedMime",
  CaptureFailed: "CaptureFailed",
  AudioTooLarge: "AudioTooLarge",
  DurationExceeded: "DurationExceeded",
  ProviderFailed: "ProviderFailed",
  ProviderTimedOut: "ProviderTimedOut",
  InvalidProviderResponse: "InvalidProviderResponse",
} as const;

type VoiceFailureBase = Readonly<{
  operationId: string;
  captureId: string;
  message: string;
}>;

type InvalidRequestFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.InvalidRequest }>;
type PermissionDeniedFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.PermissionDenied }>;
type UnsupportedMimeFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.UnsupportedMime }>;
type CaptureFailedFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.CaptureFailed }>;
type AudioTooLargeFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.AudioTooLarge }>;
type DurationExceededFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.DurationExceeded }>;
type ProviderFailedFailure = VoiceFailureBase &
  Readonly<{
    type: typeof VoiceFailureType.ProviderFailed;
    status: number | null;
  }>;
type ProviderTimedOutFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.ProviderTimedOut }>;
type InvalidProviderResponseFailure = VoiceFailureBase &
  Readonly<{ type: typeof VoiceFailureType.InvalidProviderResponse }>;

export const VoiceFailure = {
  InvalidRequest: (
    operationId: string,
    captureId: string,
    message: string,
  ): InvalidRequestFailure => ({
    type: VoiceFailureType.InvalidRequest,
    operationId,
    captureId,
    message,
  }),
  PermissionDenied: (
    operationId: string,
    captureId: string,
  ): PermissionDeniedFailure => ({
    type: VoiceFailureType.PermissionDenied,
    operationId,
    captureId,
    message: "Microphone permission was denied.",
  }),
  UnsupportedMime: (
    operationId: string,
    captureId: string,
  ): UnsupportedMimeFailure => ({
    type: VoiceFailureType.UnsupportedMime,
    operationId,
    captureId,
    message: "No supported recording format is available.",
  }),
  CaptureFailed: (
    operationId: string,
    captureId: string,
    message = "Voice capture failed.",
  ): CaptureFailedFailure => ({
    type: VoiceFailureType.CaptureFailed,
    operationId,
    captureId,
    message,
  }),
  AudioTooLarge: (
    operationId: string,
    captureId: string,
  ): AudioTooLargeFailure => ({
    type: VoiceFailureType.AudioTooLarge,
    operationId,
    captureId,
    message: "The recording is too large. Try a shorter recording.",
  }),
  DurationExceeded: (
    operationId: string,
    captureId: string,
  ): DurationExceededFailure => ({
    type: VoiceFailureType.DurationExceeded,
    operationId,
    captureId,
    message: "The recording exceeded the allowed duration.",
  }),
  ProviderFailed: (
    operationId: string,
    captureId: string,
    status: number | null = null,
  ): ProviderFailedFailure => ({
    type: VoiceFailureType.ProviderFailed,
    operationId,
    captureId,
    message: "The transcription provider could not complete the request.",
    status,
  }),
  ProviderTimedOut: (
    operationId: string,
    captureId: string,
  ): ProviderTimedOutFailure => ({
    type: VoiceFailureType.ProviderTimedOut,
    operationId,
    captureId,
    message: "The transcription provider timed out.",
  }),
  InvalidProviderResponse: (
    operationId: string,
    captureId: string,
  ): InvalidProviderResponseFailure => ({
    type: VoiceFailureType.InvalidProviderResponse,
    operationId,
    captureId,
    message: "The transcription provider returned an invalid response.",
  }),
} as const;

export type VoiceFailure = ReturnType<
  (typeof VoiceFailure)[keyof typeof VoiceFailure]
>;

export const VoiceCaptureOutcomeType = {
  Recorded: "Recorded",
  Cancelled: "Cancelled",
  Failed: "Failed",
  Disposed: "Disposed",
} as const;

type RecordedVoiceCapture = Readonly<{
  type: typeof VoiceCaptureOutcomeType.Recorded;
  request: VoiceTranscriptionRequest;
}>;
type CancelledVoiceCapture = Readonly<{
  type: typeof VoiceCaptureOutcomeType.Cancelled;
  operationId: string;
  captureId: string;
}>;
type FailedVoiceCapture = Readonly<{
  type: typeof VoiceCaptureOutcomeType.Failed;
  failure: VoiceFailure;
}>;
type DisposedVoiceCapture = Readonly<{
  type: typeof VoiceCaptureOutcomeType.Disposed;
}>;

export const VoiceCaptureOutcome = {
  Recorded: (request: VoiceTranscriptionRequest): RecordedVoiceCapture => ({
    type: VoiceCaptureOutcomeType.Recorded,
    request,
  }),
  Cancelled: (
    operationId: string,
    captureId: string,
  ): CancelledVoiceCapture => ({
    type: VoiceCaptureOutcomeType.Cancelled,
    operationId,
    captureId,
  }),
  Failed: (failure: VoiceFailure): FailedVoiceCapture => ({
    type: VoiceCaptureOutcomeType.Failed,
    failure,
  }),
  Disposed: (): DisposedVoiceCapture => ({
    type: VoiceCaptureOutcomeType.Disposed,
  }),
} as const;

export type VoiceCaptureOutcome = ReturnType<
  (typeof VoiceCaptureOutcome)[keyof typeof VoiceCaptureOutcome]
>;

export const VoiceTranscriptionCommandType = {
  Transcribe: "Transcribe",
  Cancel: "Cancel",
} as const;

type TranscribeVoice = Readonly<{
  type: typeof VoiceTranscriptionCommandType.Transcribe;
  request: VoiceTranscriptionRequest;
}>;
type CancelVoiceTranscription = Readonly<{
  type: typeof VoiceTranscriptionCommandType.Cancel;
  operationId: string;
  captureId: string;
}>;

export const VoiceTranscriptionCommand = {
  Transcribe: (request: VoiceTranscriptionRequest): TranscribeVoice => ({
    type: VoiceTranscriptionCommandType.Transcribe,
    request,
  }),
  Cancel: (
    operationId: string,
    captureId: string,
  ): CancelVoiceTranscription => ({
    type: VoiceTranscriptionCommandType.Cancel,
    operationId,
    captureId,
  }),
} as const;

export type VoiceTranscriptionCommand = ReturnType<
  (typeof VoiceTranscriptionCommand)[keyof typeof VoiceTranscriptionCommand]
>;

export const VoiceTranscriptionResultType = {
  Transcribed: "Transcribed",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
} as const;

type TranscribedVoice = Readonly<{
  type: typeof VoiceTranscriptionResultType.Transcribed;
  operationId: string;
  captureId: string;
  transcript: string;
}>;
type RejectedVoiceTranscription = Readonly<{
  type: typeof VoiceTranscriptionResultType.Rejected;
  failure: VoiceFailure;
}>;
type CancelledVoiceTranscription = Readonly<{
  type: typeof VoiceTranscriptionResultType.Cancelled;
  operationId: string;
  captureId: string;
}>;

export const VoiceTranscriptionResult = {
  Transcribed: (
    operationId: string,
    captureId: string,
    transcript: string,
  ): TranscribedVoice => ({
    type: VoiceTranscriptionResultType.Transcribed,
    operationId,
    captureId,
    transcript,
  }),
  Rejected: (failure: VoiceFailure): RejectedVoiceTranscription => ({
    type: VoiceTranscriptionResultType.Rejected,
    failure,
  }),
  Cancelled: (
    operationId: string,
    captureId: string,
  ): CancelledVoiceTranscription => ({
    type: VoiceTranscriptionResultType.Cancelled,
    operationId,
    captureId,
  }),
} as const;

export type VoiceTranscriptionResult = ReturnType<
  (typeof VoiceTranscriptionResult)[keyof typeof VoiceTranscriptionResult]
>;
