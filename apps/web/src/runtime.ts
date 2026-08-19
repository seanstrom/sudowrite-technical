import {
  DocumentRpcs,
  SaveDocumentResultType,
  type CapturedEditorContext,
  type DocumentId,
  type DocumentSnapshot,
  type EditorProposalOutcome,
  type SaveDocumentResult,
  type TiptapDocumentContent,
  type VoiceTranscriptionRequest,
  type VoiceTranscriptionResult,
} from "@app/contracts";
import type { EditorApplicationPort } from "@app/editor";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Context, Effect, Either, Layer, ManagedRuntime } from "effect";
import { createStore, type StoreApi } from "zustand/vanilla";
import { devtools, subscribeWithSelector, type NamedSet } from "zustand/middleware";

import {
  DocumentAction,
  type DocumentAction as DocumentActionValue,
  type DocumentModel,
  initialDocumentModel,
  updateDocument,
} from "./document-model";

export type DocumentGateway = Readonly<{
  load: (documentId: DocumentId, signal: AbortSignal) => Promise<DocumentSnapshot>;
  save: (input: Readonly<{
    documentId: DocumentId;
    title: string;
    content: TiptapDocumentContent;
    expectedRevision: number;
  }>, signal: AbortSignal) => Promise<SaveDocumentResult>;
  propose: (input: Readonly<{
    transcript: string;
    context: CapturedEditorContext;
  }>, signal: AbortSignal) => Promise<EditorProposalOutcome>;
  transcribe: (
    request: VoiceTranscriptionRequest,
    signal: AbortSignal,
  ) => Promise<VoiceTranscriptionResult>;
  dispose: () => Promise<void>;
}>;

export type DraftRecoveryPort = Readonly<{
  read: (documentId: DocumentId) => TiptapDocumentContent | undefined;
  write: (documentId: DocumentId, content: TiptapDocumentContent) => void;
  clear: (documentId: DocumentId) => void;
}>;

export type DocumentStore = Omit<StoreApi<DocumentModel>, "setState"> & Readonly<{
  setState: NamedSet<DocumentModel>;
  devtools?: Readonly<{ cleanup: () => void }>;
}>;

export type DocumentRuntimeState = {
  store: DocumentStore;
  gateway: DocumentGateway;
  recovery: DraftRecoveryPort;
  documentId: DocumentId;
  editorPort: EditorApplicationPort | undefined;
  pendingContent: TiptapDocumentContent | undefined;
  debounceTimer: ReturnType<typeof setTimeout> | undefined;
  activeController: AbortController | undefined;
  saving: boolean;
  disposed: boolean;
  disposal: Promise<void> | undefined;
};

export type DocumentRuntime = Readonly<{
  state: DocumentRuntimeState;
  store: DocumentStore;
  load: () => void;
  queueSave: (content: TiptapDocumentContent) => void;
  retrySave: () => void;
  propose: (transcript: string, context: CapturedEditorContext) => Promise<EditorProposalOutcome>;
  transcribe: (
    request: VoiceTranscriptionRequest,
    signal: AbortSignal,
  ) => Promise<VoiceTranscriptionResult>;
  registerEditorPort: (port: EditorApplicationPort) => () => void;
  getEditorPort: () => EditorApplicationPort | undefined;
  dispose: () => Promise<void>;
}>;

const toDevtoolsAction = (action: DocumentActionValue) => ({ type: action.type });

function dispatchDocumentAction(state: DocumentRuntimeState, action: DocumentActionValue): void {
  if (state.disposed) return;
  state.store.setState(updateDocument(state.store.getState(), action), true, toDevtoolsAction(action));
}

