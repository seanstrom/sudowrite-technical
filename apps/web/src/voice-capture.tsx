import {
  DocumentId,
  VoiceTranscriptionResultType,
  type CapturedEditorContext,
} from "@app/contracts";
import {
  VoiceCaptureLimits,
  VoiceCaptureOutcomeType,
  type VoiceCaptureOutcome,
} from "@app/voice-capture";
import { makeBrowserVoiceCaptureCapabilities } from "@app/voice-capture/browser";
import { VoiceCaptureRuntime } from "@app/voice-capture/runtime";
import { useEffect, useRef, useState } from "react";

import type { DocumentRuntime } from "./runtime";

export const VoiceControlPhase = {
  Idle: "Idle",
  Recording: "Recording",
  Stopping: "Stopping",
  Transcribing: "Transcribing",
  Ready: "Ready",
  Failed: "Failed",
} as const;

export type VoiceControlPhase =
  (typeof VoiceControlPhase)[keyof typeof VoiceControlPhase];

type VoiceControlProjection = Readonly<{
  phase: VoiceControlPhase;
  elapsedSeconds: number;
  status: string;
  error: string | undefined;
}>;

type VoiceControlRuntimeState = {
  capture: VoiceCaptureRuntime | undefined;
  retainedContext: CapturedEditorContext | undefined;
  transcriptionController: AbortController | undefined;
  elapsedTimer: ReturnType<typeof setInterval> | undefined;
  startedAtMs: number | undefined;
  disposed: boolean;
};

export type VoiceCaptureControlsProps = Readonly<{
  runtime: DocumentRuntime;
  onTranscript: (
    transcript: string,
    context: CapturedEditorContext,
  ) => void;
}>;

const InitialProjection: VoiceControlProjection = {
  phase: VoiceControlPhase.Idle,
  elapsedSeconds: 0,
  status: "Ready to record",
  error: undefined,
};

function stopElapsedProjection(mutState: VoiceControlRuntimeState): void {
  if (mutState.elapsedTimer !== undefined) {
    clearInterval(mutState.elapsedTimer);
    mutState.elapsedTimer = undefined;
  }
}

