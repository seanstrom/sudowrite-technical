import { getSchema, type Editor, type JSONContent } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";

const EditorSchema = getSchema([StarterKit]);

export function validateTiptapDocumentContent(content: unknown): JSONContent {
  EditorSchema.nodeFromJSON(content);
  return content as JSONContent;
}

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

export type EditorTarget = Readonly<{
  targetId: string;
  from: number;
  to: number;
  selectedText: string;
  documentFingerprint: string;
}>;

export type CapturedEditorContext = Readonly<{
  documentId: string;
  target: EditorTarget;
  documentText: string;
}>;

export const EditorEditType = {
  ReplaceRange: "ReplaceRange",
  InsertText: "InsertText",
  ReplaceAll: "ReplaceAll",
  SetMark: "SetMark",
} as const;

export const EditorEdit = {
  ReplaceRange: (target: EditorTarget, text: string) => ({
    type: EditorEditType.ReplaceRange,
    target,
    text,
  }) as const,
  InsertText: (target: EditorTarget, text: string, at: "Before" | "After") => ({
    type: EditorEditType.InsertText,
    target,
    text,
    at,
  }) as const,
  ReplaceAll: (search: string, replacement: string, documentFingerprint: string) => ({
    type: EditorEditType.ReplaceAll,
    search,
    replacement,
    documentFingerprint,
  }) as const,
  SetMark: (
    target: EditorTarget,
    mark: "bold" | "italic",
    enabled: boolean,
  ) => ({
    type: EditorEditType.SetMark,
    target,
    mark,
    enabled,
  }) as const,
};
export type EditorEdit = ReturnType<
  (typeof EditorEdit)[keyof typeof EditorEdit]
>;

export const EditorValidationResultType = {
  Valid: "Valid",
  Stale: "Stale",
  Unsupported: "Unsupported",
} as const;
export const EditorValidationResult = {
  Valid: (targetId: string | undefined) => ({
    type: EditorValidationResultType.Valid,
    targetId,
  }) as const,
  Stale: (targetId: string | undefined, reason: string) => ({
    type: EditorValidationResultType.Stale,
    targetId,
    reason,
  }) as const,
  Unsupported: (reason: string) => ({
    type: EditorValidationResultType.Unsupported,
    reason,
  }) as const,
};
export type EditorValidationResult = ReturnType<
  (typeof EditorValidationResult)[keyof typeof EditorValidationResult]
>;

export const EditorPreviewResultType = {
  Ready: "Ready",
  Stale: "Stale",
  Unsupported: "Unsupported",
} as const;
export const EditorPreviewResult = {
  Ready: (value: Readonly<{
    targetId: string | undefined;
    before: string;
    after: string;
    occurrenceCount: number;
    description: string;
  }>) => ({ type: EditorPreviewResultType.Ready, ...value }) as const,
  Stale: (targetId: string | undefined, reason: string) => ({
    type: EditorPreviewResultType.Stale,
    targetId,
    reason,
  }) as const,
  Unsupported: (reason: string) => ({
    type: EditorPreviewResultType.Unsupported,
    reason,
  }) as const,
};
export type EditorPreviewResult = ReturnType<
  (typeof EditorPreviewResult)[keyof typeof EditorPreviewResult]
>;

export const EditorApplyResultType = {
  Applied: "Applied",
  Stale: "Stale",
  Unsupported: "Unsupported",
  Failed: "Failed",
} as const;
export const EditorApplyResult = {
  Applied: (targetId: string | undefined) => ({
    type: EditorApplyResultType.Applied,
    targetId,
    transactionCount: 1 as const,
  }) as const,
  Stale: (targetId: string | undefined, reason: string) => ({
    type: EditorApplyResultType.Stale,
    targetId,
    reason,
  }) as const,
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
  preview: (edit: EditorEdit) => EditorPreviewResult;
  validate: (edit: EditorEdit) => EditorValidationResult;
  apply: (edit: EditorEdit, operationId?: string) => EditorApplyResult;
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

const fingerprintEditor = (editor: Editor): string => JSON.stringify(editor.getJSON());

function captureTarget(editor: Editor): EditorTarget {
  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, " ");
  return {
    targetId: `${from}:${to}:${selectedText.length}`,
    from,
    to,
    selectedText,
    documentFingerprint: fingerprintEditor(editor),
  };
}

function targetForEdit(edit: EditorEdit): EditorTarget | undefined {
  switch (edit.type) {
    case EditorEditType.ReplaceRange:
    case EditorEditType.InsertText:
    case EditorEditType.SetMark:
      return edit.target;
    case EditorEditType.ReplaceAll:
      return undefined;
    default:
      edit satisfies never;
      return undefined;
  }
}

function validateEditorEdit(editor: Editor, edit: EditorEdit): EditorValidationResult {
  const fingerprint = fingerprintEditor(editor);
  if (edit.type === EditorEditType.ReplaceAll) {
    if (edit.search.length === 0) return EditorValidationResult.Unsupported("Search text cannot be empty.");
    return edit.documentFingerprint === fingerprint
      ? EditorValidationResult.Valid(undefined)
      : EditorValidationResult.Stale(undefined, "The document changed after this proposal was created.");
  }
  const target = targetForEdit(edit)!;
  if (target.documentFingerprint !== fingerprint) {
    return EditorValidationResult.Stale(target.targetId, "The document changed after this target was captured.");
  }
  if (target.from < 0 || target.to < target.from || target.to > editor.state.doc.content.size) {
    return EditorValidationResult.Stale(target.targetId, "The target range no longer exists.");
  }
  const selectedText = editor.state.doc.textBetween(target.from, target.to, " ");
  if (selectedText !== target.selectedText) {
    return EditorValidationResult.Stale(target.targetId, "The targeted text changed after capture.");
  }
  if (edit.type === EditorEditType.SetMark && target.from === target.to) {
    return EditorValidationResult.Unsupported("Formatting requires selected text.");
  }
  return EditorValidationResult.Valid(target.targetId);
}

