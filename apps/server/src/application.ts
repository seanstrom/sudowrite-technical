import {
  DocumentId,
  DocumentRpcs,
  DocumentUnavailable,
  EditorProposalOutcomeType,
  ProposedEditorCommandType,
  SaveDocumentResult,
  type CapturedEditorContext,
  type ProposedEditorCommand,
} from "@app/contracts";
import { validateTiptapDocumentContent } from "@app/editor";
import {
  DocumentRepository,
  SaveDocumentOutcomeType,
  type DocumentRecord,
} from "@app/domain";
import { Effect } from "effect";

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

const proposed = (
  transcript: string,
  context: CapturedEditorContext,
  summary: string,
  command: ProposedEditorCommand,
) => ({
  _tag: EditorProposalOutcomeType.Proposed,
  proposalId: crypto.randomUUID(),
  transcript,
  summary,
  context,
  command,
});

export function proposeEditorCommand(transcript: string, context: CapturedEditorContext) {
  const instruction = transcript.trim();
  const replaceSelection = instruction.match(/^replace (?:the )?selection with ["“]?(.+?)["”]?$/i);
  if (replaceSelection) return proposed(instruction, context, "Replace the selected text", {
    _tag: ProposedEditorCommandType.ReplaceSelection,
    text: replaceSelection[1]!,
  });
  const replaceAll = instruction.match(/^replace all ["“]?(.+?)["”]? with ["“]?(.+?)["”]?$/i);
  if (replaceAll) return proposed(instruction, context, `Replace every “${replaceAll[1]}”`, {
    _tag: ProposedEditorCommandType.ReplaceAll,
    search: replaceAll[1]!,
    replacement: replaceAll[2]!,
  });
  const insert = instruction.match(/^insert ["“]?(.+?)["”]? (before|after)(?: the selection)?$/i);
  if (insert) return proposed(instruction, context, `Insert text ${insert[2]!.toLowerCase()} the selection`, {
    _tag: ProposedEditorCommandType.InsertText,
    text: insert[1]!,
    at: insert[2]!.toLowerCase() === "before" ? "Before" : "After",
  });
  const mark = instruction.match(/^(add|apply|remove|clear|make) (bold|italic)(?: formatting)?$/i);
  if (mark) return proposed(instruction, context, `${mark[1]} ${mark[2]} formatting`, {
    _tag: ProposedEditorCommandType.SetMark,
    mark: mark[2]!.toLowerCase() === "bold" ? "bold" : "italic",
    enabled: !/^(remove|clear)$/i.test(mark[1]!),
  });
  return {
    _tag: EditorProposalOutcomeType.Unsupported,
    transcript: instruction,
    reason: "Try replacing the selection, replacing matching text, inserting text, or changing bold/italic formatting.",
  } as const;
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
      Effect.succeed(proposeEditorCommand(transcript, context)),
  }),
);
