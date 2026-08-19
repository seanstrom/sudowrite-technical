import { describe, expect, it, vi } from "vitest";
import { makeBrowserVoiceCaptureCapabilities } from "./browser.ts";
import {
  VoiceAudioMime,
  VoiceCaptureLimits,
  VoiceCaptureOutcomeType,
  type VoiceCaptureOutcome,
} from "./domain.ts";
import { VoiceCaptureRuntime } from "./runtime.ts";

class FakeBrowserRecorder extends EventTarget {
  static options: MediaRecorderOptions | undefined;
  static rejectPreferredOptions = false;

  static isTypeSupported(mimeType: string): boolean {
    return mimeType === VoiceAudioMime.WebmOpus;
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    if (
      FakeBrowserRecorder.rejectPreferredOptions &&
      options?.audioBitsPerSecond !== undefined
    ) {
      throw new DOMException("Unsupported recording options", "NotSupportedError");
    }
    FakeBrowserRecorder.options = options;
    this.mimeType = options?.mimeType ?? "";
  }

  start(): void {
    this.state = "recording";
  }

  requestData(): void {
    const event = new Event("dataavailable") as BlobEvent;
    Object.defineProperty(event, "data", {
      value: new Blob([new Uint8Array([9, 8, 7])]),
    });
    this.dispatchEvent(event);
  }

  stop(): void {
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

describe("browser voice capture adapter", () => {
  it("uses getUserMedia and MediaRecorder to produce the transport payload", async () => {
    FakeBrowserRecorder.options = undefined;
    FakeBrowserRecorder.rejectPreferredOptions = false;
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    })) as unknown as MediaDevices["getUserMedia"];
    const outcomes: Array<VoiceCaptureOutcome> = [];
    let now = 100;
    const runtime = new VoiceCaptureRuntime(
      makeBrowserVoiceCaptureCapabilities({
        mediaDevices: { getUserMedia },
        MediaRecorder: FakeBrowserRecorder as unknown as typeof MediaRecorder,
        now: () => now,
        setTimeout: () => 1,
        clearTimeout: () => undefined,
        encodeBlobBase64: async () => "CQgH",
      }),
      (outcome) => {
        outcomes.push(outcome);
      },
    );

    runtime.start({
      operationId: "operation-1",
      editorContext: {
        captureId: "capture-1",
        documentId: "document-1",
        documentFingerprint: "revision-1",
        hasSelection: false,
        selectionLength: 0,
      },
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    now = 240;
    runtime.stop();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    expect(FakeBrowserRecorder.options).toEqual({
      mimeType: VoiceAudioMime.WebmOpus,
      audioBitsPerSecond: VoiceCaptureLimits.PreferredAudioBitsPerSecond,
    });
    expect(outcomes).toEqual([
      {
        type: VoiceCaptureOutcomeType.Recorded,
        request: {
          operationId: "operation-1",
          editorContext: {
            captureId: "capture-1",
            documentId: "document-1",
            documentFingerprint: "revision-1",
            hasSelection: false,
            selectionLength: 0,
          },
          audioBase64: "CQgH",
          mimeType: VoiceAudioMime.WebmOpus,
          durationMs: 140,
          byteLength: 3,
        },
      },
    ]);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("falls back when the browser rejects the preferred speech bitrate", async () => {
    FakeBrowserRecorder.options = undefined;
    FakeBrowserRecorder.rejectPreferredOptions = true;
    const stopTrack = vi.fn();
    const outcomes: Array<VoiceCaptureOutcome> = [];
    const runtime = new VoiceCaptureRuntime(
      makeBrowserVoiceCaptureCapabilities({
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: stopTrack }],
          })) as unknown as MediaDevices["getUserMedia"],
        },
        MediaRecorder: FakeBrowserRecorder as unknown as typeof MediaRecorder,
        now: () => 100,
        setTimeout: () => 1,
        clearTimeout: () => undefined,
        encodeBlobBase64: async () => "CQgH",
      }),
      (outcome) => {
        outcomes.push(outcome);
      },
    );

    runtime.start({
      operationId: "operation-2",
      editorContext: {
        captureId: "capture-2",
        documentId: "document-1",
        documentFingerprint: "revision-1",
        hasSelection: false,
        selectionLength: 0,
      },
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    runtime.stop();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(FakeBrowserRecorder.options).toEqual({
      mimeType: VoiceAudioMime.WebmOpus,
    });
    expect(outcomes[0]?.type).toBe(VoiceCaptureOutcomeType.Recorded);
    expect(stopTrack).toHaveBeenCalledOnce();
    FakeBrowserRecorder.rejectPreferredOptions = false;
  });
});