function loadDocument(state: DocumentRuntimeState): void {
  state.activeController?.abort();
  const controller = new AbortController();
  state.activeController = controller;
  dispatchDocumentAction(state, DocumentAction.RequestedDocument());
  void state.gateway.load(state.documentId, controller.signal).then(
    (document) => {
      if (controller.signal.aborted) return;
      const recoveredContent = state.recovery.read(state.documentId);
      if (recoveredContent === undefined) {
        dispatchDocumentAction(state, DocumentAction.LoadedDocument(document));
        return;
      }
      dispatchDocumentAction(state, DocumentAction.LoadedDocument({ ...document, content: recoveredContent }));
      state.pendingContent = recoveredContent;
      dispatchDocumentAction(state, DocumentAction.ChangedDocument());
      scheduleDocumentSave(state);
    },
    (cause: unknown) => {
      if (!controller.signal.aborted) dispatchDocumentAction(state, DocumentAction.FailedDocumentLoad(
        cause instanceof Error ? cause.message : "The document could not be loaded.",
      ));
    },
  ).finally(() => {
    if (state.activeController === controller) state.activeController = undefined;
  });
}

function queueDocumentSave(state: DocumentRuntimeState, content: TiptapDocumentContent): void {
  if (state.disposed) return;
  state.pendingContent = content;
  state.recovery.write(state.documentId, content);
  dispatchDocumentAction(state, DocumentAction.ChangedDocument());
  scheduleDocumentSave(state);
}

function scheduleDocumentSave(state: DocumentRuntimeState): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = undefined;
    void flushDocumentSave(state);
  }, 450);
}

async function flushDocumentSave(state: DocumentRuntimeState): Promise<void> {
  const document = state.store.getState().document;
  if (state.disposed || state.saving || !document || state.pendingContent === undefined) return;
  const content = state.pendingContent;
  state.pendingContent = undefined;
  state.saving = true;
  const controller = new AbortController();
  state.activeController = controller;
  dispatchDocumentAction(state, DocumentAction.BeganDocumentSave());
  try {
    const result = await state.gateway.save({
      documentId: state.documentId,
      title: document.title,
      content,
      expectedRevision: document.revision,
    }, controller.signal);
    if (controller.signal.aborted || state.disposed) return;
    switch (result._tag) {
      case SaveDocumentResultType.Saved:
        dispatchDocumentAction(state, DocumentAction.SavedDocument(result.document));
        if (state.pendingContent === undefined && JSON.stringify(state.recovery.read(state.documentId)) === JSON.stringify(content)) {
          state.recovery.clear(state.documentId);
        }
        break;
      case SaveDocumentResultType.Conflicted:
        dispatchDocumentAction(state, DocumentAction.ConflictedDocument(result.current));
        state.pendingContent ??= content;
        break;
      default:
        result satisfies never;
    }
  } catch (cause) {
    state.pendingContent ??= content;
    if (!controller.signal.aborted && !state.disposed) {
      dispatchDocumentAction(state, DocumentAction.FailedDocumentSave(
        cause instanceof Error ? cause.message : "The document could not be saved.",
      ));
    }
  } finally {
    if (state.activeController === controller) state.activeController = undefined;
    state.saving = false;
    if (state.pendingContent !== undefined && state.store.getState().phase !== "Failed" && state.store.getState().phase !== "Conflicted") {
      void flushDocumentSave(state);
    }
  }
}

const noDraftRecovery: DraftRecoveryPort = {
  read: () => undefined,
  write: () => undefined,
  clear: () => undefined,
};

export function createLocalStorageDraftRecovery(storage: Storage): DraftRecoveryPort {
  const key = (documentId: DocumentId) => `speech-edit:draft:${documentId}`;
  return {
    read: (documentId) => {
      const value = storage.getItem(key(documentId));
      if (!value) return undefined;
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && (parsed as { type?: unknown }).type === "doc"
          ? parsed as TiptapDocumentContent
          : undefined;
      } catch {
        return undefined;
      }
    },
    write: (documentId, content) => storage.setItem(key(documentId), JSON.stringify(content)),
    clear: (documentId) => storage.removeItem(key(documentId)),
  };
}

