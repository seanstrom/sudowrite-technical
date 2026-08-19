import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";

import { makeTiptapDocumentRewritePort } from "./speech-interpretation";

const SourceDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Draft" }] },
    { type: "paragraph", content: [{ type: "text", text: "Some bold prose.", marks: [{ type: "bold" }] }] },
  ],
} as const;

describe("Tiptap Markdown document rewrite port", () => {
  it("sends Markdown to the provider and returns validated JSON with safe preview facts", async () => {
    const requests: Array<unknown> = [];
    const port = makeTiptapDocumentRewritePort({
      rewrite: (request) => {
        requests.push(request);
        return Effect.succeed("# Revised\n\nSome **clear prose**.");
      },
    });
    const result = await Effect.runPromise(port.rewrite({
      instruction: "make it clear",
      documentContent: SourceDocument,
      maximumOutputLength: 8_000,
    }));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      instruction: "make it clear",
      sourceMarkdown: expect.stringContaining("# Draft"),
      maximumOutputLength: 8_000,
    });
    expect(result.replacementContent).toMatchObject({ type: "doc" });
    expect(result.preview).toMatchObject({
      beforeExcerpt: "Draft Some bold prose.",
      afterExcerpt: "Revised Some clear prose.",
      beforeWordCount: 4,
      afterWordCount: 4,
    });
  });

  it("fails closed when returned Markdown exceeds the bounded output", async () => {
    const port = makeTiptapDocumentRewritePort({
      rewrite: () => Effect.succeed("x".repeat(100)),
    });
    const result = await Effect.runPromise(Effect.either(port.rewrite({
      instruction: "rewrite",
      documentContent: SourceDocument,
      maximumOutputLength: 20,
    })));
    expect(Either.isLeft(result)).toBe(true);
  });
});
