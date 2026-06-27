"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, MicOff, Check, Loader2, Paperclip, X } from "lucide-react";
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

  const recording = voice.status === "recording";
  const transcribing = voice.status === "transcribing";
  // Elapsed seconds for the Grok-style recording bar. The interval callback (not
  // the effect body, and not render) is the only place state/Date.now() are
  // touched, satisfying the purity + no-cascading-setState rules.
  const recStartRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) return;
    recStartRef.current = Date.now();
    const t = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000)),
      250,
    );
    return () => window.clearInterval(t);
  }, [recording]);
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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

      <div className="relative">
      {/* Grok-style voice overlay — covers the composer while recording or
          transcribing so the live waveform + timer + cancel/confirm are the
          whole surface, then hands the transcript back to the input. */}
      {(recording || transcribing) && (
        <div className="ui-voice-bar" role="status" aria-live="polite">
          {recording ? (
            <>
              <span className="ui-voice-rec-dot" aria-hidden />
              <div className="ui-voice-wave" aria-hidden>
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="ui-voice-wave-bar" />
                ))}
              </div>
              <span className="ui-voice-timer tabular-nums">{fmtTime(elapsed)}</span>
              <button type="button" className="ui-voice-cancel" onClick={voice.cancel} aria-label="Cancel recording" title="Cancel">
                <X className="h-4 w-4" />
              </button>
              <button type="button" className="ui-voice-stop" onClick={voice.stop} aria-label="Stop and transcribe" title="Done">
                <Check className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" />
              <span className="ui-voice-timer">Transcribing…</span>
            </>
          )}
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
        <div className="ui-loki-composer-actions">
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
          className="ui-btn-icon-accent min-h-11 min-w-11 p-2"
          disabled={disabled || sending || !text.trim()}
          onClick={submit}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
        </div>
      </div>
      </div>
    </div>
  );
}
