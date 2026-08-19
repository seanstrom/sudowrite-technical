import { Context, Data, Effect } from "effect";

export const DocumentRepositoryOperation = {
  Read: "ReadDocument",
  Save: "SaveDocument",
} as const;
export type DocumentRepositoryOperation =
  (typeof DocumentRepositoryOperation)[keyof typeof DocumentRepositoryOperation];

export class DocumentRepositoryFailure extends Data.TaggedError(
  "DocumentRepositoryFailure",
)<
  Readonly<{
    operation: DocumentRepositoryOperation;
    documentId: string;
    cause: unknown;
  }>
> {}

export type DocumentRecord = Readonly<{
  id: string;
  title: string;
  html: string;
  revision: number;
  updatedAt: Date;
}>;

export const SaveDocumentOutcomeType = {
  Saved: "Saved",
  Conflicted: "Conflicted",
} as const;

export const SaveDocumentOutcome = {
  Saved: (document: DocumentRecord) => ({
    _tag: SaveDocumentOutcomeType.Saved,
    document,
  }) as const,
  Conflicted: (current: DocumentRecord) => ({
    _tag: SaveDocumentOutcomeType.Conflicted,
    current,
  }) as const,
};
export type SaveDocumentOutcome = ReturnType<
  (typeof SaveDocumentOutcome)[keyof typeof SaveDocumentOutcome]
>;

export type DocumentRepositoryPort = Readonly<{
  read: (
    documentId: string,
  ) => Effect.Effect<DocumentRecord, DocumentRepositoryFailure>;
  save: (input: Readonly<{
    documentId: string;
    title: string;
    html: string;
    expectedRevision: number;
  }>) => Effect.Effect<SaveDocumentOutcome, DocumentRepositoryFailure>;
}>;

export class DocumentRepository extends Context.Tag("DocumentRepository")<
  DocumentRepository,
  DocumentRepositoryPort
>() {}
