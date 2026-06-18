"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, MicOff, Loader2, Paperclip, X } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { getJson } from "@/lib/api/fetch";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS } from "@/lib/loki/attachments";
import type { Attachment, LokiAgent, ModelChoice } from "./types";

// Mic (voice → text), the model picker, and file attach are all wired below.
// Mic reuses the same useVoiceInput hook the Cmd-K palette uses (SSOT); file
// attach reads text client-side and folds it into the prompt (no upload) —
// limits/rendering live in @/lib/loki/attachments (SSOT).

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
  onSend: (text: string, choice: ModelChoice, attachments: Attachment[]) => void;
}) {
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<LokiAgent[]>([]);
  const [choiceKey, setChoiceKey] = useState<string>(AUTO);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Read picked files as TEXT and stage them. Oversized files are skipped with
  // a note (the body rides inline in the prompt, so it must stay bounded).
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setAttachNote(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setAttachNote(`Up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of Array.from(files).slice(0, room)) {
      if (file.size > MAX_ATTACHMENT_CHARS) {
        setAttachNote(`${file.name} is too large (max ${Math.round(MAX_ATTACHMENT_CHARS / 1000)}k chars).`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result ?? "").slice(0, MAX_ATTACHMENT_CHARS);
        setAttachments((prev) =>
          prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name: file.name, content }],
        );
      };
      reader.onerror = () => setAttachNote(`Could not read ${file.name}.`);
      reader.readAsText(file);
    }
    // Reset so the same file can be re-picked after removal.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (name: string) =>
    setAttachments((prev) => prev.filter((a) => a.name !== name));

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed, parseChoice(choiceKey), attachments);
    setText("");
    setAttachments([]);
    setAttachNote(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {(attachments.length > 0 || attachNote) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {attachments.map((a) => (
            <span key={a.name} className="ui-loki-attach-chip">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-40 truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.name)}
                aria-label={`Remove ${a.name}`}
                className="ui-loki-attach-remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {attachNote && <span className="text-xs text-status-warning">{attachNote}</span>}
        </div>
      )}

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
            the project's own default. Hidden until agents load. */}
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
        {/* File attach — text content is folded into the dispatched prompt. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          className="ui-btn-icon p-2"
          disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a file"
          title="Attach a text file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
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
    </div>
  );
}
