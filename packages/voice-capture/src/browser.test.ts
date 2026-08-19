import { describe, expect, it, vi } from "vitest";
import { makeBrowserVoiceCaptureCapabilities } from "./browser.ts";
import {
  VoiceAudioMime,
  VoiceCaptureOutcomeType,
  type VoiceCaptureOutcome,
} from "./domain.ts";
import { VoiceCaptureRuntime } from "./runtime.ts";

class FakeBrowserRecorder extends EventTarget {
  static isTypeSupported(mimeType: string): boolean {
    return mimeType === VoiceAudioMime.WebmOpus;
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
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
});
