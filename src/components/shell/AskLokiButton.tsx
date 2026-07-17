"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Loader2, MessageSquare, Play, Stethoscope, Wrench, X } from "lucide-react";
import {
  readAssistantContext,
  subscribeAssistantContext,
  type AssistantProjectContext,
} from "@/lib/assistant-context";
import { LOKI_PROACTIVE_STARTERS } from "@/config/loki-suggested-actions";
import { useProjectDispatch, DispatchedNote, type ProjectDispatchKind } from "@/components/projects/ProjectActionButtons";
import { postJson } from "@/lib/api/fetch";

type Turn = { role: "user" | "loki"; text: string };

function subscribeContext(onChange: () => void) {
  return subscribeAssistantContext(onChange);
}

/** One page-derived proposal: a concrete dispatch, one click, inline result. */
function ProposalChip({
  context,
  kind,
  signalKey,
  icon: Icon,
  label,
}: {
  context: AssistantProjectContext;
  kind: ProjectDispatchKind;
  signalKey?: string;
  icon: typeof Wrench;
  label: string;
}) {
  const { state, dispatch } = useProjectDispatch(context.projectId);

  if (state.phase === "done") {
    return (
      <span className="inline-flex min-h-8 items-center px-1">
        <DispatchedNote workspaceKey={context.workspaceKey} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => dispatch(kind, signalKey)}
        disabled={state.phase === "sending"}
        className="ui-btn-secondary min-h-8 gap-1.5 px-2.5 text-xs"
        title={label}
      >
        {state.phase === "sending"
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          : <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="max-w-56 truncate">{state.phase === "sending" ? "Dispatching…" : label}</span>
      </button>
      {state.phase === "error" && <span className="ui-error text-xs">{state.message}</span>}
    </span>
  );
}

/**
 * The floating assistant. Not a link — a context-aware panel: on a project
 * page it knows the project and proposes the concrete actions its profile
 * calls out (fix an open issue, run the queued next step, diagnose a timeout
 * streak), plus a project-scoped Loki thread inline. Elsewhere it offers the
 * fleet-wide starters. `?` toggles it; `loki:open` opens it prefilled.
 */
export function AskLokiButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const sentContextRef = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const context = useSyncExternalStore(subscribeContext, readAssistantContext, () => null);

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);

  useEffect(() => {
    const eventHandler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt: string }>).detail?.prompt ?? "";
      setOpen(true);
      if (prompt.trim()) setInput(prompt.trim());
    };
    window.addEventListener("loki:open", eventHandler);
    return () => window.removeEventListener("loki:open", eventHandler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns, asking]);

  const ask = useCallback(async () => {
    const message = input.trim();
    if (!message || asking) return;
    setInput("");
    setAskError(null);
    setTurns((prev) => [...prev, { role: "user", text: message }]);
    setAsking(true);
    try {
      const projectKey = context?.workspaceKey ?? null;
      // Send the heavy project context once per project thread per page life.
      const includeContext = projectKey != null && sentContextRef.current !== projectKey;
      const res = await postJson("/api/loki", {
        message,
        ...(projectKey ? { projectKey, includeContext } : {}),
      });
      const body = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!res.ok || !body.ok || !body.text) {
        setAskError(body.error ?? "Loki did not answer — try again.");
      } else {
        if (includeContext && projectKey) sentContextRef.current = projectKey;
        setTurns((prev) => [...prev, { role: "loki", text: body.text! }]);
      }
    } catch {
      setAskError("Loki is unreachable — network error.");
    } finally {
      setAsking(false);
    }
  }, [input, asking, context?.workspaceKey]);

  if (pathname === "/loki") return null;

  const canAct = context != null && !context.readonly;

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-4 z-40 flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border-default bg-surface-overlay shadow-panel-strong sm:right-7"
          role="dialog"
          aria-label="Loki assistant"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
            <div className="min-w-0">
              <p className="ui-kicker">Loki</p>
              <p className="truncate text-sm font-medium text-text-primary">
                {context ? context.name : "Your fleet"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={context ? `/loki?project=${encodeURIComponent(context.workspaceKey)}` : "/loki"}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-secondary"
                title="Continue in the full Loki workspace"
              >
                Full Loki <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ui-btn-icon"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {/* Page-aware proposals: everything the page called out, one click each. */}
            <div className="space-y-2">
              <p className="ui-micro-label">{context ? "Proposed for this project" : "Start somewhere"}</p>
              <div className="flex flex-wrap gap-1.5">
                {canAct && context.signals.map((signal) => (
                  <ProposalChip
                    key={signal.key}
                    context={context}
                    kind="fix_signal"
                    signalKey={signal.key}
                    icon={Wrench}
                    label={`Fix: ${signal.label.toLowerCase()}`}
                  />
                ))}
                {canAct && context.nextStep && (
                  <ProposalChip context={context} kind="next_step" icon={Play} label="Run next step" />
                )}
                {canAct && context.timeoutStreak >= 2 && (
                  <ProposalChip
                    context={context}
                    kind="diagnose_timeouts"
                    icon={Stethoscope}
                    label={`Diagnose ${context.timeoutStreak} timed-out runs`}
                  />
                )}
                {!context && LOKI_PROACTIVE_STARTERS.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => setInput(starter.prompt)}
                    className="ui-btn-secondary min-h-8 px-2.5 text-xs"
                  >
                    {starter.label}
                  </button>
                ))}
                {context && !canAct && (
                  <p className="text-xs text-text-muted">Team project — ask about it below; actions are owner-only.</p>
                )}
                {canAct && context.signals.length === 0 && !context.nextStep && context.timeoutStreak < 2 && (
                  <p className="text-xs text-text-muted">No open callouts — ask anything about this project below.</p>
                )}
              </div>
            </div>

            {turns.map((turn, i) => (
              <div key={i} className={turn.role === "user" ? "text-right" : ""}>
                <p
                  className={
                    turn.role === "user"
                      ? "inline-block max-w-[90%] rounded-lg bg-surface-raised px-3 py-2 text-left text-sm text-text-primary"
                      : "whitespace-pre-wrap text-sm leading-relaxed text-text-secondary"
                  }
                >
                  {turn.text}
                </p>
              </div>
            ))}
            {asking && (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loki is thinking…
              </p>
            )}
            {askError && <p className="ui-error text-xs">{askError}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="flex items-center gap-2 border-t border-border-subtle p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={context ? `Ask about ${context.name}…` : "Ask across your fleet…"}
              className="ui-input-compact min-w-0 flex-1"
              aria-label="Ask Loki"
            />
            <button type="submit" disabled={!input.trim() || asking} className="ui-btn-primary min-h-9 px-3 text-xs">
              Ask
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="ui-fab fixed bottom-7 right-7 z-40 hidden h-14 w-14 items-center justify-center active:scale-95 md:flex focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title={open ? "Close Loki (press ?)" : "Open Loki (press ?)"}
        aria-label={open ? "Close Loki assistant" : "Open Loki assistant"}
        aria-expanded={open}
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    </>
  );
}
