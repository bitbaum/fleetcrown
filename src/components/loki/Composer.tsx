"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, MicOff, Check, Loader2, Paperclip, X, ImageIcon } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { getJson } from "@/lib/api/fetch";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_CHARS,
  MAX_IMAGE_BYTES,
  isImageMime,
  type StagedAttachment,
} from "@/lib/loki/attachments";
import { LOKI_SUGGESTED_ACTIONS, fillSuggestedAction } from "@/config/loki-suggested-actions";
import type { Attachment, LokiAgent, ModelChoice } from "./types";

const AUTO = "";
const SEP = "::";
const IMAGE_ONLY_DEFAULT = "What's wrong here and what should we change?";

function stripDataUrlBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function stageKey(a: StagedAttachment): string {
  return `${a.kind}:${a.name}`;
}

export function Composer({
  disabled,
  sending,
  onSend,
  defaultText = "",
  scopedProject = null,
}: {
  disabled: boolean;
  sending: boolean;
  onSend: (text: string, choice: ModelChoice, attachments: Attachment[]) => void;
  defaultText?: string;
  /** Selected project from the right pane — shown as a pill and used in quick chips. */
  scopedProject?: string | null;
}) {
  const [text, setText] = useState(defaultText);
  const [agents, setAgents] = useState<LokiAgent[]>([]);
  const [choiceKey, setChoiceKey] = useState<string>(AUTO);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
  });

  const recording = voice.status === "recording";
  const transcribing = voice.status === "transcribing";
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

  useEffect(() => {
    getJson<{ agents: LokiAgent[] }>("/api/agents")
      .then((d) => setAgents(d.agents))
      .catch(() => { /* Auto-only */ });
  }, []);

  const previewUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
    };
  }, []);

  const parseChoice = (key: string): ModelChoice => {
    if (key === AUTO) return {};
    const [agent, model] = key.split(SEP);
    return { agent, model: model || undefined };
  };

  const addAttachment = (item: StagedAttachment) => {
    setAttachments((prev) => {
      if (prev.length >= MAX_ATTACHMENTS) return prev;
      if (prev.some((p) => stageKey(p) === stageKey(item))) return prev;
      return [...prev, item];
    });
  };

  const stageImageFile = (file: File) => {
    if (!isImageMime(file.type)) {
      setAttachNote(`${file.name}: use PNG, JPEG, GIF, or WebP.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachNote(`${file.name} is too large (max ${Math.round(MAX_IMAGE_BYTES / 1_000_000)}MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const dataBase64 = stripDataUrlBase64(dataUrl);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      addAttachment({
        kind: "image",
        name: file.name,
        mimeType: file.type,
        dataBase64,
        previewUrl,
      });
    };
    reader.onerror = () => setAttachNote(`Could not read ${file.name}.`);
    reader.readAsDataURL(file);
  };

  const stageTextFile = (file: File) => {
    if (file.size > MAX_ATTACHMENT_CHARS) {
      setAttachNote(`${file.name} is too large (max ${Math.round(MAX_ATTACHMENT_CHARS / 1000)}k chars).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "").slice(0, MAX_ATTACHMENT_CHARS);
      addAttachment({ kind: "text", name: file.name, content });
    };
    reader.onerror = () => setAttachNote(`Could not read ${file.name}.`);
    reader.readAsText(file);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setAttachNote(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setAttachNote(`Up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of Array.from(files).slice(0, room)) {
      if (isImageMime(file.type)) stageImageFile(file);
      else stageTextFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((i) => i.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    setAttachNote(null);
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) stageImageFile(file);
    }
  };

  const removeAttachment = (key: string) =>
    setAttachments((prev) => {
      const target = prev.find((a) => stageKey(a) === key);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((a) => stageKey(a) !== key);
    });

  const toWire = (staged: StagedAttachment[]): Attachment[] =>
    staged.map(({ previewUrl, ...rest }) => {
      if (previewUrl) previewUrlsRef.current.delete(previewUrl);
      return rest;
    });

  const submit = () => {
    const trimmed = text.trim();
    const hasAttach = attachments.length > 0;
    if ((!trimmed && !hasAttach) || sending) return;
    const outgoing = trimmed || (hasAttach ? IMAGE_ONLY_DEFAULT : "");
    onSend(outgoing, parseChoice(choiceKey), toWire(attachments));
    setText("");
    for (const a of attachments) {
      if (a.previewUrl) {
        URL.revokeObjectURL(a.previewUrl);
        previewUrlsRef.current.delete(a.previewUrl);
      }
    }
    setAttachments([]);
    setAttachNote(null);
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {scopedProject ? (
          <span className="ui-loki-scope-pill">{scopedProject}</span>
        ) : (
          <span className="ui-loki-scope-hint">No project selected</span>
        )}
        {LOKI_SUGGESTED_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="ui-btn-chip py-1 text-micro"
            disabled={disabled || sending}
            onClick={() => {
              setText(fillSuggestedAction(action.template, scopedProject));
              textareaRef.current?.focus();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {(attachments.length > 0 || attachNote) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {attachments.map((a) => (
            <span key={stageKey(a)} className="ui-loki-attach-chip">
              {a.kind === "image" && a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob preview of a local paste
                <img src={a.previewUrl} alt="" className="ui-loki-attach-thumb" />
              ) : a.kind === "image" ? (
                <ImageIcon className="h-3 w-3" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
              <span className="max-w-32 truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(stageKey(a))}
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
                <button type="button" className="ui-voice-cancel" onClick={voice.cancel} aria-label="Cancel recording">
                  <X className="h-4 w-4" />
                </button>
                <button type="button" className="ui-voice-stop" onClick={voice.stop} aria-label="Stop and transcribe">
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
            ref={textareaRef}
            className="ui-loki-composer-input"
            rows={1}
            value={text}
            disabled={disabled || voice.status === "transcribing"}
            placeholder={
              voice.status === "recording"
                ? "Listening…"
                : "Ask, dispatch, or paste a screenshot…"
            }
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="ui-loki-composer-actions">
            {agents.length > 0 && (
              <select
                className="ui-loki-composer-select hidden sm:block"
                value={choiceKey}
                disabled={disabled}
                onChange={(e) => setChoiceKey(e.target.value)}
                aria-label="Model for this dispatch"
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,text/*,.ts,.tsx,.js,.jsx,.json,.md,.css,.html,.py,.go,.rs,.txt,.log,.yaml,.yml,.toml"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              className="ui-btn-icon p-2"
              disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file or screenshot"
              title="Attach file or screenshot"
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
              disabled={disabled || !canSend}
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
