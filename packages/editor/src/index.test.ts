import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import {
  createEditorApplicationPort,
  EditorApplyResultType,
  EditorEdit,
} from "./index";

describe("editor application port", () => {
  it("validates, applies, and undoes a replacement through real editor transactions", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello world</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture();
    const edit = EditorEdit.ReplaceRange(captured.range, "Goodbye", captured.fingerprint);

    expect(captured.selectedText).toBe("Hello");
    expect(port.validate(edit)).toBe(true);
    expect(port.apply(edit).type).toBe(EditorApplyResultType.Applied);
    expect(editor.getText()).toBe("Goodbye world");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("Hello world");
    editor.destroy();
  });

  it("rejects a proposal after the document changes", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Hello</p>" });
    const port = createEditorApplicationPort("draft", editor);
    const captured = port.capture();
    const edit = EditorEdit.InsertText(1, "Before ", captured.fingerprint);
    editor.commands.insertContent("after");
    expect(port.apply(edit).type).toBe(EditorApplyResultType.Stale);
    editor.destroy();
  });
});
