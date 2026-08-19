import { describe, expect, it, vi } from "vitest";
import {
  VoiceAudioMime,
  VoiceCaptureLimits,
  VoiceCaptureOutcomeType,
  VoiceFailureType,
  type StartVoiceCaptureInput,
  type VoiceCaptureOutcome,
} from "./domain.ts";
import {
  VoiceCapturePhase,
  VoiceCaptureRuntime,
  type VoiceCaptureCapabilities,
  type VoiceMediaRecorder,
  type VoiceRecorderListeners,
} from "./runtime.ts";

const CaptureInput: StartVoiceCaptureInput = {
  operationId: "operation-1",
  editorContext: {
    captureId: "capture-1",
    documentId: "document-1",
    documentFingerprint: "revision-1",
    hasSelection: true,
    selectionLength: 4,
  },
};

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function makeHarness() {
  const outcomes: Array<VoiceCaptureOutcome> = [];
  const stopTracks = vi.fn();
  let now = 10;
  let listeners: VoiceRecorderListeners | null = null;
  let timer: (() => void) | null = null;
  let disposed = false;
  const onRecordingStarted = vi.fn();
  const recorder: VoiceMediaRecorder = {
    mimeType: VoiceAudioMime.WebmOpus,
    start: vi.fn(),
    requestData: vi.fn(() => {
      listeners?.onChunk(new Blob([new Uint8Array([1, 2, 3])]));
    }),
    stop: vi.fn(() => listeners?.onStopped()),
    dispose: vi.fn(() => {
      disposed = true;
    }),
  };
  const capabilities: VoiceCaptureCapabilities = {
    getAudioStream: vi.fn(async () => ({ stopTracks })),
    supportsMimeType: (mimeType) => mimeType === VoiceAudioMime.WebmOpus,
    makeRecorder: (_stream, _mimeType, nextListeners) => {
      listeners = nextListeners;
      return recorder;
    },
    encodeBlobBase64: async (blob) =>
      Buffer.from(await blob.arrayBuffer()).toString("base64"),
    now: () => now,
    setTimeout: (callback) => {
      timer = callback;
      return 1;
    },
    clearTimeout: () => {
      timer = null;
    },
  };
  const runtime = new VoiceCaptureRuntime(
    capabilities,
    (outcome) => {
      outcomes.push(outcome);
    },
    { onRecordingStarted },
  );

  return {
    runtime,
    outcomes,
    recorder,
    onRecordingStarted,
    stopTracks,
    setNow: (value: number) => {
      now = value;
    },
    fireTimer: () => timer?.(),
    getDisposed: () => disposed,
    emitChunk: (chunk: Blob) => listeners?.onChunk(chunk),
  };
}

