import {
  EditorProposalOutcomeType,
  ProposedEditorCommandType,
  type CapturedEditorContext,
  type EditorProposalOutcome,
} from "@app/contracts";
import {
  EditorApplyResultType,
  EditorEdit,
  EditorPreviewResultType,
  EditorValidationResultType,
  type EditorEdit as EditorEditValue,
  validateTiptapDocumentContent,
} from "@app/editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { DocumentPhase } from "./document-model";
import { DocumentEditor } from "./editor";
import type { DocumentRuntime } from "./runtime";
import { VoiceCaptureControls } from "./voice-capture";

export function App({ runtime }: Readonly<{ runtime: DocumentRuntime }>) {
  const model = useStore(runtime.store);
  const [proposal, setProposal] = useState<EditorProposalOutcome>();
  const [proposalMessage, setProposalMessage] = useState<string>();
  const [reviewing, setReviewing] = useState(false);
  const [retainedVoiceContext, setRetainedVoiceContext] =
    useState<CapturedEditorContext>();
  const proposalGeneration = useRef(0);
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

  const receiveTranscript = useCallback(
    (transcript: string, context: CapturedEditorContext) => {
      const generation = proposalGeneration.current + 1;
      proposalGeneration.current = generation;
      setRetainedVoiceContext(context);
      setProposal(undefined);
      setProposalMessage("Interpreting spoken command…");
      setReviewing(true);
      void runtime
        .propose(transcript, context)
        .then((nextProposal) => {
          if (proposalGeneration.current !== generation) return;
          setProposal(nextProposal);
          setProposalMessage(undefined);
        })
        .catch((cause: unknown) => {
          if (proposalGeneration.current !== generation) return;
          setProposalMessage(
            cause instanceof Error
              ? cause.message
              : "The spoken command could not be reviewed.",
          );
        })
        .finally(() => {
          if (proposalGeneration.current === generation) setReviewing(false);
        });
    },
    [runtime],
  );

  useEffect(
    () => () => {
      proposalGeneration.current += 1;
    },
    [],
  );

  const applyProposal = () => {
    const port = runtime.getEditorPort();
    if (!port || !proposedEdit || proposal?._tag !== EditorProposalOutcomeType.Proposed) return;
    if (
      !model.document ||
      proposal.context.documentId !== model.document.id ||
      (retainedVoiceContext !== undefined &&
        proposal.context.captureId !== retainedVoiceContext.captureId)
    ) {
      setProposalMessage("The document or retained capture changed after review. Review the command again.");
      return;
    }
    const validation = port.validate(proposedEdit);
    if (validation.type !== EditorValidationResultType.Valid) {
      setProposalMessage(validation.reason);
      return;
    }
    const result = port.apply(proposedEdit, proposal.proposalId);
    if (result.type === EditorApplyResultType.Applied) {
      setProposal(undefined);
      setRetainedVoiceContext(undefined);
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
            <p>Select text and record an instruction. Review the proposed edit, then choose Apply. Nothing changes the document before Apply.</p>
            <VoiceCaptureControls
              onTranscript={receiveTranscript}
              runtime={runtime}
            />
            {reviewing ? <div aria-live="polite">Reviewing spoken command…</div> : null}
            {proposal?._tag === EditorProposalOutcomeType.Unsupported ? (
              <div className="notice" role="status">{proposal.reason}</div>
            ) : null}
            {proposal?._tag === EditorProposalOutcomeType.Ambiguous ? (
              <div className="notice" role="status">{proposal.reason} {proposal.clarification}</div>
            ) : null}
            {proposal?._tag === EditorProposalOutcomeType.Failed ? (
              <div className="notice" role="alert">{proposal.reason}</div>
            ) : null}
            {proposal?._tag === EditorProposalOutcomeType.Cancelled ? (
              <div className="notice" role="status">{proposal.reason}</div>
            ) : null}
            {proposal?._tag === EditorProposalOutcomeType.Proposed ? (
              <section className="proposal-review" aria-label="Proposed edit">
                <h3>{proposal.summary}</h3>
                <p>Heard: “{proposal.transcript}”</p>
                {preview?.type === EditorPreviewResultType.Ready ? (
                  <p><del>{preview.before || "(empty)"}</del> → <ins>{preview.after || "(empty)"}</ins></p>
                ) : (
                  <p>{preview?.type === EditorPreviewResultType.Stale ? preview.reason : "This proposal cannot be applied."}</p>
                )}
                <button disabled={preview?.type !== EditorPreviewResultType.Ready} onClick={applyProposal} type="button">Apply</button>
                <button onClick={() => {
                  proposalGeneration.current += 1;
                  setProposal(undefined);
                  setRetainedVoiceContext(undefined);
                }} type="button">Cancel</button>
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
    case ProposedEditorCommandType.ReplaceText:
      return EditorEdit.ReplaceText(
        target,
        proposal.command.scope,
        proposal.command.occurrence,
        proposal.command.matchText,
        proposal.command.replacementText,
      );
    case ProposedEditorCommandType.InsertText:
      return EditorEdit.InsertText(
        target,
        proposal.command.text,
        proposal.command.target === "BeforeSelection"
          ? "Before"
          : proposal.command.target === "AfterSelection"
            ? "After"
            : "DocumentEnd",
      );
    case ProposedEditorCommandType.SetMark:
      return EditorEdit.SetMark(
        target,
        proposal.command.mark === "Bold" ? "bold" : "italic",
        proposal.command.enabled,
      );
    case ProposedEditorCommandType.ReplaceDocument:
      return EditorEdit.ReplaceDocument(
        target.documentFingerprint,
        validateTiptapDocumentContent(proposal.command.content),
        proposal.command.preview,
      );
    default:
      proposal.command satisfies never;
      return EditorEdit.ReplaceRange(target, target.selectedText);
  }
}
