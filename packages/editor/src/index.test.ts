import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import {
  createEditorApplicationPort,
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
    const captured = port.capture();
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
    const captured = port.capture();
    const edit = EditorEdit.InsertText(captured.target, "Before ", "Before");
    editor.commands.insertContentAt(1, "after");
    expect(port.validate(edit).type).toBe(EditorValidationResultType.Stale);
    expect(port.apply(edit).type).toBe(EditorApplyResultType.Stale);
    editor.destroy();
  });

  it("uses explicit enabled state for idempotent marks", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    let port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture().target, "bold", true)).type).toBe(EditorApplyResultType.Applied);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture().target, "bold", true)).type).toBe(EditorApplyResultType.Applied);
    expect(editor.isActive("bold")).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    port = createEditorApplicationPort("draft", editor);
    expect(port.apply(EditorEdit.SetMark(port.capture().target, "bold", false)).type).toBe(EditorApplyResultType.Applied);
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
});