describe("VoiceCaptureRuntime", () => {
  it("constructs a bounded serialized request and releases browser resources", async () => {
    const harness = makeHarness();
    harness.runtime.start(CaptureInput);
    await flush();
    harness.setNow(110);
    harness.runtime.stop();
    await flush();

    expect(harness.outcomes).toEqual([
      {
        type: VoiceCaptureOutcomeType.Recorded,
        request: {
          operationId: "operation-1",
          editorContext: CaptureInput.editorContext,
          audioBase64: "AQID",
          mimeType: VoiceAudioMime.WebmOpus,
          durationMs: 100,
          byteLength: 3,
        },
      },
    ]);
    expect(harness.stopTracks).toHaveBeenCalledOnce();
    expect(harness.onRecordingStarted).toHaveBeenCalledOnce();
    expect(harness.onRecordingStarted).toHaveBeenCalledWith(10);
    expect(harness.getDisposed()).toBe(true);
    expect(harness.runtime.state.phase).toBe(VoiceCapturePhase.Idle);
  });

  it("cancels without publishing audio and ignores a stale stop callback", async () => {
    const harness = makeHarness();
    harness.runtime.start(CaptureInput);
    await flush();
    harness.runtime.cancel();
    await flush();

    expect(harness.outcomes).toEqual([
      {
        type: VoiceCaptureOutcomeType.Cancelled,
        operationId: "operation-1",
        captureId: "capture-1",
      },
    ]);
    expect(harness.stopTracks).toHaveBeenCalledOnce();
    expect(harness.runtime.state.phase).toBe(VoiceCapturePhase.Idle);
  });

  it("treats stop during microphone acquisition as cancellation", async () => {
    let resolveStream: ((stream: { stopTracks: () => void }) => void) | undefined;
    const stopTracks = vi.fn();
    const recorderStart = vi.fn();
    const outcomes: Array<VoiceCaptureOutcome> = [];
    const runtime = new VoiceCaptureRuntime(
      {
        getAudioStream: () =>
          new Promise((resolve) => {
            resolveStream = resolve;
          }),
        supportsMimeType: (mimeType) => mimeType === VoiceAudioMime.WebmOpus,
        makeRecorder: () => ({
          mimeType: VoiceAudioMime.WebmOpus,
          start: recorderStart,
          requestData: () => undefined,
          stop: () => undefined,
          dispose: () => undefined,
        }),
        encodeBlobBase64: async () => "",
        now: () => 0,
        setTimeout: () => 1,
        clearTimeout: () => undefined,
      },
      (outcome) => {
        outcomes.push(outcome);
      },
    );

    runtime.start(CaptureInput);
    runtime.stop();
    resolveStream?.({ stopTracks });
    await flush();

    expect(outcomes[0]?.type).toBe(VoiceCaptureOutcomeType.Cancelled);
    expect(recorderStart).not.toHaveBeenCalled();
    expect(stopTracks).toHaveBeenCalledOnce();
    expect(runtime.state.phase).toBe(VoiceCapturePhase.Idle);
  });

  it("rejects an oversized stream before base64 encoding", async () => {
    const harness = makeHarness();
    harness.runtime.start(CaptureInput);
    await flush();
    harness.emitChunk(
      new Blob([new Uint8Array(VoiceCaptureLimits.MaximumAudioBytes + 1)]),
    );
    await flush();

    expect(harness.outcomes[0]).toMatchObject({
      type: VoiceCaptureOutcomeType.Failed,
      failure: { type: VoiceFailureType.AudioTooLarge },
    });
    expect(harness.stopTracks).toHaveBeenCalledOnce();
  });

  it("releases the acquired stream when recorder construction fails", async () => {
    const outcomes: Array<VoiceCaptureOutcome> = [];
    const stopTracks = vi.fn();
    const runtime = new VoiceCaptureRuntime(
      {
        getAudioStream: async () => ({ stopTracks }),
        supportsMimeType: (mimeType) => mimeType === VoiceAudioMime.WebmOpus,
        makeRecorder: () => {
          throw new DOMException("Unsupported recorder", "NotSupportedError");
        },
        encodeBlobBase64: async () => "",
        now: () => 0,
        setTimeout: () => 1,
        clearTimeout: () => undefined,
      },
      (outcome) => {
        outcomes.push(outcome);
      },
    );

    runtime.start(CaptureInput);
    await flush();

    expect(outcomes[0]).toMatchObject({
      type: VoiceCaptureOutcomeType.Failed,
      failure: { type: VoiceFailureType.CaptureFailed },
    });
    expect(stopTracks).toHaveBeenCalledOnce();
    expect(runtime.state.phase).toBe(VoiceCapturePhase.Idle);
  });

  it("stops from the bounded duration timer and disposes idempotently", async () => {
    const harness = makeHarness();
    harness.runtime.start(CaptureInput);
    await flush();
    harness.setNow(VoiceCaptureLimits.MaximumDurationMs + 10);
    harness.fireTimer();
    await flush();

    expect(harness.outcomes[0]?.type).toBe(VoiceCaptureOutcomeType.Recorded);
    harness.runtime.dispose();
    harness.runtime.dispose();
    expect(
      harness.outcomes.filter(
        (outcome) => outcome.type === VoiceCaptureOutcomeType.Disposed,
      ),
    ).toHaveLength(1);
    expect(harness.runtime.state.phase).toBe(VoiceCapturePhase.Disposed);
  });
});
