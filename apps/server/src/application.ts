import {
  DocumentId,
  DocumentRpcs,
  DocumentUnavailable,
  SaveDocumentResult,
} from "@app/contracts";
import {
  DocumentRepository,
  SaveDocumentOutcomeType,
  type DocumentRecord,
} from "@app/domain";
import { Effect } from "effect";

const toSnapshot = (document: DocumentRecord) => ({
  id: DocumentId.make(document.id),
  title: document.title,
  html: document.html,
  revision: document.revision,
  updatedAt: document.updatedAt.toISOString(),
});

const mapUnavailable = (message: string) =>
  new DocumentUnavailable({ message });

export const DocumentRpcHandlersLive = DocumentRpcs.toLayer(
  Effect.succeed({
    GetDocument: ({ documentId }) =>
      Effect.gen(function* () {
        const repository = yield* DocumentRepository;
        return yield* repository.read(documentId).pipe(
          Effect.map(toSnapshot),
          Effect.mapError(() => mapUnavailable("The document could not be loaded.")),
        );
      }),
    SaveDocument: ({ documentId, title, html, expectedRevision }) =>
      Effect.gen(function* () {
        const repository = yield* DocumentRepository;
        const outcome = yield* repository.save({
          documentId,
          title,
          html,
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
              html,
              revision: expectedRevision,
              updatedAt: new Date(0),
            }));
        }
      }),
  }),
);
