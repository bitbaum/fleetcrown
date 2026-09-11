"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, FolderKanban, Loader2, Mic, Plus, Square, X } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useAttachments } from "@/hooks/use-attachments";
import { AttachButton, AttachmentStrip } from "@/components/ui/attachment-strip";
import {
  composerChips,
  fillSuggestedAction,
  type LokiComposerChip,
} from "@/config/loki-suggested-actions";
import { ExecutorHonestyChip } from "@/components/executor/ExecutorHonestyChip";
import type { ExecutorHonestyLabel } from "@/lib/executor-honesty";
import { ModelPicker } from "./ModelPicker";
import type { Attachment, LokiProject, ModelChoice } from "./types";

const IMAGE_ONLY_DEFAULT = "What's wrong here and what should we change?";
/** Matches the `max-h` in `ui-loki-composer-input`; both must move together. */
const MAX_INPUT_PX = 240;

/**
 * The one control on the page.
 *
 * ── What changed, and why ────────────────────────────────────────────────────
 * The previous composer stacked up to FIVE rows — scope pills, suggestion
 * chips, the textarea, staged attachments, then a tools row — so on a phone the
 * input you came to use was a band in the middle of its own furniture. Here
 * there is the text, and one row of controls under it. Everything else appears
 * only when it has something to say.
 *
 * ── Attachments are no longer a private copy ─────────────────────────────────
 * `useAttachments` was lifted OUT of this file and adopted by the Control and
 * Terminal composers — and this file kept its original inline copy, so the one
 * surface the hook was extracted from was the only one not using it. Three
 * copies of object-URL lifetimes and size limits is how they drift. Now there
 * is one.
 */
export function Composer({
  disabled,
  sending,
  onSend,
  onStop,
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
  /** Cancel the turn in flight. The send button becomes this while one runs. */
  onStop: () => void;
  defaultText?: string;
  selectedProjects?: string[];
  projectCount?: number;
  selectedGoal?: LokiProject["topGoal"];
  onRemoveProject?: (name: string) => void;
  onOpenProjects?: () => void;
  dispatchHonesty?: ExecutorHonestyLabel | null;
  /** Openers belong on an empty thread. Mid-conversation they re-offer a
   *  decision already made, and on a phone they ate a third of the transcript. */
  showStarters?: boolean;
}) {
  const [text, setText] = useState(defaultText);
  const [model, setModel] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();

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

  // Keyed on the VALUE, not the keystroke, so programmatic changes — a chip
  // prefill, a dictated transcript, the clear after send — resize too.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    const hasAttach = attachments.attachments.length > 0;
    if ((!trimmed && !hasAttach) || sending) return;
    // An image with no question is still a question — the operator dropped a
    // screenshot in, which says what they want more clearly than any prompt.
    const outgoing = trimmed || (hasAttach ? IMAGE_ONLY_DEFAULT : "");
    onSend(outgoing, model ? { model } : {}, attachments.toWire());
    setText("");
    attachments.clear();
  };

  const canSend = (text.trim().length > 0 || attachments.attachments.length > 0) && !sending;
  const scopedProject = selectedProjects.length === 1 ? selectedProjects[0] : null;

  const allChips = composerChips({ projectCount, selectedProjects, selectedGoal });
  const chips = showStarters || selectedProjects.length > 0 ? allChips : [];

  const runChip = (chip: LokiComposerChip) => {
    if (disabled || sending) return;
    if (chip.kind === "open_projects") return onOpenProjects?.();
    if (chip.kind === "href") return;
    const prompt = fillSuggestedAction(chip.template ?? "", scopedProject);
    if (!prompt) return;
    if (chip.kind === "prefill") {
      setText(prompt);
      textareaRef.current?.focus();
      return;
    }
    onSend(prompt, model ? { model } : {}, [], chip.chatOnly ? { chatOnly: true } : undefined);
  };

  const placeholder = recording
    ? "Listening…"
    : scopedProject
      ? `Ask, or send work to ${scopedProject}…`
      : selectedProjects.length > 1
        ? `Ask, or send work to ${selectedProjects.length} projects…`
        : projectCount === 0
          ? "Name a new project, or ask anything…"
          : "Ask anything, or send work to a project…";

  // Only when it has something in it. The old scope row reserved 28px of a
  // phone screen to display nothing.
  const offersProjectButton =
    selectedProjects.length === 0 &&
    projectCount > 0 &&
    Boolean(onOpenProjects) &&
    (Boolean(text.trim()) || !chips.some((c) => c.kind === "open_projects"));
  const showScopeRow = selectedProjects.length > 0 || offersProjectButton;

  return (
    <div className="ui-loki-composer-wrap">
      {!text.trim() && chips.length > 0 && (
        <div className="ui-loki-suggest-row">
          {chips.map((chip) => {
            const title =
              chip.kind === "href"
                ? chip.label
                : chip.kind === "open_projects"
                  ? "Choose a project"
                  : fillSuggestedAction(chip.template ?? "", scopedProject);
            return chip.kind === "href" && chip.href ? (
              <Link key={chip.id} href={chip.href} className="ui-loki-suggest-chip" title={title}>
                {chip.label}
              </Link>
            ) : (
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
                <button
                  type="button"
                  className="ui-voice-cancel"
                  onClick={voice.cancel}
                  aria-label="Cancel recording"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="ui-voice-stop"
                  onClick={voice.stop}
                  aria-label="Stop and transcribe"
                >
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
              {offersProjectButton && (
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

          <textarea
            ref={textareaRef}
            className="ui-loki-composer-input"
            rows={1}
            value={text}
            disabled={disabled || transcribing}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              if (attachments.addFromPaste(e)) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />

          <AttachmentStrip attachments={attachments} />
          {attachments.note && (
            <p className="ui-loki-attach-note" role="status">
              {attachments.note}
            </p>
          )}

          <div className="ui-loki-composer-actions">
            <div className="ui-loki-composer-tools">
              <AttachButton attachments={attachments} />
              {voice.isSupported && (
                <button
                  type="button"
                  className={
                    recording ? "ui-loki-tool-btn ui-loki-tool-btn-rec" : "ui-loki-tool-btn"
                  }
                  disabled={disabled || transcribing}
                  onClick={recording ? voice.stop : () => void voice.start()}
                  aria-label={recording ? "Stop recording" : "Voice input"}
                >
                  {transcribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : recording ? (
                    <span className="ui-loki-rec-stop" aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}
              <ModelPicker value={model} onChange={setModel} disabled={disabled} />
            </div>

            <div className="ui-loki-composer-submit-row">
              {selectedProjects.length > 0 && <ExecutorHonestyChip honesty={dispatchHonesty} />}
              {/* Send and Stop occupy the SAME slot. A turn you cannot cancel
                  is the thing that makes a slow answer feel broken, and the
                  old composer had no stop at all. */}
              {sending ? (
                <button
                  type="button"
                  className="ui-loki-send-btn ui-loki-send-btn-stop"
                  onClick={onStop}
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                !recording && (
                  <button
                    type="button"
                    className="ui-loki-send-btn"
                    disabled={disabled || !canSend}
                    onClick={submit}
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
