import type { Editor } from "@tiptap/core";

export const EditorCommandType = {
  Bold: "Bold",
  Italic: "Italic",
  Paragraph: "Paragraph",
  Heading: "Heading",
  Undo: "Undo",
  Redo: "Redo",
} as const;
export type EditorCommand =
  (typeof EditorCommandType)[keyof typeof EditorCommandType];

export const EditorEditType = {
  ReplaceRange: "ReplaceRange",
  InsertText: "InsertText",
  ReplaceAll: "ReplaceAll",
  FormatRange: "FormatRange",
} as const;

export type EditorRange = Readonly<{ from: number; to: number }>;
export type CapturedEditorContext = Readonly<{
  documentId: string;
  range: EditorRange;
  selectedText: string;
  documentText: string;
  fingerprint: string;
}>;

export const EditorEdit = {
  ReplaceRange: (range: EditorRange, text: string, fingerprint: string) => ({
    type: EditorEditType.ReplaceRange,
    range,
    text,
    fingerprint,
  }) as const,
  InsertText: (position: number, text: string, fingerprint: string) => ({
    type: EditorEditType.InsertText,
    position,
    text,
    fingerprint,
  }) as const,
  ReplaceAll: (search: string, replacement: string, fingerprint: string) => ({
    type: EditorEditType.ReplaceAll,
    search,
    replacement,
    fingerprint,
  }) as const,
  FormatRange: (
    range: EditorRange,
    mark: "bold" | "italic",
    fingerprint: string,
  ) => ({
    type: EditorEditType.FormatRange,
    range,
    mark,
    fingerprint,
  }) as const,
};
export type EditorEdit = ReturnType<
  (typeof EditorEdit)[keyof typeof EditorEdit]
>;

export const EditorApplyResultType = {
  Applied: "Applied",
  Stale: "Stale",
  Unsupported: "Unsupported",
  Failed: "Failed",
} as const;
export const EditorApplyResult = {
  Applied: () => ({ type: EditorApplyResultType.Applied }) as const,
  Stale: () => ({ type: EditorApplyResultType.Stale }) as const,
  Unsupported: (message: string) => ({
    type: EditorApplyResultType.Unsupported,
    message,
  }) as const,
  Failed: (message: string) => ({
    type: EditorApplyResultType.Failed,
    message,
  }) as const,
};
export type EditorApplyResult = ReturnType<
  (typeof EditorApplyResult)[keyof typeof EditorApplyResult]
>;

export type EditorApplicationPort = Readonly<{
  capture: () => CapturedEditorContext;
  preview: (edit: EditorEdit) => Readonly<{ before: string; after: string }>;
  validate: (edit: EditorEdit) => boolean;
  apply: (edit: EditorEdit) => EditorApplyResult;
}>;

export function runEditorCommand(editor: Editor, command: EditorCommand): boolean {
  switch (command) {
    case EditorCommandType.Bold:
      return editor.chain().focus().toggleBold().run();
    case EditorCommandType.Italic:
      return editor.chain().focus().toggleItalic().run();
    case EditorCommandType.Paragraph:
      return editor.chain().focus().setParagraph().run();
    case EditorCommandType.Heading:
      return editor.chain().focus().toggleHeading({ level: 1 }).run();
    case EditorCommandType.Undo:
      return editor.chain().focus().undo().run();
    case EditorCommandType.Redo:
      return editor.chain().focus().redo().run();
    default:
      command satisfies never;
      return false;
  }
}

const fingerprintEditor = (editor: Editor): string =>
  JSON.stringify(editor.getJSON());

export function createEditorApplicationPort(
  documentId: string,
  editor: Editor,
): EditorApplicationPort {
  return {
    capture: () => {
      const { from, to } = editor.state.selection;
      return {
        documentId,
        range: { from, to },
        selectedText: editor.state.doc.textBetween(from, to, " "),
        documentText: editor.state.doc.textContent,
        fingerprint: fingerprintEditor(editor),
      };
    },
    preview: (edit) => previewEditorEdit(editor, edit),
    validate: (edit) => edit.fingerprint === fingerprintEditor(editor),
    apply: (edit) => applyEditorEdit(editor, edit),
  };
}

function previewEditorEdit(
  editor: Editor,
  edit: EditorEdit,
): Readonly<{ before: string; after: string }> {
  const before = editor.state.doc.textContent;
  switch (edit.type) {
    case EditorEditType.ReplaceRange:
      return {
        before: editor.state.doc.textBetween(edit.range.from, edit.range.to, " "),
        after: edit.text,
      };
    case EditorEditType.InsertText:
      return { before: "", after: edit.text };
    case EditorEditType.ReplaceAll:
      return { before: edit.search, after: edit.replacement };
    case EditorEditType.FormatRange:
      return {
        before: editor.state.doc.textBetween(edit.range.from, edit.range.to, " "),
        after: editor.state.doc.textBetween(edit.range.from, edit.range.to, " "),
      };
    default:
      edit satisfies never;
      return { before, after: before };
  }
}

function applyEditorEdit(editor: Editor, edit: EditorEdit): EditorApplyResult {
  if (edit.fingerprint !== fingerprintEditor(editor)) {
    return EditorApplyResult.Stale();
  }

  try {
    switch (edit.type) {
      case EditorEditType.ReplaceRange:
        return editor
          .chain()
          .focus()
          .insertContentAt(edit.range, edit.text)
          .run()
          ? EditorApplyResult.Applied()
          : EditorApplyResult.Failed("The selected text could not be replaced.");
      case EditorEditType.InsertText:
        return editor
          .chain()
          .focus()
          .insertContentAt(edit.position, edit.text)
          .run()
          ? EditorApplyResult.Applied()
          : EditorApplyResult.Failed("The text could not be inserted.");
      case EditorEditType.ReplaceAll: {
        if (edit.search.length === 0) {
          return EditorApplyResult.Unsupported("Search text cannot be empty.");
        }
        const transaction = editor.state.tr;
        const matches: Array<EditorRange> = [];
        editor.state.doc.descendants((node, position) => {
          if (!node.isText || !node.text) return;
          let index = node.text.indexOf(edit.search);
          while (index >= 0) {
            matches.push({
              from: position + index,
              to: position + index + edit.search.length,
            });
            index = node.text.indexOf(edit.search, index + edit.search.length);
          }
        });
        for (const match of matches.reverse()) {
          transaction.insertText(edit.replacement, match.from, match.to);
        }
        if (matches.length === 0) {
          return EditorApplyResult.Unsupported("No matching text was found.");
        }
        editor.view.dispatch(transaction);
        return EditorApplyResult.Applied();
      }
      case EditorEditType.FormatRange: {
        const chain = editor.chain().focus().setTextSelection(edit.range);
        const applied = edit.mark === "bold" ? chain.toggleBold().run() : chain.toggleItalic().run();
        return applied
          ? EditorApplyResult.Applied()
          : EditorApplyResult.Failed("The selected text could not be formatted.");
      }
      default:
        edit satisfies never;
        return EditorApplyResult.Unsupported("The edit is not supported.");
    }
  } catch (cause) {
    return EditorApplyResult.Failed(
      cause instanceof Error ? cause.message : "The edit could not be applied.",
    );
  }
}
