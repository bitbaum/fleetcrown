"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { UseAiForm } from "@fleet/ai-forms/react";

interface Props {
  assist: UseAiForm;
  /** Override the prompt shown when the form is still empty. */
  fillPlaceholder?: string;
}

/**
 * One box above a form: describe the thing to fill it, then keep talking to it
 * to change it. The intent is inferred from whether the form is empty, so there
 * is no mode for the user to get wrong.
 */
export function AiAssistBar({ assist, fillPlaceholder }: Props) {
  const [instruction, setInstruction] = useState("");

  const lastReply = [...assist.transcript]
    .reverse()
    .find((turn) => turn.role === "assistant")?.text;

  const send = async () => {
    const text = instruction.trim();
    if (!text || assist.busy) return;
    const result = await assist.ask(text);
    // Keep the text on failure so the user can edit rather than retype it.
    if (result.ok) setInstruction("");
  };

  return (
    <div className="ui-assist">
      <div className="ui-assist-row">
        {assist.busy ? (
          <Loader2 className="ui-spinner-xs" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0 text-accent-text" />
        )}

        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // This bar lives inside the modal's <form>. Without stopping the
            // event here, Enter submits the whole form instead of asking.
            e.preventDefault();
            e.stopPropagation();
            void send();
          }}
          disabled={assist.busy}
          placeholder={
            assist.isEmpty
              ? (fillPlaceholder ?? "Describe it and I'll fill this in…")
              : "Tell me what to change…"
          }
          className="ui-assist-input"
        />

        <button
          type="button"
          onClick={() => void send()}
          disabled={assist.busy || instruction.trim() === ""}
          className="ui-assist-send"
          aria-label={assist.isEmpty ? "Fill the form" : "Apply the change"}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </div>

      {assist.error && <div className="ui-assist-error">{assist.error}</div>}

      {!assist.error && !assist.busy && lastReply && (
        <div className="ui-assist-note">
          <span className="grow">{lastReply}</span>
          {assist.canUndo && (
            <button type="button" onClick={assist.undo} className="ui-assist-undo">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
