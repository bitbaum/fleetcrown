"use client";

import { useState } from "react";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";

// TODO (Loki Phase 3): file attach + model picker live here per
// docs/loki-command-surface.md §4. Mic (voice → text) is wired below, reusing
// the same useVoiceInput hook the Cmd-K palette uses (SSOT).

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

  // Voice → text. The transcript appends to whatever is already typed so
  // dictation composes with typing instead of clobbering it.
  const voice = useVoiceInput({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
  });

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
        disabled={disabled || voice.status === "transcribing"}
        placeholder={
          voice.status === "recording"
            ? "Listening…"
            : "Type a command (e.g. 'code review for kivvi') or ask a question…"
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {voice.isSupported && (
        <button
          type="button"
          className="ui-btn-icon p-2"
          disabled={disabled || voice.status === "transcribing"}
          onClick={voice.status === "recording" ? voice.stop : () => void voice.start()}
          aria-label={voice.status === "recording" ? "Stop recording" : "Voice input"}
          title={voice.status === "recording" ? "Stop" : "Voice (mic)"}
        >
          {voice.status === "transcribing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : voice.status === "recording" ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      )}
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
