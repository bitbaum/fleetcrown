"use client";

import { useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Send, X } from "lucide-react";
import { postJson } from "@/lib/api/fetch";
import { PromptPicker } from "@/components/prompts/PromptPicker";
import { cn } from "@/lib/utils";

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

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || sending) return;
    setSending(true);
    setError(null);
    try {
      await postJson("/api/control/tab-inject", { tab, prompt });
      setText("");
      setSent(true);
      window.setTimeout(() => setSent(false), 2000);
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
          placeholder={`Describe a task for ${tab} — “/” for the prompt library`}
          aria-label={`Prompt for ${tab}`}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none"
          style={{ fieldSizing: "content", maxHeight: "8rem" } as React.CSSProperties}
        />

        <div className="flex items-center gap-1.5 border-t border-border-subtle px-2.5 py-1.5">
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
            disabled={!text.trim() || sending}
            className={cn(
              "inline-flex shrink-0 ui-tap items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              sent
                ? "bg-status-positive text-text-inverted"
                : text.trim()
                  ? "bg-text-primary text-text-inverted hover:opacity-90"
                  : "pointer-events-none bg-surface-overlay text-text-muted opacity-40",
            )}
          >
            {sending ? <Loader2 className="ui-spinner-sm" /> : sent ? "Sent ✓" : <>Send <Send className="h-3 w-3" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
