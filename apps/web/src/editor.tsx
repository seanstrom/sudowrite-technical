import {
  createEditorApplicationPort,
  EditorCommandType,
  runEditorCommand,
} from "@app/editor";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import type { DocumentRuntime } from "./runtime";

export type DocumentEditorProps = Readonly<{
  documentId: string;
  initialHtml: string;
  runtime: DocumentRuntime;
}>;

type ToolbarProjection = Readonly<{
  bold: boolean;
  italic: boolean;
  heading: boolean;
  canUndo: boolean;
  canRedo: boolean;
}>;

function Toolbar({ editor }: Readonly<{ editor: Editor }>) {
  const projection = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      heading: current.isActive("heading", { level: 1 }),
      canUndo: current.can().chain().focus().undo().run(),
      canRedo: current.can().chain().focus().redo().run(),
    }),
  }) as ToolbarProjection;
  const command = (value: Parameters<typeof runEditorCommand>[1]) => () => {
    runEditorCommand(editor, value);
  };
  return (
    <div className="toolbar" role="toolbar" aria-label="Editor formatting">
      <button onClick={command(EditorCommandType.Paragraph)} type="button">Paragraph</button>
      <button className={projection.heading ? "active" : ""} onClick={command(EditorCommandType.Heading)} type="button">Heading</button>
      <button className={projection.bold ? "active" : ""} onClick={command(EditorCommandType.Bold)} type="button"><strong>B</strong></button>
      <button className={projection.italic ? "active" : ""} onClick={command(EditorCommandType.Italic)} type="button"><em>I</em></button>
      <span className="toolbar-divider" />
      <button disabled={!projection.canUndo} onClick={command(EditorCommandType.Undo)} type="button">Undo</button>
      <button disabled={!projection.canRedo} onClick={command(EditorCommandType.Redo)} type="button">Redo</button>
    </div>
  );
}

export function DocumentEditor({ documentId, initialHtml, runtime }: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml,
    editorProps: {
      attributes: {
        "aria-label": "Document editor",
        class: "editor-surface",
      },
    },
    onUpdate: ({ editor: current }) => runtime.queueSave(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return undefined;
    return runtime.registerEditorPort(createEditorApplicationPort(documentId, editor));
  }, [documentId, editor, runtime]);

  if (!editor) return <div className="editor-loading">Preparing editor…</div>;
  return (
    <section className="editor-card">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </section>
  );
}
