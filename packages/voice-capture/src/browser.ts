import { VoiceCaptureLimits, type VoiceAudioMime } from "./domain.ts";
import type {
  VoiceAudioStream,
  VoiceCaptureCapabilities,
  VoiceMediaRecorder,
  VoiceRecorderListeners,
} from "./runtime.ts";

export type BrowserVoiceCaptureDependencies = Readonly<{
  mediaDevices: Pick<MediaDevices, "getUserMedia">;
  MediaRecorder: typeof MediaRecorder;
  now?: () => number;
  setTimeout?: (callback: () => void, durationMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  encodeBlobBase64?: (blob: Blob) => Promise<string>;
}>;

type BrowserAudioStream = VoiceAudioStream & Readonly<{ raw: MediaStream }>;

function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function encodeBrowserBlobBase64(blob: Blob): Promise<string> {
  return encodeBytesBase64(new Uint8Array(await blob.arrayBuffer()));
}

function adaptBrowserStream(stream: MediaStream): BrowserAudioStream {
  return {
    raw: stream,
    stopTracks: () => {
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

function adaptMediaRecorder(
  Recorder: typeof MediaRecorder,
  stream: BrowserAudioStream,
  mimeType: VoiceAudioMime,
  listeners: VoiceRecorderListeners,
): VoiceMediaRecorder {
  let recorder: MediaRecorder;
  try {
    recorder = new Recorder(stream.raw, {
      mimeType,
      audioBitsPerSecond: VoiceCaptureLimits.PreferredAudioBitsPerSecond,
    });
  } catch {
    recorder = new Recorder(stream.raw, { mimeType });
  }
  const onDataAvailable = (event: BlobEvent) => listeners.onChunk(event.data);
  const onStop = () => listeners.onStopped();
  const onError = () => listeners.onFailed();

  recorder.addEventListener("dataavailable", onDataAvailable);
  recorder.addEventListener("stop", onStop);
  recorder.addEventListener("error", onError);

  return {
    mimeType: recorder.mimeType || mimeType,
    start: () => recorder.start(250),
    requestData: () => {
      if (recorder.state === "recording") recorder.requestData();
    },
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
    dispose: () => {
      recorder.removeEventListener("dataavailable", onDataAvailable);
      recorder.removeEventListener("stop", onStop);
      recorder.removeEventListener("error", onError);
    },
  };
}

export function makeBrowserVoiceCaptureCapabilities(
  dependencies: BrowserVoiceCaptureDependencies,
): VoiceCaptureCapabilities {
  const setTimer =
    dependencies.setTimeout ??
    ((callback: () => void, durationMs: number) =>
      globalThis.setTimeout(callback, durationMs));
  const clearTimer =
    dependencies.clearTimeout ??
    ((timer: unknown) => globalThis.clearTimeout(timer as number));

  return {
    getAudioStream: async () =>
      adaptBrowserStream(
        await dependencies.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        }),
      ),
    supportsMimeType: (mimeType) =>
      dependencies.MediaRecorder.isTypeSupported(mimeType),
    makeRecorder: (stream, mimeType, listeners) =>
      adaptMediaRecorder(
        dependencies.MediaRecorder,
        stream as BrowserAudioStream,
        mimeType,
        listeners,
      ),
    encodeBlobBase64:
      dependencies.encodeBlobBase64 ?? encodeBrowserBlobBase64,
    now: dependencies.now ?? (() => performance.now()),
    setTimeout: setTimer,
    clearTimeout: clearTimer,
  };
}
