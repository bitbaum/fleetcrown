"use client";

import { useState } from "react";
import { Send } from "lucide-react";

// TODO (Loki Phase 3): mic (voice → transcribe), file attach, and model picker
// live here per docs/loki-command-surface.md §4. Out of scope for the MVP —
// left unstubbed so no broken affordance ships.

export function Composer({
  disabled,
  sending,
  onSend,
}: {
  disabled: boolean;
  sending: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="ui-loki-composer">
      <textarea
        className="ui-loki-composer-input"
        rows={1}
        value={text}
        disabled={disabled}
        placeholder="Type a command (e.g. 'code review for kivvi') or ask a question…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="ui-btn-icon-accent p-2"
        disabled={disabled || sending || !text.trim()}
        onClick={submit}
        aria-label="Send"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
