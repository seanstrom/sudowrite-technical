import { useEffect } from "react";
import { useStore } from "zustand";

import { DocumentPhase } from "./document-model";
import { DocumentEditor } from "./editor";
import type { DocumentRuntime } from "./runtime";

export function App({ runtime }: Readonly<{ runtime: DocumentRuntime }>) {
  const model = useStore(runtime.store);
  useEffect(() => {
    runtime.load();
  }, [runtime]);

  const status = (() => {
    switch (model.phase) {
      case DocumentPhase.Loading: return "Loading draft…";
      case DocumentPhase.Dirty: return "Unsaved changes";
      case DocumentPhase.Saving: return "Saving…";
      case DocumentPhase.Ready: return "Saved";
      case DocumentPhase.Conflicted: return "Needs review";
      case DocumentPhase.Failed: return "Could not save";
      default:
        model.phase satisfies never;
        return "";
    }
  })();

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Speech to Edit</p>
          <h1>Shape your draft out loud.</h1>
          <p className="subtitle">Write freely, then describe the change you want.</p>
        </div>
        <div className={`save-status save-status--${model.phase.toLowerCase()}`} aria-live="polite">
          <span className="status-dot" />{status}
        </div>
      </header>

      {model.message ? (
        <div className="notice" role="alert">
          <span>{model.message}</span>
          {model.phase === DocumentPhase.Failed || model.phase === DocumentPhase.Conflicted ? (
            <button onClick={runtime.load} type="button">Try again</button>
          ) : null}
        </div>
      ) : null}
      {model.document ? (
        <div className="workspace">
          <DocumentEditor
            key={`${model.document.id}:${model.document.revision}`}
            documentId={model.document.id}
            initialHtml={model.document.html}
            runtime={runtime}
          />
          <aside className="voice-slot" aria-label="Voice editing">
            <div className="voice-icon" aria-hidden="true">⌁</div>
            <h2>Voice edit</h2>
            <p>Select text, then speak an instruction. Your proposed change will appear here for review.</p>
            <div className="voice-placeholder">Speech controls are connecting…</div>
          </aside>
        </div>
      ) : model.phase === DocumentPhase.Loading ? (
        <div className="page-loading">Opening your draft…</div>
      ) : null}
    </main>
  );
}