function fingerprintTransportMetadata(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function VoiceCaptureControls({
  runtime,
  onTranscript,
}: VoiceCaptureControlsProps) {
  const [projection, setProjection] =
    useState<VoiceControlProjection>(InitialProjection);
  const runtimeState = useRef<VoiceControlRuntimeState>({
    capture: undefined,
    retainedContext: undefined,
    transcriptionController: undefined,
    elapsedTimer: undefined,
    startedAtMs: undefined,
    disposed: false,
  });

  useEffect(() => {
    const mutState = runtimeState.current;
    mutState.disposed = false;
    const handleOutcome = async (outcome: VoiceCaptureOutcome) => {
      if (mutState.disposed) return;
      switch (outcome.type) {
        case VoiceCaptureOutcomeType.Recorded: {
          stopElapsedProjection(mutState);
          setProjection({
            phase: VoiceControlPhase.Transcribing,
            elapsedSeconds: Math.ceil(outcome.request.durationMs / 1_000),
            status: "Transcribing recording…",
            error: undefined,
          });
          const controller = new AbortController();
          mutState.transcriptionController = controller;
          try {
            const result = await runtime.transcribe(outcome.request, controller.signal);
            if (controller.signal.aborted || mutState.disposed) return;
            switch (result.type) {
              case VoiceTranscriptionResultType.Transcribed: {
                const context = mutState.retainedContext;
                if (context === undefined) {
                  setProjection({
                    phase: VoiceControlPhase.Failed,
                    elapsedSeconds: 0,
                    status: "Capture context was lost",
                    error: "Record the instruction again before reviewing it.",
                  });
                  return;
                }
                onTranscript(result.transcript, context);
                setProjection({
                  phase: VoiceControlPhase.Ready,
                  elapsedSeconds: 0,
                  status: "Transcript ready to review",
                  error: undefined,
                });
                return;
              }
              case VoiceTranscriptionResultType.Rejected:
                setProjection({
                  phase: VoiceControlPhase.Failed,
                  elapsedSeconds: 0,
                  status: "Transcription failed",
                  error: result.failure.message,
                });
                return;
              case VoiceTranscriptionResultType.Cancelled:
                setProjection(InitialProjection);
                return;
              default:
                result satisfies never;
                return;
            }
          } catch {
            if (!controller.signal.aborted) {
              setProjection({
                phase: VoiceControlPhase.Failed,
                elapsedSeconds: 0,
                status: "Transcription failed",
                error: "The recording could not be transcribed.",
              });
            }
          } finally {
            if (mutState.transcriptionController === controller) {
              mutState.transcriptionController = undefined;
            }
          }
          return;
        }
        case VoiceCaptureOutcomeType.Cancelled:
          stopElapsedProjection(mutState);
          setProjection(InitialProjection);
          return;
        case VoiceCaptureOutcomeType.Failed:
          stopElapsedProjection(mutState);
          setProjection({
            phase: VoiceControlPhase.Failed,
            elapsedSeconds: 0,
            status: "Recording failed",
            error: outcome.failure.message,
          });
          return;
        case VoiceCaptureOutcomeType.Disposed:
          return;
        default:
          outcome satisfies never;
          return;
      }
    };

    mutState.capture = new VoiceCaptureRuntime(
      makeBrowserVoiceCaptureCapabilities({
        mediaDevices: navigator.mediaDevices,
        MediaRecorder,
      }),
      handleOutcome,
    );
    return () => {
      mutState.disposed = true;
      stopElapsedProjection(mutState);
      mutState.transcriptionController?.abort();
      mutState.capture?.dispose();
      mutState.capture = undefined;
      mutState.retainedContext = undefined;
    };
  }, [onTranscript, runtime]);

  const preserveEditorSelection = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => event.preventDefault();

  const startRecording = () => {
    const mutState = runtimeState.current;
    const editor = runtime.getEditorPort();
    if (mutState.capture === undefined || editor === undefined) {
      setProjection({
        phase: VoiceControlPhase.Failed,
        elapsedSeconds: 0,
        status: "Editor unavailable",
        error: "Wait for the editor before recording.",
      });
      return;
    }
    const captured = editor.capture();
    const context: CapturedEditorContext = {
      ...captured,
      documentId: DocumentId.make(captured.documentId),
    };
    const captureId = crypto.randomUUID();
    mutState.retainedContext = context;
    mutState.startedAtMs = performance.now();
    mutState.capture.start({
      operationId: crypto.randomUUID(),
      editorContext: {
        captureId,
        documentId: context.documentId,
        documentFingerprint: fingerprintTransportMetadata(
          context.target.documentFingerprint,
        ),
        hasSelection: context.target.from !== context.target.to,
        selectionLength: context.target.selectedText.length,
      },
    });
    setProjection({
      phase: VoiceControlPhase.Recording,
      elapsedSeconds: 0,
      status: "Recording…",
      error: undefined,
    });
    stopElapsedProjection(mutState);
    mutState.elapsedTimer = setInterval(() => {
      const startedAtMs = mutState.startedAtMs;
      if (startedAtMs === undefined) return;
      const elapsedSeconds = Math.min(
        Math.ceil((performance.now() - startedAtMs) / 1_000),
        VoiceCaptureLimits.MaximumDurationMs / 1_000,
      );
      setProjection((current) => ({ ...current, elapsedSeconds }));
    }, 250);
  };

  const stopRecording = () => {
    setProjection((current) => ({
      ...current,
      phase: VoiceControlPhase.Stopping,
      status: "Finishing recording…",
    }));
    runtimeState.current.capture?.stop();
  };

  const cancelRecording = () => {
    const mutState = runtimeState.current;
    stopElapsedProjection(mutState);
    mutState.transcriptionController?.abort();
    mutState.transcriptionController = undefined;
    mutState.capture?.cancel();
    mutState.retainedContext = undefined;
    setProjection(InitialProjection);
  };

  const isRecording = projection.phase === VoiceControlPhase.Recording;
  const isStopping = projection.phase === VoiceControlPhase.Stopping;
  const isTranscribing = projection.phase === VoiceControlPhase.Transcribing;

  return (
    <section className="voice-capture-controls" aria-label="Voice capture">
      <div className="voice-capture-actions">
        {!isRecording && !isStopping && !isTranscribing ? (
          <button
            onClick={startRecording}
            onPointerDown={preserveEditorSelection}
            type="button"
          >
            Record
          </button>
        ) : null}
        {isRecording ? (
          <button
            onClick={stopRecording}
            onPointerDown={preserveEditorSelection}
            type="button"
          >
            Stop
          </button>
        ) : null}
        {isRecording || isStopping || isTranscribing ? (
          <button
            className="secondary"
            onClick={cancelRecording}
            onPointerDown={preserveEditorSelection}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <p className="voice-capture-status" aria-live="polite">
        {projection.status}
        {isRecording ? ` ${projection.elapsedSeconds}s / 30s` : ""}
      </p>
      {projection.error ? (
        <p className="voice-capture-error" role="alert">
          {projection.error}
        </p>
      ) : null}
    </section>
  );
}
