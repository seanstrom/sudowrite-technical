import type { DocumentSnapshot } from "@app/contracts";

export const DocumentPhase = {
  Loading: "Loading",
  Ready: "Ready",
  Dirty: "Dirty",
  Saving: "Saving",
  Failed: "Failed",
  Conflicted: "Conflicted",
} as const;
export type DocumentPhase = (typeof DocumentPhase)[keyof typeof DocumentPhase];

export type DocumentModel = Readonly<{
  document: DocumentSnapshot | undefined;
  phase: DocumentPhase;
  message: string | undefined;
}>;

export const DocumentActionType = {
  RequestedDocument: "RequestedDocument",
  LoadedDocument: "LoadedDocument",
  FailedDocumentLoad: "FailedDocumentLoad",
  ChangedDocument: "ChangedDocument",
  BeganDocumentSave: "BeganDocumentSave",
  SavedDocument: "SavedDocument",
  ConflictedDocument: "ConflictedDocument",
  FailedDocumentSave: "FailedDocumentSave",
} as const;

export const DocumentAction = {
  RequestedDocument: () => ({ type: DocumentActionType.RequestedDocument }) as const,
  LoadedDocument: (document: DocumentSnapshot) => ({
    type: DocumentActionType.LoadedDocument,
    document,
  }) as const,
  FailedDocumentLoad: (message: string) => ({
    type: DocumentActionType.FailedDocumentLoad,
    message,
  }) as const,
  ChangedDocument: () => ({ type: DocumentActionType.ChangedDocument }) as const,
  BeganDocumentSave: () => ({ type: DocumentActionType.BeganDocumentSave }) as const,
  SavedDocument: (document: DocumentSnapshot) => ({
    type: DocumentActionType.SavedDocument,
    document,
  }) as const,
  ConflictedDocument: (document: DocumentSnapshot) => ({
    type: DocumentActionType.ConflictedDocument,
    document,
  }) as const,
  FailedDocumentSave: (message: string) => ({
    type: DocumentActionType.FailedDocumentSave,
    message,
  }) as const,
};
export type DocumentAction = ReturnType<
  (typeof DocumentAction)[keyof typeof DocumentAction]
>;

export const initialDocumentModel = (): DocumentModel => ({
  document: undefined,
  phase: DocumentPhase.Loading,
  message: undefined,
});

export function updateDocument(model: DocumentModel, action: DocumentAction): DocumentModel {
  switch (action.type) {
    case DocumentActionType.RequestedDocument:
      return { ...model, phase: DocumentPhase.Loading, message: undefined };
    case DocumentActionType.LoadedDocument:
      return { document: action.document, phase: DocumentPhase.Ready, message: undefined };
    case DocumentActionType.FailedDocumentLoad:
      return { ...model, phase: DocumentPhase.Failed, message: action.message };
    case DocumentActionType.ChangedDocument:
      return { ...model, phase: DocumentPhase.Dirty, message: undefined };
    case DocumentActionType.BeganDocumentSave:
      return { ...model, phase: DocumentPhase.Saving, message: undefined };
    case DocumentActionType.SavedDocument:
      return { document: action.document, phase: DocumentPhase.Ready, message: undefined };
    case DocumentActionType.ConflictedDocument:
      return {
        ...model,
        phase: DocumentPhase.Conflicted,
        message: "This draft changed in another session. Reload before applying more edits.",
      };
    case DocumentActionType.FailedDocumentSave:
      return { ...model, phase: DocumentPhase.Failed, message: action.message };
    default:
      action satisfies never;
      return model;
  }
}
