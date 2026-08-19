import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import {
  createEditorApplicationPort,
  createTiptapMarkdownCodec,
  EditorApplyResultType,
  EditorEdit,
  EditorValidationResultType,
  parseLegacyHtmlToTiptapContent,
  validateTiptapDocumentContent,
} from "./index";

describe("editor application port", () => {
  it("validates, applies, and undoes a replacement through real editor transactions", () => {
    const editor = new Editor({ extensions: [StarterKit], content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }] } });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture({ captureId: "capture-1", documentRevision: 1 });
    const edit = EditorEdit.ReplaceRange(captured.target, "Goodbye");

    expect(captured.target.selectedText).toBe("Hello");
    expect(port.validate(edit).type).toBe(EditorValidationResultType.Valid);
    expect(port.apply(edit, "proposal-1")).toMatchObject({ type: EditorApplyResultType.Applied, transactionCount: 1 });
    expect(editor.getText()).toBe("Goodbye world");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("Hello world");
    editor.destroy();
  });

  it("rejects a proposal after the document changes", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture({ captureId: "capture-2", documentRevision: 1 });
    const edit = EditorEdit.InsertText(captured.target, "Before ", "Before");
    editor.commands.insertContentAt(1, "after");
    expect(port.validate(edit).type).toBe(EditorValidationResultType.Stale);
    expect(port.apply(edit).type).toBe(EditorApplyResultType.Stale);
    editor.destroy();
  });

  it("keeps a proposal applicable across a save revision acknowledgement when JSON is unchanged", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const port = createEditorApplicationPort("draft", editor);
    const capturedBeforeSave = port.capture({ captureId: "capture-save", documentRevision: 1 });
    const capturedAfterSave = port.capture({ captureId: "capture-save", documentRevision: 2 });
    const edit = EditorEdit.ReplaceRange(capturedBeforeSave.target, "Goodbye");
    expect(capturedAfterSave.target.documentFingerprint).toBe(
      capturedBeforeSave.target.documentFingerprint,
    );
    expect(port.validate(edit).type).toBe(EditorValidationResultType.Valid);
    editor.destroy();
  });

  it("uses explicit enabled state for idempotent marks", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    let port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture({ captureId: "capture-3", documentRevision: 1 }).target, "bold", true)).type).toBe(EditorApplyResultType.Applied);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture({ captureId: "capture-4", documentRevision: 1 }).target, "bold", true)).type).toBe(EditorApplyResultType.Applied);
    expect(editor.isActive("bold")).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture({ captureId: "capture-5", documentRevision: 1 }).target, "bold", false)).type).toBe(EditorApplyResultType.Applied);
    expect(editor.isActive("bold")).toBe(false);
    editor.destroy();
  });

  it("rejects JSON invalid for the configured schema", () => {
    const editor = new Editor({ extensions: [StarterKit] });
    expect(() => validateTiptapDocumentContent({ type: "doc", content: [{ type: "unknown-node" }] })).toThrow();
    editor.destroy();
  });

  it("parses structural legacy HTML and marks through the configured schema", () => {
    expect(parseLegacyHtmlToTiptapContent(
      "<h2>Plan</h2><p>Hello <strong>bold</strong>.</p><ul><li><p>First</p></li></ul>",
    )).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", marks: [{ type: "bold" }], text: "bold" },
            { type: "text", text: "." },
          ],
        },
        {
          type: "bulletList",
          content: [{
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
          }],
        },
      ],
    });
  });

  it("round-trips supported Markdown structure through the configured schema", () => {
    const codec = createTiptapMarkdownCodec();
    const markdown = [
      "# Heading",
      "",
      "A **bold** and *italic* paragraph.",
      "",
      "1. Ordered",
      "2. List",
      "",
      "- Bullet",
      "- List",
      "",
      "> Quoted text",
    ].join("\n");
    const content = codec.parse(markdown);
    const serialized = codec.serialize(content);
    expect(serialized).toContain("# Heading");
    expect(serialized).toContain("**bold**");
    expect(serialized).toContain("*italic*");
    expect(serialized).toContain("1. Ordered");
    expect(serialized).toContain("- Bullet");
    expect(serialized).toContain("> Quoted text");
    expect(() => validateTiptapDocumentContent(content)).not.toThrow();
    codec.dispose();
  });

  it("owns first/all, selection/document, document-end, and whole-document edits", () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: "<p>cat cat</p><p>tail</p>",
    });
    editor.commands.setTextSelection({ from: 1, to: 8 });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture({ captureId: "capture-commands", documentRevision: 1 });

    expect(port.apply(EditorEdit.ReplaceText(
      captured.target,
      "Selection",
      "First",
      "cat",
      "dog",
    )).type).toBe(EditorApplyResultType.Applied);
    expect(editor.getText()).toContain("dog cat");

    editor.commands.undo();
    const documentCapture = port.capture({ captureId: "capture-document", documentRevision: 1 });
    expect(port.apply(EditorEdit.ReplaceText(
      documentCapture.target,
      "Document",
      "All",
      "cat",
      "dog",
    )).type).toBe(EditorApplyResultType.Applied);
    expect(editor.getText()).toContain("dog dog");

    editor.commands.undo();
    const endCapture = port.capture({ captureId: "capture-end", documentRevision: 1 });
    expect(port.apply(EditorEdit.InsertText(
      endCapture.target,
      " done",
      "DocumentEnd",
    )).type).toBe(EditorApplyResultType.Applied);
    expect(editor.getText()).toContain("tail done");

    editor.commands.undo();
    const replacementCapture = port.capture({ captureId: "capture-rewrite", documentRevision: 1 });
    expect(port.apply(EditorEdit.ReplaceDocument(
      replacementCapture.target.documentFingerprint,
      { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Rewritten" }] }] },
      {
        beforeExcerpt: "cat cat tail",
        afterExcerpt: "Rewritten",
        beforeWordCount: 3,
        afterWordCount: 1,
        beforeBlockCount: 2,
        afterBlockCount: 1,
      },
    ))).toMatchObject({ type: EditorApplyResultType.Applied, transactionCount: 1 });
    expect(editor.getText().trim()).toBe("Rewritten");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain("cat cat");
    editor.destroy();
  });

  it("replaces exactly one global occurrence for First across marked blocks", () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: "<p><strong>cat</strong> one</p><p>cat two</p>",
    });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture({ captureId: "capture-first", documentRevision: 1 });
    const result = port.apply(EditorEdit.ReplaceText(
      captured.target,
      "Document",
      "First",
      "cat",
      "dog",
    ));
    expect(result.type).toBe(EditorApplyResultType.Applied);
    expect(editor.getText()).toContain("dog one");
    expect(editor.getText()).toContain("cat two");
    editor.destroy();
  });
});
