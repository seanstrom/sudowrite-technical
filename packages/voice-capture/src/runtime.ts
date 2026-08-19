import {
  VoiceAudioMimePreference,
  VoiceCaptureLimits,
  VoiceCaptureOutcome,
  VoiceFailure,
  type StartVoiceCaptureInput,
  type VoiceAudioMime,
  type VoiceCaptureOutcome as VoiceCaptureOutcomeValue,
  type VoiceTranscriptionRequest,
} from "./domain.ts";

export const VoiceCapturePhase = {
  Idle: "Idle",
  Acquiring: "Acquiring",
  Recording: "Recording",
  Stopping: "Stopping",
  Disposed: "Disposed",
} as const;

export type VoiceCapturePhase =
  (typeof VoiceCapturePhase)[keyof typeof VoiceCapturePhase];

export const VoiceCaptureActionType = {
  StartRequested: "StartRequested",
  StopRequested: "StopRequested",
  CancelRequested: "CancelRequested",
  DisposeRequested: "DisposeRequested",
  ChunkReceived: "ChunkReceived",
  RecorderStopped: "RecorderStopped",
  RecorderFailed: "RecorderFailed",
  DurationElapsed: "DurationElapsed",
} as const;

type StartRequested = Readonly<{
  type: typeof VoiceCaptureActionType.StartRequested;
  input: StartVoiceCaptureInput;
}>;
type StopRequested = Readonly<{
  type: typeof VoiceCaptureActionType.StopRequested;
}>;
type CancelRequested = Readonly<{
  type: typeof VoiceCaptureActionType.CancelRequested;
}>;
type DisposeRequested = Readonly<{
  type: typeof VoiceCaptureActionType.DisposeRequested;
}>;
type ChunkReceived = Readonly<{
  type: typeof VoiceCaptureActionType.ChunkReceived;
  generation: number;
  chunk: Blob;
}>;
type RecorderStopped = Readonly<{
  type: typeof VoiceCaptureActionType.RecorderStopped;
  generation: number;
}>;
type RecorderFailed = Readonly<{
  type: typeof VoiceCaptureActionType.RecorderFailed;
  generation: number;
}>;
type DurationElapsed = Readonly<{
  type: typeof VoiceCaptureActionType.DurationElapsed;
  generation: number;
}>;

export const VoiceCaptureAction = {
  StartRequested: (input: StartVoiceCaptureInput): StartRequested => ({
    type: VoiceCaptureActionType.StartRequested,
    input,
  }),
  StopRequested: (): StopRequested => ({
    type: VoiceCaptureActionType.StopRequested,
  }),
  CancelRequested: (): CancelRequested => ({
    type: VoiceCaptureActionType.CancelRequested,
  }),
  DisposeRequested: (): DisposeRequested => ({
    type: VoiceCaptureActionType.DisposeRequested,
  }),
  ChunkReceived: (generation: number, chunk: Blob): ChunkReceived => ({
    type: VoiceCaptureActionType.ChunkReceived,
    generation,
    chunk,
  }),
  RecorderStopped: (generation: number): RecorderStopped => ({
    type: VoiceCaptureActionType.RecorderStopped,
    generation,
  }),
  RecorderFailed: (generation: number): RecorderFailed => ({
    type: VoiceCaptureActionType.RecorderFailed,
    generation,
  }),
  DurationElapsed: (generation: number): DurationElapsed => ({
    type: VoiceCaptureActionType.DurationElapsed,
    generation,
  }),
} as const;

export type VoiceCaptureAction = ReturnType<
  (typeof VoiceCaptureAction)[keyof typeof VoiceCaptureAction]
>;

export type VoiceAudioStream = Readonly<{
  stopTracks: () => void;
}>;

export type VoiceRecorderListeners = Readonly<{
  onChunk: (chunk: Blob) => void;
  onStopped: () => void;
  onFailed: () => void;
}>;

export type VoiceMediaRecorder = Readonly<{
  mimeType: string;
  start: () => void;
  requestData: () => void;
  stop: () => void;
  dispose: () => void;
}>;

