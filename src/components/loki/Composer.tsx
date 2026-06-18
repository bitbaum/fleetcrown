"use client";

import { useEffect, useState } from "react";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { getJson } from "@/lib/api/fetch";
import type { LokiAgent, ModelChoice } from "./types";

// TODO (Loki Phase 3): file attach lives here per docs/loki-command-surface.md
// §4. Mic (voice → text) and the model picker are wired below; the mic reuses
// the same useVoiceInput hook the Cmd-K palette uses (SSOT).

/** "Auto" = use the project's default agent/model. Non-empty values encode a
 *  pinned choice as "<agentId>::<model>". */
const AUTO = "";
const SEP = "::";

export function Composer({
  disabled,
  sending,
  onSend,
}: {
  disabled: boolean;
  sending: boolean;
  onSend: (text: string, choice: ModelChoice) => void;
}) {
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<LokiAgent[]>([]);
  const [choiceKey, setChoiceKey] = useState<string>(AUTO);

  // Voice → text. The transcript appends to whatever is already typed so
  // dictation composes with typing instead of clobbering it.
  const voice = useVoiceInput({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
  });

  // Dispatchable agents + their models for the picker. Best-effort: if it
  // fails, the picker simply stays "Auto"-only and dispatch uses project defaults.
  useEffect(() => {
    getJson<{ agents: LokiAgent[] }>("/api/agents")
      .then((d) => setAgents(d.agents))
      .catch(() => { /* keep Auto-only */ });
  }, []);

  const parseChoice = (key: string): ModelChoice => {
    if (key === AUTO) return {};
    const [agent, model] = key.split(SEP);
    return { agent, model: model || undefined };
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed, parseChoice(choiceKey));
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
      {/* Model picker — pins the agent/model for the next dispatch; "Auto" uses
          the project's own default. Hidden until agents load so it never shows
          an empty control. */}
      {agents.length > 0 && (
        <select
          className="ui-loki-composer-select"
          value={choiceKey}
          disabled={disabled}
          onChange={(e) => setChoiceKey(e.target.value)}
          aria-label="Model for this dispatch"
          title="Model for this dispatch"
        >
          <option value={AUTO}>Auto</option>
          {agents.map((a) => {
            const models = a.modelSuggestions.length > 0 ? a.modelSuggestions : [a.defaultModel];
            return models.map((m) => (
              <option key={`${a.id}${SEP}${m}`} value={`${a.id}${SEP}${m}`}>
                {a.label} · {m}
              </option>
            ));
          })}
        </select>
      )}
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
