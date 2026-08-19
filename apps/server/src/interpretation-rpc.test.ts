import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DocumentId, EditorProposalOutcomeType } from "@app/contracts";
import { SpeechCommandIntentType, SpeechTextScope } from "@app/speech-command";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createEffectRpcGateway } from "../../web/src/runtime";
import { createServerRuntime } from "./runtime";
import {
  makeSpeechInterpretationService,
  makeTiptapDocumentRewritePort,
} from "./speech-interpretation";

describe("speech interpretation RPC", () => {
  it("routes transcript and capture through the real planner to a whole-document proposal", async () => {
    const folder = mkdtempSync(join(tmpdir(), "speech-edit-rpc-"));
    const port = 31_300 + (process.pid % 1_000);
    const runtime = await createServerRuntime({
      databasePath: join(folder, "test.sqlite"),
      migrationsFolder: resolve(process.cwd(), "packages/storage-sqlite/drizzle"),
      port,
      interpretationService: makeSpeechInterpretationService({
        classifier: {
          classify: () => Effect.succeed({
            kind: "Classified",
            intent: SpeechCommandIntentType.Rewrite,
            scope: SpeechTextScope.Document,
            occurrence: null,
            mark: null,
            enabled: null,
            matchText: null,
            replacementText: null,
            insertionText: null,
            rewriteInstruction: "make concise",
            reason: null,
            clarification: null,
          }),
        },
        selectionRewriter: { rewrite: () => Effect.die("selection path must not run") },
        documentRewriter: makeTiptapDocumentRewritePort({
          rewrite: () => Effect.succeed("# Revised\n\nConcise prose."),
        }),
      }),
    });
    const gateway = createEffectRpcGateway(`http://127.0.0.1:${port}/rpc`);
    try {
      await runtime.start();
      const result = await gateway.propose({
        transcript: "Make the whole document concise",
        context: {
          captureId: "capture-rpc",
          documentId: DocumentId.make("draft"),
          documentRevision: 0,
          documentContent: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Long original prose." }] }],
          },
          documentText: "Long original prose.",
          target: {
            targetId: "1:1:0",
            from: 1,
            to: 1,
            selectedText: "",
            documentFingerprint: JSON.stringify({
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Long original prose." }] }],
            }),
          },
        },
      }, new AbortController().signal);
      expect(result._tag).toBe(EditorProposalOutcomeType.Proposed);
      if (result._tag === EditorProposalOutcomeType.Proposed) {
        expect(result.command).toMatchObject({
          _tag: "ReplaceDocument",
          content: { type: "doc" },
        });
      }
    } finally {
      await gateway.dispose();
      await runtime.dispose();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