export function createDocumentRuntime(
  gateway: DocumentGateway,
  documentId: DocumentId,
  recovery: DraftRecoveryPort = noDraftRecovery,
): DocumentRuntime {
  const store: DocumentStore = createStore<DocumentModel>()(
    devtools(subscribeWithSelector(initialDocumentModel), { name: "Speech to Edit" }),
  );
  const state: DocumentRuntimeState = {
    store,
    gateway,
    recovery,
    documentId,
    editorPort: undefined,
    pendingContent: undefined,
    debounceTimer: undefined,
    activeController: undefined,
    saving: false,
    disposed: false,
    disposal: undefined,
  };
  return {
    state,
    store,
    load: () => loadDocument(state),
    queueSave: (content) => queueDocumentSave(state, content),
    retrySave: () => { void flushDocumentSave(state); },
    propose: async (transcript, context) => {
      const controller = new AbortController();
      return state.gateway.propose({ transcript, context }, controller.signal);
    },
    transcribe: (request, signal) => state.gateway.transcribe(request, signal),
    registerEditorPort: (port) => {
      state.editorPort = port;
      return () => { if (state.editorPort === port) state.editorPort = undefined; };
    },
    getEditorPort: () => state.editorPort,
    dispose: () => disposeDocumentRuntime(state),
  };
}

function disposeDocumentRuntime(state: DocumentRuntimeState): Promise<void> {
  state.disposal ??= (async () => {
    if (state.disposed) return;
    state.disposed = true;
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.activeController?.abort();
    state.editorPort = undefined;
    state.store.devtools?.cleanup();
    await state.gateway.dispose();
  })();
  return state.disposal;
}

export class DocumentRpcClient extends Context.Tag("DocumentRpcClient")<
  DocumentRpcClient,
  Readonly<{
    GetDocument: (payload: { documentId: DocumentId }) => Effect.Effect<DocumentSnapshot, unknown>;
    SaveDocument: (payload: {
      documentId: DocumentId;
      title: string;
      content: TiptapDocumentContent;
      expectedRevision: number;
    }) => Effect.Effect<SaveDocumentResult, unknown>;
    ProposeEditorCommand: (payload: {
      transcript: string;
      context: CapturedEditorContext;
    }) => Effect.Effect<EditorProposalOutcome, unknown>;
    TranscribeVoice: (payload: {
      request: VoiceTranscriptionRequest;
    }) => Effect.Effect<VoiceTranscriptionResult, unknown>;
  }>
>() {}

export function createEffectRpcGateway(url = "/rpc"): DocumentGateway {
  const ProtocolLive = RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );
  const ClientLive = Layer.scoped(DocumentRpcClient, RpcClient.make(DocumentRpcs)).pipe(
    Layer.provide(ProtocolLive),
  );
  const runtime = ManagedRuntime.make(ClientLive);
  const execute = async <A>(effect: Effect.Effect<A, unknown, DocumentRpcClient>, signal: AbortSignal) => {
    const result = await runtime.runPromise(Effect.either(effect), { signal });
    return Either.match(result, {
      onLeft: (cause) => { throw cause; },
      onRight: (value) => value,
    });
  };
  return {
    load: (documentId, signal) => execute(
      Effect.flatMap(DocumentRpcClient, (client) => client.GetDocument({ documentId })),
      signal,
    ),
    save: (input, signal) => execute(
      Effect.flatMap(DocumentRpcClient, (client) => client.SaveDocument(input)),
      signal,
    ),
    propose: (input, signal) => execute(
      Effect.flatMap(DocumentRpcClient, (client) => client.ProposeEditorCommand(input)),
      signal,
    ),
    transcribe: (request, signal) => execute(
      Effect.flatMap(DocumentRpcClient, (client) =>
        client.TranscribeVoice({ request }),
      ),
      signal,
    ),
    dispose: runtime.dispose,
  };
}
