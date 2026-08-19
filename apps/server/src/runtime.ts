import { createServer, type Server as HttpServerInstance } from "node:http";
import { DocumentRpcs } from "@app/contracts";
import { DocumentRepository } from "@app/domain";
import { createSqliteStorage, type SqliteStorageRuntime } from "@app/storage-sqlite";
import { VoiceFailure } from "@app/voice-capture";
import type { VoiceTranscriptionPort } from "@app/voice-capture/server";
import { HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Fiber, Layer } from "effect";

import {
  DocumentRpcHandlersLive,
  VoiceTranscriptionService,
} from "./application";

export type ServerRuntimeState = {
  storage: SqliteStorageRuntime;
  fiber: Fiber.RuntimeFiber<void, unknown> | undefined;
  started: boolean;
  disposed: boolean;
  disposal: Promise<void> | undefined;
};

export type ServerRuntime = Readonly<{
  state: ServerRuntimeState;
  start: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export type CreateServerRuntimeOptions = Readonly<{
  databasePath: string;
  migrationsFolder?: string;
  host?: string;
  port: number;
  transcriptionPort?: VoiceTranscriptionPort;
}>;

const UnconfiguredTranscriptionPort: VoiceTranscriptionPort = {
  transcribe: (request) =>
    Effect.fail(
      VoiceFailure.ProviderFailed(
        request.request.operationId,
        request.request.editorContext.captureId,
      ),
    ),
};

export async function createServerRuntime(options: CreateServerRuntimeOptions): Promise<ServerRuntime> {
  const storage = createSqliteStorage({
    databasePath: options.databasePath,
    ...(options.migrationsFolder ? { migrationsFolder: options.migrationsFolder } : {}),
  });
  try {
    await Effect.runPromise(storage.migrate);
  } catch (cause) {
    storage.close();
    throw cause;
  }
  const RepositoryLive = Layer.succeed(DocumentRepository, storage.repository);
  const TranscriptionLive = Layer.succeed(
    VoiceTranscriptionService,
    options.transcriptionPort ?? UnconfiguredTranscriptionPort,
  );
  const HandlersLive = DocumentRpcHandlersLive.pipe(
    Layer.provide(Layer.merge(RepositoryLive, TranscriptionLive)),
  );
  const RpcLive = Layer.merge(HandlersLive, RpcSerialization.layerNdjson);
  const host = options.host ?? "127.0.0.1";
  const httpServer = createServer();
  const ServerLive = NodeHttpServer.layer(() => httpServer, { host, port: options.port });
  const program = Effect.scoped(
    Effect.gen(function* () {
      const rpcApp = yield* RpcServer.toHttpApp(DocumentRpcs);
      yield* HttpServer.serveEffect(rpcApp);
      yield* Effect.never;
    }),
  ).pipe(Effect.provide(Layer.merge(ServerLive, RpcLive)));
  const state: ServerRuntimeState = {
    storage,
    fiber: undefined,
    started: false,
    disposed: false,
    disposal: undefined,
  };
  return {
    state,
    start: () => startServerRuntime(state, program, httpServer),
    dispose: () => disposeServerRuntime(state, httpServer),
  };
}

async function startServerRuntime(
  state: ServerRuntimeState,
  program: Effect.Effect<void, unknown>,
  server: HttpServerInstance,
): Promise<void> {
  if (state.started || state.disposed) return;
  state.fiber = Effect.runFork(program);
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const failed = (cause: Error) => { cleanup(); reject(cause); };
      const cleanup = () => {
        server.off("listening", ready);
        server.off("error", failed);
      };
      server.once("listening", ready);
      server.once("error", failed);
    });
  }
  state.started = true;
}

function disposeServerRuntime(
  state: ServerRuntimeState,
  server: HttpServerInstance,
): Promise<void> {
  state.disposal ??= disposeServerResources(state, server);
  return state.disposal;
}

async function disposeServerResources(
  state: ServerRuntimeState,
  server: HttpServerInstance,
): Promise<void> {
  if (state.disposed) return;
  state.disposed = true;
  try {
    if (state.fiber) await Effect.runPromise(Fiber.interrupt(state.fiber));
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  } finally {
    state.storage.close();
  }
}
