import {
  DocumentId,
  EditorProposalOutcomeType,
  ProposedEditorCommandType,
  type EditorProposalOutcome,
} from "@app/contracts";
import {
  EditorApplyResultType,
  EditorEdit,
  EditorPreviewResultType,
  EditorValidationResultType,
  type EditorEdit as EditorEditValue,
} from "@app/editor";
import { useEffect, useState } from "react";
import { useStore } from "zustand";

import { DocumentPhase } from "./document-model";
import { DocumentEditor } from "./editor";
import type { DocumentRuntime } from "./runtime";

export function App({ runtime }: Readonly<{ runtime: DocumentRuntime }>) {
  const model = useStore(runtime.store);
  const [instruction, setInstruction] = useState("Replace the selection with clearer prose");
  const [proposal, setProposal] = useState<EditorProposalOutcome>();
  const [proposalMessage, setProposalMessage] = useState<string>();
  const [reviewing, setReviewing] = useState(false);
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

  const proposedEdit = proposal?._tag === EditorProposalOutcomeType.Proposed
    ? toEditorEdit(proposal)
    : undefined;
  const preview = proposedEdit ? runtime.getEditorPort()?.preview(proposedEdit) : undefined;

  const reviewCommand = async () => {
    const port = runtime.getEditorPort();
    if (!port || !model.document) return setProposalMessage("The editor is not ready yet.");
    setReviewing(true);
    setProposalMessage(undefined);
    try {
      const captured = port.capture();
      setProposal(await runtime.propose(instruction, {
        ...captured,
        documentId: DocumentId.make(captured.documentId),
      }));
    } catch (cause) {
      setProposalMessage(cause instanceof Error ? cause.message : "The command could not be reviewed.");
    } finally {
      setReviewing(false);
    }
  };

  const applyProposal = () => {
    const port = runtime.getEditorPort();
    if (!port || !proposedEdit || proposal?._tag !== EditorProposalOutcomeType.Proposed) return;
    const validation = port.validate(proposedEdit);
    if (validation.type !== EditorValidationResultType.Valid) {
      setProposalMessage(validation.reason);
      return;
    }
    const result = port.apply(proposedEdit, proposal.proposalId);
    if (result.type === EditorApplyResultType.Applied) {
      setProposal(undefined);
      setProposalMessage("Applied as one undoable editor change.");
    } else {
      setProposalMessage("reason" in result ? result.reason : result.message);
    }
  };

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
            <button onClick={model.document ? runtime.retrySave : runtime.load} type="button">Try again</button>
          ) : null}
        </div>
      ) : null}
      {model.document ? (
        <div className="workspace">
          <DocumentEditor
            documentId={model.document.id}
            initialContent={model.document.content}
            runtime={runtime}
          />
          <aside className="voice-slot" aria-label="Voice editing">
            <div className="voice-icon" aria-hidden="true">⌁</div>
            <h2>Voice edit</h2>
            <p>Select text, then enter an instruction. The server proposes a typed command; only Apply changes the document.</p>
            <label>
              Editing instruction
              <textarea aria-label="Editing instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
            </label>
            <button disabled={reviewing || instruction.trim().length === 0} onClick={() => void reviewCommand()} type="button">
              {reviewing ? "Reviewing…" : "Review command"}
            </button>
            {proposal?._tag === EditorProposalOutcomeType.Unsupported ? (
              <div className="notice" role="status">{proposal.reason}</div>
            ) : null}
            {proposal?._tag === EditorProposalOutcomeType.Proposed ? (
              <section className="proposal-review" aria-label="Proposed edit">
                <h3>{proposal.summary}</h3>
                {preview?.type === EditorPreviewResultType.Ready ? (
                  <p><del>{preview.before || "(empty)"}</del> → <ins>{preview.after || "(empty)"}</ins></p>
                ) : (
                  <p>{preview?.type === EditorPreviewResultType.Stale ? preview.reason : "This proposal cannot be applied."}</p>
                )}
                <button disabled={preview?.type !== EditorPreviewResultType.Ready} onClick={applyProposal} type="button">Apply</button>
                <button onClick={() => setProposal(undefined)} type="button">Cancel</button>
              </section>
            ) : null}
            {proposalMessage ? <div aria-live="polite">{proposalMessage}</div> : null}
          </aside>
        </div>
      ) : model.phase === DocumentPhase.Loading ? (
        <div className="page-loading">Opening your draft…</div>
      ) : null}
    </main>
  );
}

function toEditorEdit(
  proposal: Extract<EditorProposalOutcome, { _tag: "ProposedEditorCommand" }>,
): EditorEditValue {
  const target = proposal.context.target;
  switch (proposal.command._tag) {
    case ProposedEditorCommandType.ReplaceSelection:
      return EditorEdit.ReplaceRange(target, proposal.command.text);
    case ProposedEditorCommandType.ReplaceAll:
      return EditorEdit.ReplaceAll(
        proposal.command.search,
        proposal.command.replacement,
        target.documentFingerprint,
      );
    case ProposedEditorCommandType.InsertText:
      return EditorEdit.InsertText(target, proposal.command.text, proposal.command.at);
    case ProposedEditorCommandType.SetMark:
      return EditorEdit.SetMark(target, proposal.command.mark, proposal.command.enabled);
    default:
      proposal.command satisfies never;
      return EditorEdit.ReplaceRange(target, target.selectedText);
  }
}