function countOccurrences(value: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let index = value.indexOf(search);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(search, index + search.length);
  }
  return count;
}

function previewEditorEdit(editor: Editor, edit: EditorEdit): EditorPreviewResult {
  const validation = validateEditorEdit(editor, edit);
  if (validation.type === EditorValidationResultType.Stale) {
    return EditorPreviewResult.Stale(validation.targetId, validation.reason);
  }
  if (validation.type === EditorValidationResultType.Unsupported) {
    return EditorPreviewResult.Unsupported(validation.reason);
  }
  switch (edit.type) {
    case EditorEditType.ReplaceRange:
      return EditorPreviewResult.Ready({
        targetId: edit.target.targetId,
        before: edit.target.selectedText,
        after: edit.text,
        occurrenceCount: 1,
        description: "Replace the captured selection",
      });
    case EditorEditType.InsertText:
      return EditorPreviewResult.Ready({
        targetId: edit.target.targetId,
        before: "",
        after: edit.text,
        occurrenceCount: 1,
        description: `Insert text ${edit.at.toLowerCase()} the captured selection`,
      });
    case EditorEditType.ReplaceAll: {
      const occurrenceCount = countOccurrences(editor.state.doc.textContent, edit.search);
      return occurrenceCount > 0
        ? EditorPreviewResult.Ready({
            targetId: undefined,
            before: edit.search,
            after: edit.replacement,
            occurrenceCount,
            description: `Replace ${occurrenceCount} matching occurrence${occurrenceCount === 1 ? "" : "s"}`,
          })
        : EditorPreviewResult.Unsupported("No matching text was found.");
    }
    case EditorEditType.SetMark:
      return EditorPreviewResult.Ready({
        targetId: edit.target.targetId,
        before: edit.target.selectedText,
        after: edit.target.selectedText,
        occurrenceCount: 1,
        description: `${edit.enabled ? "Enable" : "Disable"} ${edit.mark} formatting`,
      });
    default:
      edit satisfies never;
      return EditorPreviewResult.Unsupported("The edit is not supported.");
  }
}

function resolveMark(editor: Editor, mark: "bold" | "italic"): MarkType | undefined {
  return editor.state.schema.marks[mark];
}

function applyEditorEdit(
  editor: Editor,
  edit: EditorEdit,
  operationId: string | undefined,
): EditorApplyResult {
  const validation = validateEditorEdit(editor, edit);
  if (validation.type === EditorValidationResultType.Stale) {
    return EditorApplyResult.Stale(validation.targetId, validation.reason);
  }
  if (validation.type === EditorValidationResultType.Unsupported) {
    return EditorApplyResult.Unsupported(validation.reason);
  }

  try {
    let transaction = editor.state.tr;
    if (operationId) transaction = transaction.setMeta("speechEditOperationId", operationId);
    switch (edit.type) {
      case EditorEditType.ReplaceRange:
        editor.view.dispatch(transaction.insertText(edit.text, edit.target.from, edit.target.to));
        return EditorApplyResult.Applied(edit.target.targetId);
      case EditorEditType.InsertText: {
        const position = edit.at === "Before" ? edit.target.from : edit.target.to;
        editor.view.dispatch(transaction.insertText(edit.text, position));
        return EditorApplyResult.Applied(edit.target.targetId);
      }
      case EditorEditType.ReplaceAll: {
        const matches: Array<Readonly<{ from: number; to: number }>> = [];
        editor.state.doc.descendants((node, position) => {
          if (!node.isText || !node.text) return;
          let index = node.text.indexOf(edit.search);
          while (index >= 0) {
            matches.push({ from: position + index, to: position + index + edit.search.length });
            index = node.text.indexOf(edit.search, index + edit.search.length);
          }
        });
        if (matches.length === 0) return EditorApplyResult.Unsupported("No matching text was found.");
        for (const match of matches.reverse()) {
          transaction = transaction.insertText(edit.replacement, match.from, match.to);
        }
        editor.view.dispatch(transaction);
        return EditorApplyResult.Applied(undefined);
      }
      case EditorEditType.SetMark: {
        const mark = resolveMark(editor, edit.mark);
        if (!mark) return EditorApplyResult.Unsupported(`The ${edit.mark} mark is unavailable.`);
        transaction = edit.enabled
          ? transaction.addMark(edit.target.from, edit.target.to, mark.create())
          : transaction.removeMark(edit.target.from, edit.target.to, mark);
        editor.view.dispatch(transaction);
        return EditorApplyResult.Applied(edit.target.targetId);
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

export function createEditorApplicationPort(
  documentId: string,
  editor: Editor,
): EditorApplicationPort {
  return {
    capture: () => ({
      documentId,
      target: captureTarget(editor),
      documentText: editor.state.doc.textContent,
    }),
    preview: (edit) => previewEditorEdit(editor, edit),
    validate: (edit) => validateEditorEdit(editor, edit),
    apply: (edit, operationId) => applyEditorEdit(editor, edit, operationId),
  };
}
