import {
  DocumentRpcs,
  SaveDocumentResultType,
  type DocumentId,
  type DocumentSnapshot,
  type SaveDocumentResult,
} from "@app/contracts";
import type { EditorApplicationPort } from "@app/editor";
import { BrowserHttpClient } from "@effect/platform-browser";
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
    html: string;
    expectedRevision: number;
  }>, signal: AbortSignal) => Promise<SaveDocumentResult>;
  dispose: () => Promise<void>;
}>;

export type DocumentStore = Omit<StoreApi<DocumentModel>, "setState"> & Readonly<{
  setState: NamedSet<DocumentModel>;
  devtools?: Readonly<{ cleanup: () => void }>;
}>;

export type DocumentRuntimeState = {
  store: DocumentStore;
  gateway: DocumentGateway;
  documentId: DocumentId;
  editorPort: EditorApplicationPort | undefined;
  pendingHtml: string | undefined;
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
  queueSave: (html: string) => void;
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
      if (!controller.signal.aborted) dispatchDocumentAction(state, DocumentAction.LoadedDocument(document));
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

function queueDocumentSave(state: DocumentRuntimeState, html: string): void {
  if (state.disposed) return;
  state.pendingHtml = html;
  dispatchDocumentAction(state, DocumentAction.ChangedDocument());
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = undefined;
    void flushDocumentSave(state);
  }, 450);
}

async function flushDocumentSave(state: DocumentRuntimeState): Promise<void> {
  const document = state.store.getState().document;
  if (state.disposed || state.saving || !document || state.pendingHtml === undefined) return;
  const html = state.pendingHtml;
  state.pendingHtml = undefined;
  state.saving = true;
  const controller = new AbortController();
  state.activeController = controller;
  dispatchDocumentAction(state, DocumentAction.BeganDocumentSave());
  try {
    const result = await state.gateway.save({
      documentId: state.documentId,
      title: document.title,
      html,
      expectedRevision: document.revision,
    }, controller.signal);
    if (controller.signal.aborted || state.disposed) return;
    switch (result._tag) {
      case SaveDocumentResultType.Saved:
        dispatchDocumentAction(state, DocumentAction.SavedDocument(result.document));
        break;
      case SaveDocumentResultType.Conflicted:
        dispatchDocumentAction(state, DocumentAction.ConflictedDocument(result.current));
        state.pendingHtml = undefined;
        break;
      default:
        result satisfies never;
    }
  } catch (cause) {
    if (!controller.signal.aborted) dispatchDocumentAction(state, DocumentAction.FailedDocumentSave(
      cause instanceof Error ? cause.message : "The document could not be saved.",
    ));
  } finally {
    if (state.activeController === controller) state.activeController = undefined;
    state.saving = false;
    if (state.pendingHtml !== undefined) void flushDocumentSave(state);
  }
}

export function createDocumentRuntime(gateway: DocumentGateway, documentId: DocumentId): DocumentRuntime {
  const store: DocumentStore = createStore<DocumentModel>()(
    devtools(subscribeWithSelector(initialDocumentModel), { name: "Speech to Edit" }),
  );
  const state: DocumentRuntimeState = {
    store,
    gateway,
    documentId,
    editorPort: undefined,
    pendingHtml: undefined,
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
    queueSave: (html) => queueDocumentSave(state, html),
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
      html: string;
      expectedRevision: number;
    }) => Effect.Effect<SaveDocumentResult, unknown>;
  }>
>() {}

export function createEffectRpcGateway(url = "/rpc"): DocumentGateway {
  const ProtocolLive = RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(BrowserHttpClient.layerXMLHttpRequest),
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
    dispose: runtime.dispose,
  };
}
