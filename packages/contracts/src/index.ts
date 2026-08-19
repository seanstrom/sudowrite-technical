import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

export const DocumentId = Schema.String.pipe(Schema.brand("DocumentId"));
export type DocumentId = typeof DocumentId.Type;

export const DocumentSnapshot = Schema.Struct({
  id: DocumentId,
  title: Schema.String,
  html: Schema.String,
  revision: Schema.Number,
  updatedAt: Schema.String,
});
export type DocumentSnapshot = typeof DocumentSnapshot.Type;

export const SaveDocumentResultType = {
  Saved: "SavedDocument",
  Conflicted: "ConflictedDocument",
} as const;

export const SavedDocument = Schema.TaggedStruct(
  SaveDocumentResultType.Saved,
  { document: DocumentSnapshot },
);
export const ConflictedDocument = Schema.TaggedStruct(
  SaveDocumentResultType.Conflicted,
  { current: DocumentSnapshot },
);
export const SaveDocumentResultSchema = Schema.Union(
  SavedDocument,
  ConflictedDocument,
);

export const SaveDocumentResult = {
  Saved: (document: DocumentSnapshot) => ({
    _tag: SaveDocumentResultType.Saved,
    document,
  }) as const,
  Conflicted: (current: DocumentSnapshot) => ({
    _tag: SaveDocumentResultType.Conflicted,
    current,
  }) as const,
};
export type SaveDocumentResult = ReturnType<
  (typeof SaveDocumentResult)[keyof typeof SaveDocumentResult]
>;

export class DocumentUnavailable extends Schema.TaggedError<DocumentUnavailable>()(
  "DocumentUnavailable",
  { message: Schema.String },
) {}

export const GetDocument = Rpc.make("GetDocument", {
  payload: { documentId: DocumentId },
  success: DocumentSnapshot,
  error: DocumentUnavailable,
});

export const SaveDocument = Rpc.make("SaveDocument", {
  payload: {
    documentId: DocumentId,
    title: Schema.String,
    html: Schema.String,
    expectedRevision: Schema.Number,
  },
  success: SaveDocumentResultSchema,
  error: DocumentUnavailable,
});

export const DocumentRpcs = RpcGroup.make(GetDocument, SaveDocument);
export const DefaultDocumentId = DocumentId.make("draft");
