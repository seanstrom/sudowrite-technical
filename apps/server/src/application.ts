import {
  DocumentId,
  DocumentRpcs,
  DocumentUnavailable,
  EditorProposalOutcomeType,
  SaveDocumentResult,
  type CapturedEditorContext,
  type ProposedEditorCommand,
} from "@app/contracts";
import { validateTiptapDocumentContent } from "@app/editor";
import {
  SpeechEditCommandType,
  SpeechInterpretationFailureType,
  SpeechInterpretationOutcomeType,
  type CapturedSpeechEditorContext,
  type SpeechEditCommand,
  type SpeechInterpretationOutcome,
} from "@app/speech-command";
import {
  DocumentRepository,
  SaveDocumentOutcomeType,
  type DocumentRecord,
} from "@app/domain";
import {
  VoiceTranscriptionCommand,
} from "@app/voice-capture";
import {
  runVoiceTranscription,
  type VoiceTranscriptionPort,
} from "@app/voice-capture/server";
import { Context, Effect } from "effect";
import type { SpeechInterpretationService as SpeechInterpretationServicePort } from "./speech-interpretation";

export class VoiceTranscriptionService extends Context.Tag(
  "VoiceTranscriptionService",
)<VoiceTranscriptionService, VoiceTranscriptionPort>() {}

export class SpeechInterpretationService extends Context.Tag(
  "SpeechInterpretationService",
)<SpeechInterpretationService, SpeechInterpretationServicePort>() {}

const toSnapshot = (document: DocumentRecord) => ({
  id: DocumentId.make(document.id),
  title: document.title,
  content: document.content,
  revision: document.revision,
  updatedAt: document.updatedAt.toISOString(),
});

const mapUnavailable = (message: string) =>
  new DocumentUnavailable({ message });

const validateContent = <Content>(content: Content): Effect.Effect<Content, DocumentUnavailable> =>
  Effect.try({
    try: () => {
      validateTiptapDocumentContent(content);
      return content;
    },
    catch: () => mapUnavailable("The document content does not match the configured editor schema."),
  });

function toWireCommand(command: SpeechEditCommand): ProposedEditorCommand {
  switch (command.type) {
    case SpeechEditCommandType.ReplaceText:
      return {
        _tag: "ReplaceText",
        scope: command.scope,
        occurrence: command.occurrence,
        matchText: command.matchText,
        replacementText: command.replacementText,
      };
    case SpeechEditCommandType.InsertText:
      return { _tag: "InsertText", text: command.text, target: command.target };
    case SpeechEditCommandType.SetMark:
      return { _tag: "SetMark", mark: command.mark, enabled: command.enabled };
    case SpeechEditCommandType.ReplaceSelection:
      return { _tag: "ReplaceSelection", text: command.replacementText };
    case SpeechEditCommandType.ReplaceDocument:
      return {
        _tag: "ReplaceDocument",
        content: validateTiptapDocumentContent(command.replacementContent) as Extract<
          ProposedEditorCommand,
          { _tag: "ReplaceDocument" }
        >["content"],
        preview: command.preview,
      };
    default:
      command satisfies never;
      return { _tag: "ReplaceSelection", text: "" };
  }
}

export function toCapturedSpeechContext(context: CapturedEditorContext): CapturedSpeechEditorContext {
  return {
    identity: {
      captureId: context.captureId,
      documentId: context.documentId,
      documentRevision: String(context.documentRevision),
      documentFingerprint: context.target.documentFingerprint,
    },
    documentContent: context.documentContent,
    documentText: context.documentText,
    selection: context.target.from === context.target.to
      ? null
      : {
          from: context.target.from,
          to: context.target.to,
          text: context.target.selectedText,
        },
  };
}

export function toWireOutcome(
  outcome: SpeechInterpretationOutcome,
  context: CapturedEditorContext,
) {
  switch (outcome.type) {
    case SpeechInterpretationOutcomeType.Proposed:
      return {
        _tag: EditorProposalOutcomeType.Proposed,
        proposalId: outcome.proposal.proposalId,
        transcript: outcome.proposal.transcript,
        summary: outcome.proposal.summary,
        context,
        command: toWireCommand(outcome.proposal.command),
      } as const;
    case SpeechInterpretationOutcomeType.Ambiguous:
      return {
        _tag: EditorProposalOutcomeType.Ambiguous,
        transcript: outcome.transcript,
        reason: outcome.reason,
        clarification: outcome.clarification,
      } as const;
    case SpeechInterpretationOutcomeType.Unsupported:
      return {
        _tag: EditorProposalOutcomeType.Unsupported,
        transcript: outcome.transcript,
        reason: outcome.reason,
      } as const;
    case SpeechInterpretationOutcomeType.Cancelled:
      return { _tag: EditorProposalOutcomeType.Cancelled, reason: outcome.reason } as const;
    case SpeechInterpretationOutcomeType.Failed: {
      const reason = outcome.failure.type === SpeechInterpretationFailureType.InvalidTranscript
        ? outcome.failure.message
        : "The command could not be interpreted safely.";
      return { _tag: EditorProposalOutcomeType.Failed, reason } as const;
    }
    default:
      outcome satisfies never;
      return { _tag: EditorProposalOutcomeType.Failed, reason: "Unknown interpretation outcome." } as const;
  }
}

export const DocumentRpcHandlersLive = DocumentRpcs.toLayer(
  Effect.succeed({
    GetDocument: ({ documentId }) =>
      Effect.gen(function* () {
        const repository = yield* DocumentRepository;
        return yield* repository.read(documentId).pipe(
          Effect.flatMap((document) => validateContent(document.content).pipe(
            Effect.as(toSnapshot(document)),
          )),
          Effect.mapError(() => mapUnavailable("The document could not be loaded.")),
        );
      }),
    SaveDocument: ({ documentId, title, content, expectedRevision }) =>
      Effect.gen(function* () {
        yield* validateContent(content);
        const repository = yield* DocumentRepository;
        const outcome = yield* repository.save({
          documentId,
          title,
          content,
          expectedRevision,
        }).pipe(
          Effect.mapError(() => mapUnavailable("The document could not be saved.")),
        );
        switch (outcome._tag) {
          case SaveDocumentOutcomeType.Saved:
            return SaveDocumentResult.Saved(toSnapshot(outcome.document));
          case SaveDocumentOutcomeType.Conflicted:
            return SaveDocumentResult.Conflicted(toSnapshot(outcome.current));
          default:
            outcome satisfies never;
            return SaveDocumentResult.Conflicted(toSnapshot({
              id: documentId,
              title,
              content,
              revision: expectedRevision,
              updatedAt: new Date(0),
            }));
        }
      }),
    ProposeEditorCommand: ({ transcript, context }) =>
      Effect.gen(function* () {
        const interpretation = yield* SpeechInterpretationService;
        const outcome = yield* interpretation.interpret({
          requestId: crypto.randomUUID(),
          transcript,
          context: toCapturedSpeechContext(context),
        });
        return toWireOutcome(outcome, context);
      }),
    TranscribeVoice: ({ request }) =>
      Effect.gen(function* () {
        const transcription = yield* VoiceTranscriptionService;
        return yield* runVoiceTranscription(
          VoiceTranscriptionCommand.Transcribe(request),
          transcription,
        );
      }),
  }),
);