export type VoiceCaptureCapabilities = Readonly<{
  getAudioStream: () => Promise<VoiceAudioStream>;
  supportsMimeType: (mimeType: VoiceAudioMime) => boolean;
  makeRecorder: (
    stream: VoiceAudioStream,
    mimeType: VoiceAudioMime,
    listeners: VoiceRecorderListeners,
  ) => VoiceMediaRecorder;
  encodeBlobBase64: (blob: Blob) => Promise<string>;
  now: () => number;
  setTimeout: (callback: () => void, durationMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}>;

export type VoiceCaptureRuntimeState = {
  phase: VoiceCapturePhase;
  generation: number;
  input: StartVoiceCaptureInput | null;
  selectedMimeType: VoiceAudioMime | null;
  stream: VoiceAudioStream | null;
  recorder: VoiceMediaRecorder | null;
  chunks: Array<Blob>;
  byteLength: number;
  startedAtMs: number;
  timer: unknown;
  disposed: boolean;
  capabilities: VoiceCaptureCapabilities;
  emit: (outcome: VoiceCaptureOutcomeValue) => void | Promise<void>;
};

function makeVoiceCaptureRuntimeState(
  capabilities: VoiceCaptureCapabilities,
  emit: VoiceCaptureRuntimeState["emit"],
): VoiceCaptureRuntimeState {
  return {
    phase: VoiceCapturePhase.Idle,
    generation: 0,
    input: null,
    selectedMimeType: null,
    stream: null,
    recorder: null,
    chunks: [],
    byteLength: 0,
    startedAtMs: 0,
    timer: null,
    disposed: false,
    capabilities,
    emit,
  };
}

function publishOutcome(
  mutState: VoiceCaptureRuntimeState,
  outcome: VoiceCaptureOutcomeValue,
): void {
  void Promise.resolve(mutState.emit(outcome));
}

function selectSupportedMimeType(
  capabilities: VoiceCaptureCapabilities,
): VoiceAudioMime | null {
  return (
    VoiceAudioMimePreference.find((mimeType) =>
      capabilities.supportsMimeType(mimeType),
    ) ?? null
  );
}

function clearCaptureTimer(mutState: VoiceCaptureRuntimeState): void {
  if (mutState.timer !== null) {
    mutState.capabilities.clearTimeout(mutState.timer);
    mutState.timer = null;
  }
}

function releaseCaptureResources(mutState: VoiceCaptureRuntimeState): void {
  clearCaptureTimer(mutState);
  mutState.recorder?.dispose();
  mutState.stream?.stopTracks();
  mutState.recorder = null;
  mutState.stream = null;
}

function resetCapture(mutState: VoiceCaptureRuntimeState): void {
  releaseCaptureResources(mutState);
  mutState.input = null;
  mutState.selectedMimeType = null;
  mutState.chunks = [];
  mutState.byteLength = 0;
  mutState.startedAtMs = 0;
  mutState.phase = mutState.disposed
    ? VoiceCapturePhase.Disposed
    : VoiceCapturePhase.Idle;
}

function rejectCapture(
  mutState: VoiceCaptureRuntimeState,
  failure: ReturnType<(typeof VoiceFailure)[keyof typeof VoiceFailure]>,
): void {
  mutState.generation += 1;
  const recorder = mutState.recorder;
  resetCapture(mutState);
  try {
    recorder?.stop();
  } catch {
    // The failure is already represented as data and resources are released.
  }
  publishOutcome(mutState, VoiceCaptureOutcome.Failed(failure));
}

function isPermissionFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

async function acquireCaptureResources(
  mutState: VoiceCaptureRuntimeState,
  input: StartVoiceCaptureInput,
  generation: number,
  mimeType: VoiceAudioMime,
): Promise<void> {
  try {
    const stream = await mutState.capabilities.getAudioStream();
    if (
      mutState.disposed ||
      mutState.generation !== generation ||
      mutState.phase !== VoiceCapturePhase.Acquiring
    ) {
      stream.stopTracks();
      return;
    }

    const recorder = mutState.capabilities.makeRecorder(stream, mimeType, {
      onChunk: (chunk) =>
        receiveVoiceCaptureAction(
          mutState,
          VoiceCaptureAction.ChunkReceived(generation, chunk),
        ),
      onStopped: () =>
        receiveVoiceCaptureAction(
          mutState,
          VoiceCaptureAction.RecorderStopped(generation),
        ),
      onFailed: () =>
        receiveVoiceCaptureAction(
          mutState,
          VoiceCaptureAction.RecorderFailed(generation),
        ),
    });

    mutState.stream = stream;
    mutState.recorder = recorder;
    mutState.startedAtMs = mutState.capabilities.now();
    mutState.phase = VoiceCapturePhase.Recording;
    recorder.start();
    mutState.timer = mutState.capabilities.setTimeout(
      () =>
        receiveVoiceCaptureAction(
          mutState,
          VoiceCaptureAction.DurationElapsed(generation),
        ),
      VoiceCaptureLimits.MaximumDurationMs,
    );
  } catch (error) {
    if (mutState.generation !== generation) return;
    const failure = isPermissionFailure(error)
      ? VoiceFailure.PermissionDenied(
          input.operationId,
          input.editorContext.captureId,
        )
      : VoiceFailure.CaptureFailed(
          input.operationId,
          input.editorContext.captureId,
        );
    rejectCapture(mutState, failure);
  }
}

function startCapture(
  mutState: VoiceCaptureRuntimeState,
  input: StartVoiceCaptureInput,
): void {
  if (mutState.disposed || mutState.phase !== VoiceCapturePhase.Idle) return;

  const mimeType = selectSupportedMimeType(mutState.capabilities);
  if (mimeType === null) {
    publishOutcome(
      mutState,
      VoiceCaptureOutcome.Failed(
        VoiceFailure.UnsupportedMime(
          input.operationId,
          input.editorContext.captureId,
        ),
      ),
    );
    return;
  }

  mutState.generation += 1;
  const generation = mutState.generation;
  mutState.phase = VoiceCapturePhase.Acquiring;
  mutState.input = input;
  mutState.selectedMimeType = mimeType;
  mutState.chunks = [];
  mutState.byteLength = 0;
  void acquireCaptureResources(mutState, input, generation, mimeType);
}

function requestCaptureStop(mutState: VoiceCaptureRuntimeState): void {
  if (mutState.phase !== VoiceCapturePhase.Recording) return;
  mutState.phase = VoiceCapturePhase.Stopping;
  clearCaptureTimer(mutState);
  try {
    mutState.recorder?.requestData();
    mutState.recorder?.stop();
  } catch {
    const input = mutState.input;
    if (input !== null) {
      rejectCapture(
        mutState,
        VoiceFailure.CaptureFailed(
          input.operationId,
          input.editorContext.captureId,
        ),
      );
    }
  }
}

function cancelCapture(mutState: VoiceCaptureRuntimeState): void {
  const input = mutState.input;
  if (input === null) return;
  mutState.generation += 1;
  const recorder = mutState.recorder;
  resetCapture(mutState);
  try {
    recorder?.stop();
  } catch {
    // Cancellation is already complete after resource release.
  }
  publishOutcome(
    mutState,
    VoiceCaptureOutcome.Cancelled(
      input.operationId,
      input.editorContext.captureId,
    ),
  );
}

function acceptCaptureChunk(
  mutState: VoiceCaptureRuntimeState,
  generation: number,
  chunk: Blob,
): void {
  if (
    generation !== mutState.generation ||
    (mutState.phase !== VoiceCapturePhase.Recording &&
      mutState.phase !== VoiceCapturePhase.Stopping) ||
    chunk.size === 0
  ) {
    return;
  }

  mutState.byteLength += chunk.size;
  if (mutState.byteLength > VoiceCaptureLimits.MaximumAudioBytes) {
    const input = mutState.input;
    if (input !== null) {
      rejectCapture(
        mutState,
        VoiceFailure.AudioTooLarge(
          input.operationId,
          input.editorContext.captureId,
        ),
      );
    }
    return;
  }
  mutState.chunks.push(chunk);
}

async function finishCapture(
  mutState: VoiceCaptureRuntimeState,
  generation: number,
): Promise<void> {
  if (
    generation !== mutState.generation ||
    mutState.phase !== VoiceCapturePhase.Stopping
  ) {
    return;
  }

  const input = mutState.input;
  const mimeType = mutState.selectedMimeType;
  if (input === null || mimeType === null) return;

  const durationMs = Math.max(
    1,
    Math.round(mutState.capabilities.now() - mutState.startedAtMs),
  );
  const blob = new Blob(mutState.chunks, { type: mimeType });

  if (durationMs > VoiceCaptureLimits.MaximumDurationMs) {
    rejectCapture(
      mutState,
      VoiceFailure.DurationExceeded(
        input.operationId,
        input.editorContext.captureId,
      ),
    );
    return;
  }
  if (
    blob.size === 0 ||
    blob.size > VoiceCaptureLimits.MaximumAudioBytes ||
    blob.size !== mutState.byteLength
  ) {
    rejectCapture(
      mutState,
      VoiceFailure.AudioTooLarge(
        input.operationId,
        input.editorContext.captureId,
      ),
    );
    return;
  }

  try {
    const audioBase64 = await mutState.capabilities.encodeBlobBase64(blob);
    if (generation !== mutState.generation) return;
    const request: VoiceTranscriptionRequest = {
      operationId: input.operationId,
      editorContext: input.editorContext,
      audioBase64,
      mimeType,
      durationMs,
      byteLength: blob.size,
    };
    resetCapture(mutState);
    publishOutcome(mutState, VoiceCaptureOutcome.Recorded(request));
  } catch {
    if (generation === mutState.generation) {
      rejectCapture(
        mutState,
        VoiceFailure.CaptureFailed(
          input.operationId,
          input.editorContext.captureId,
          "The recording could not be encoded.",
        ),
      );
    }
  }
}

function failRecorder(
  mutState: VoiceCaptureRuntimeState,
  generation: number,
): void {
  if (generation !== mutState.generation) return;
  const input = mutState.input;
  if (input === null) return;
  rejectCapture(
    mutState,
    VoiceFailure.CaptureFailed(
      input.operationId,
      input.editorContext.captureId,
    ),
  );
}

function disposeCapture(mutState: VoiceCaptureRuntimeState): void {
  if (mutState.disposed) return;
  mutState.disposed = true;
  mutState.generation += 1;
  const recorder = mutState.recorder;
  resetCapture(mutState);
  try {
    recorder?.stop();
  } catch {
    // Disposal is complete after resource release.
  }
  publishOutcome(mutState, VoiceCaptureOutcome.Disposed());
}

export function receiveVoiceCaptureAction(
  mutState: VoiceCaptureRuntimeState,
  action: VoiceCaptureAction,
): void {
  switch (action.type) {
    case VoiceCaptureActionType.StartRequested:
      startCapture(mutState, action.input);
      return;
    case VoiceCaptureActionType.StopRequested:
      requestCaptureStop(mutState);
      return;
    case VoiceCaptureActionType.CancelRequested:
      cancelCapture(mutState);
      return;
    case VoiceCaptureActionType.DisposeRequested:
      disposeCapture(mutState);
      return;
    case VoiceCaptureActionType.ChunkReceived:
      acceptCaptureChunk(mutState, action.generation, action.chunk);
      return;
    case VoiceCaptureActionType.RecorderStopped:
      void finishCapture(mutState, action.generation);
      return;
    case VoiceCaptureActionType.RecorderFailed:
      failRecorder(mutState, action.generation);
      return;
    case VoiceCaptureActionType.DurationElapsed:
      if (action.generation === mutState.generation) requestCaptureStop(mutState);
      return;
    default:
      action satisfies never;
      return;
  }
}

export class VoiceCaptureRuntime {
  readonly state: VoiceCaptureRuntimeState;

  constructor(
    capabilities: VoiceCaptureCapabilities,
    emit: VoiceCaptureRuntimeState["emit"],
  ) {
    this.state = makeVoiceCaptureRuntimeState(capabilities, emit);
  }

  start(input: StartVoiceCaptureInput): void {
    receiveVoiceCaptureAction(
      this.state,
      VoiceCaptureAction.StartRequested(input),
    );
  }

  stop(): void {
    receiveVoiceCaptureAction(this.state, VoiceCaptureAction.StopRequested());
  }

  cancel(): void {
    receiveVoiceCaptureAction(this.state, VoiceCaptureAction.CancelRequested());
  }

  dispose(): void {
    receiveVoiceCaptureAction(this.state, VoiceCaptureAction.DisposeRequested());
  }
}
