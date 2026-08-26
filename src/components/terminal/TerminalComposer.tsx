"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Send, X } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { PromptPicker } from "@/components/prompts/PromptPicker";
import { AttachButton, AttachmentStrip } from "@/components/ui/attachment-strip";
import { useAttachments } from "@/hooks/use-attachments";
import { cn } from "@/lib/utils";
import { useDispatchLiveStatus } from "@/hooks/use-dispatch-live-status";
import { dispatchToneDotClass } from "@/lib/dispatch-status";

/**
 * Prompt-mode composer for the terminal.
 *
 * Distinct from typing into the PTY on purpose: this text goes through
 * `/api/control/tab-inject`, which assembles it with the project's context
 * (mission, conventions, definition of done) and QUEUES it when the builder is
 * offline. Typing the same words into the session skips all of that. The mode
 * bar's hint says so; this component makes the difference real.
 *
 * `/` at the start of an empty composer opens the prompt library inline — the
 * first time a template can be chosen from the surface it will run on, rather
 * than read on /prompts and pasted by hand.
 */
export function TerminalComposer({ tab }: { tab: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Screenshots go with the prompt through the same tab-inject path — the
  // server turns them into text the agent can act on before dispatch.
  const attachments = useAttachments();

  // Real follow-through on what "Sent ✓" used to claim unconditionally.
  //
  // Before this, the button flashed "Sent ✓" for exactly 2 seconds and the
  // POST's response body was discarded — so a prompt that QUEUED behind an
  // offline builder (tab-inject's `mode: "dispatch"`/`"queued"`) looked
  // identical to one that ran immediately, and either way the confirmation
  // vanished with nothing left on screen to check back on. This composer's
  // own doc comment claimed the mode-bar hint "makes the difference real" —
  // it didn't; only the ambient, pre-send honesty chip elsewhere on the page
  // did, and that says nothing about what THIS send actually did.
  //
  // Tracked status now persists (dismissible) below the composer for exactly
  // the case that needs it — queued/working — and self-clears quickly once a
  // dispatch is confirmed to have actually started, so a healthy fast-path
  // send still feels like the old "Sent ✓" blip.
  const [trackedCommandId, setTrackedCommandId] = useState<string | null>(null);
  const [trackedRunId, setTrackedRunId] = useState<string | null>(null);
  const liveDispatch = useDispatchLiveStatus(trackedCommandId, trackedRunId);
  const clearTracked = () => { setTrackedCommandId(null); setTrackedRunId(null); };

  // The "self-clears quickly once confirmed" half of the comment above: once
  // the tracked lifecycle settles on a GOOD outcome, the strip has done its
  // job and gets out of the way on its own — the terminal output right below
  // is the lasting record. A negative/warning settle (failed, unconfirmed)
  // stays put; that is exactly the case an auto-vanishing confirmation used
  // to hide.
  useEffect(() => {
    if (!liveDispatch?.terminal) return;
    if (liveDispatch.tone === "negative" || liveDispatch.tone === "warning") return;
    const t = window.setTimeout(clearTracked, 4000);
    return () => window.clearTimeout(t);
  }, [liveDispatch]);

  const send = async () => {
    // A screenshot alone is a complete instruction; supply the words the
    // picture implies rather than refusing the send.
    const prompt = text.trim()
      || (attachments.attachments.length ? "Look at the attached screenshot and fix what is wrong." : "");
    if (!prompt || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await postJson("/api/control/tab-inject", {
        tab, prompt,
        ...(attachments.attachments.length ? { attachments: attachments.toWire() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Could not dispatch (HTTP ${res.status}).`);
        return;
      }
      // The runner saw the operator actively typing in this exact session and
      // refused to interleave keystrokes with an injected prompt — nothing
      // ran. HTTP still succeeded, so this has to be checked separately from
      // res.ok or it reads as a send.
      if (data.blocked) {
        setError(`Not sent — someone is typing in “${tab}” right now. Wait a moment and try again.`);
        return;
      }
      setText("");
      attachments.clear();
      setSent(true);
      window.setTimeout(() => setSent(false), 2000);
      clearTracked();
      setTrackedCommandId(typeof data.commandId === "string" ? data.commandId : null);
      setTrackedRunId(typeof data.runId === "string" ? data.runId : null);
    } catch (e) {
      // The draft is deliberately preserved so a failed send is retryable from
      // the same box instead of retyped.
      setError(e instanceof Error ? e.message : "Could not dispatch into this tab.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative shrink-0">
      {pickerOpen && (
        <div className="absolute bottom-full left-0 right-0 z-40 mb-1.5">
          <PromptPicker
            projectName={tab}
            projectScopedOnly
            onPick={(resolved) => {
              setText(resolved);
              // Focus returns to the composer so the picked template can be
              // edited before it is dispatched — picking is not sending.
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border-default bg-surface-raised">
        {error && (
          <div className="flex items-start gap-2 border-b border-status-negative/30 bg-status-negative-subtle px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-negative" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs text-status-negative">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="ui-icon-action shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            // "/" on an empty composer is the library shortcut. Anywhere else
            // it is just a slash — paths and flags must stay typeable.
            if (next === "/" && text === "") { setPickerOpen(true); return; }
            setText(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          onPaste={(e) => { if (attachments.addFromPaste(e)) e.preventDefault(); }}
          placeholder={`Describe a task for ${tab} — “/” for the prompt library`}
          aria-label={`Prompt for ${tab}`}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none"
          style={{ fieldSizing: "content", maxHeight: "8rem" } as React.CSSProperties}
        />

        <AttachmentStrip attachments={attachments} />

        <div className="flex items-center gap-1.5 border-t border-border-subtle px-2.5 py-1.5">
          <AttachButton attachments={attachments} />
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            title="Prompt library"
            className="ui-btn-icon shrink-0"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-micro text-text-muted">
            Enter sends · Shift+Enter for a new line
          </span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={(!text.trim() && attachments.attachments.length === 0) || sending}
            className={cn(
              "inline-flex shrink-0 ui-tap items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              sent
                ? "bg-status-positive text-text-inverted"
                : text.trim() || attachments.attachments.length
                  ? "bg-text-primary text-text-inverted hover:opacity-90"
                  : "pointer-events-none bg-surface-overlay text-text-muted opacity-40",
            )}
          >
            {sending ? <Loader2 className="ui-spinner-sm" /> : sent ? "Sent ✓" : <>Send <Send className="h-3 w-3" /></>}
          </button>
        </div>

        {/* Persists past the 2s "Sent ✓" blip — the honest answer to "did it
            actually do anything?" for exactly the case that needs one: queued
            or still working. Terminal output arriving is the real confirmation
            for a ran-now dispatch, so this stays quiet once liveDispatch settles
            positive; it's the queued/failed/unconfirmed cases this exists for. */}
        {(trackedCommandId || trackedRunId) && (
          <div className="flex items-center gap-2 border-t border-border-subtle px-2.5 py-1.5 text-micro">
            <span className={dispatchToneDotClass(liveDispatch?.tone ?? "neutral")} />
            <span className="min-w-0 flex-1 truncate text-text-secondary">
              {liveDispatch?.label ?? "Checking status…"}
              {liveDispatch?.detail && (
                <span className="text-text-tertiary"> — {liveDispatch.detail}</span>
              )}
            </span>
            <button
              type="button"
              onClick={clearTracked}
              aria-label="Dismiss dispatch status"
              className="ui-icon-action shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
