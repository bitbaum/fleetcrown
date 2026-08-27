"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Mic, Check, Loader2, Paperclip, X, ImageIcon, FolderKanban, Plus } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_CHARS,
  MAX_IMAGE_BYTES,
  isImageMime,
  stripDataUrlBase64,
  type StagedAttachment,
} from "@/lib/loki/attachments";
import {
  composerChips,
  fillSuggestedAction,
  type LokiComposerChip,
} from "@/config/loki-suggested-actions";
import { ExecutorHonestyChip } from "@/components/executor/ExecutorHonestyChip";
import type { ExecutorHonestyLabel } from "@/lib/executor-honesty";
import type { Attachment, LokiProject, ModelChoice } from "./types";

const IMAGE_ONLY_DEFAULT = "What's wrong here and what should we change?";

function stageKey(a: StagedAttachment): string {
  return `${a.kind}:${a.name}`;
}

export function Composer({
  disabled,
  sending,
  onSend,
  defaultText = "",
  selectedProjects = [],
  projectCount = 0,
  selectedGoal = null,
  onRemoveProject,
  onOpenProjects,
  dispatchHonesty = null,
  showStarters = true,
}: {
  disabled: boolean;
  sending: boolean;
  onSend: (
    text: string,
    choice: ModelChoice,
    attachments: Attachment[],
    opts?: { chatOnly?: boolean },
  ) => void;
  defaultText?: string;
  /** Selected projects from the project pane — visible inside the composer. */
  selectedProjects?: string[];
  projectCount?: number;
  selectedGoal?: LokiProject["topGoal"];
  onRemoveProject?: (name: string) => void;
  onOpenProjects?: () => void;
  /** Shown beside Send when dispatches queue without a live builder. */
  dispatchHonesty?: ExecutorHonestyLabel | null;
  /** Start-screen chips ("New project", "What needs me"). False mid-conversation:
   *  they are openers, and on a phone they were eating a third of the transcript
   *  to re-offer a decision the operator had already made. Project-scoped action
   *  chips are not starters and stay. */
  showStarters?: boolean;
}) {
  const [text, setText] = useState(defaultText);
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

  const previewUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
      previewUrls.clear();
    };
  }, []);

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
    onSend(outgoing, {}, toWire(attachments));
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
  const scopedProjectForTemplate = selectedProjects.length === 1 ? selectedProjects[0] : null;
  const allChips = composerChips({
    projectCount,
    selectedProjects,
    selectedGoal,
  });
  // Mid-conversation only the scoped action chips survive; the openers do not.
  const chips = showStarters || selectedProjects.length > 0 ? allChips : [];
  // The scope row used to render unconditionally with a min-height, reserving
  // 28px of a phone screen to display nothing. It appears when it has something
  // in it: a scope pill, or the button that adds one.
  const offersProjectButton =
    selectedProjects.length === 0 &&
    projectCount > 0 &&
    Boolean(onOpenProjects) &&
    (Boolean(text.trim()) || !chips.some((chip) => chip.kind === "open_projects"));
  const showScopeRow = selectedProjects.length > 0 || offersProjectButton;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const runChip = (chip: LokiComposerChip) => {
    if (disabled || sending) return;
    if (chip.kind === "open_projects") {
      onOpenProjects?.();
      return;
    }
    if (chip.kind === "href") return;
    const template = chip.template ?? "";
    const prompt = fillSuggestedAction(template, scopedProjectForTemplate);
    if (!prompt) return;
    if (chip.kind === "prefill") {
      setText(prompt);
      textareaRef.current?.focus();
      return;
    }
    onSend(prompt, {}, [], chip.chatOnly ? { chatOnly: true } : undefined);
  };

  const placeholder = recording
    ? "Listening…"
    : scopedProjectForTemplate
      ? `Ask or dispatch on ${scopedProjectForTemplate}…`
      : selectedProjects.length > 1
        ? `Ask or dispatch on ${selectedProjects.length} projects…`
        : projectCount === 0
          ? "Name a new project, or ask anything…"
          : "Start a project, open one, or ask…";

  return (
    <div className="ui-loki-composer-wrap">
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
          {showScopeRow && (
          <div className="ui-loki-composer-scope-row">
            {selectedProjects.length === 0 &&
              projectCount > 0 &&
              onOpenProjects &&
              (text.trim() || !chips.some((chip) => chip.kind === "open_projects")) && (
              <button type="button" className="ui-btn-chip" onClick={onOpenProjects}>
                <FolderKanban className="h-3.5 w-3.5" /> Project
              </button>
            )}
            {selectedProjects.map((project) => (
              <span key={project} className="ui-loki-scope-pill">
                <span className="truncate">{project}</span>
                {onRemoveProject && (
                  <button
                    type="button"
                    className="ui-loki-scope-remove"
                    onClick={() => onRemoveProject(project)}
                    aria-label={`Remove ${project}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {selectedProjects.length > 0 && onOpenProjects && (
              <button
                type="button"
                className="ui-loki-scope-add"
                onClick={onOpenProjects}
                aria-label="Change project scope"
                title="Change project scope"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          )}

          {!text.trim() && chips.length > 0 && (
            <div className="ui-loki-suggest-row">
              {chips.map((chip) => {
                const title =
                  chip.kind === "href"
                    ? chip.label
                    : chip.kind === "open_projects"
                      ? "Choose a project"
                      : fillSuggestedAction(chip.template ?? "", scopedProjectForTemplate);
                if (chip.kind === "href" && chip.href) {
                  return (
                    <Link
                      key={chip.id}
                      href={chip.href}
                      className="ui-loki-suggest-chip"
                      title={title}
                    >
                      {chip.label}
                    </Link>
                  );
                }
                return (
                  <button
                    key={chip.id}
                    type="button"
                    className="ui-loki-suggest-chip"
                    disabled={disabled || sending}
                    onClick={() => runChip(chip)}
                    title={title}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="ui-loki-composer-input"
            rows={2}
            value={text}
            disabled={disabled || voice.status === "transcribing"}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />

          {(attachments.length > 0 || attachNote) && (
            <div className="ui-loki-attach-row">
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
                  <span className="max-w-36 truncate">{a.name}</span>
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

          <div className="ui-loki-composer-actions">
            <div className="ui-loki-composer-tools">
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
                className="ui-loki-tool-btn"
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
                  className={recording ? "ui-loki-tool-btn ui-loki-tool-btn-rec" : "ui-loki-tool-btn"}
                  disabled={disabled || voice.status === "transcribing"}
                  onClick={voice.status === "recording" ? voice.stop : () => void voice.start()}
                  aria-label={voice.status === "recording" ? "Stop recording" : "Voice input"}
                >
                  {voice.status === "transcribing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : voice.status === "recording" ? (
                    <span className="ui-loki-rec-stop" aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
            <div className="ui-loki-composer-submit-row">
              {selectedProjects.length > 0 && <ExecutorHonestyChip honesty={dispatchHonesty} />}
              {!recording && (
                <button
                  type="button"
                  className="ui-loki-send-btn"
                  disabled={disabled || !canSend}
                  onClick={submit}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
