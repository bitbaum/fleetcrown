"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Mic, MicOff, Globe, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { CATEGORY_META } from "@/config/prompt-library";
import { Modal } from "@/components/ui/modal";
import { postJson } from "@/lib/api/fetch";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { type Message, QUICK_PROMPTS, GLOBAL_PROMPTS, useElapsedTimer } from "./ask-ivy-helpers";

export function AskIvyModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const elapsed = useElapsedTimer(loading);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const appendTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const { listening, supported, toggle: toggleMic } = useSpeechRecognition(appendTranscript);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await postJson("/api/ivy", { message: text });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages((prev) => [...prev, { role: "ivy", text: data.error ?? "Something went wrong.", error: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "ivy", text: data.text, durationMs: data.durationMs, model: data.model }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "ivy", text: String(e), error: true }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const displayedPrompts = showAllPrompts ? GLOBAL_PROMPTS : QUICK_PROMPTS;

  return (
    <Modal onClose={onClose} size="2xl" padded={false} position="bottom-mobile" disableClose={loading} className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle px-5 py-4">
          <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌿</span>
            <div>
              <p className="ui-kicker">Copilot</p>
              <div className="text-base font-medium text-text-primary">Ask Ivy</div>
            </div>
          </div>
          <button onClick={onClose} disabled={loading} className="rounded-xl p-2 text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-30">
            <X className="h-4 w-4" />
          </button>
        </div>
        </div>

        {/* Quick prompts */}
        {messages.length === 0 && (
          <div className="shrink-0 border-b border-border-subtle px-5 py-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="ui-kicker">
                Prompts
              </span>
              <button
                onClick={() => setShowAllPrompts(!showAllPrompts)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:text-text-secondary"
              >
                {showAllPrompts ? (
                  <><ChevronUp className="h-3 w-3" /> show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3" /> all global ({GLOBAL_PROMPTS.length})</>
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {displayedPrompts.map((t) => {
                const meta = CATEGORY_META[t.category];
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (t.scope === "global") {
                        send(t.template);
                      } else {
                        setInput(t.template);
                        inputRef.current?.focus();
                      }
                    }}
                    disabled={loading}
                    className="group flex flex-col gap-1 rounded-2xl border border-border-subtle bg-surface-base px-3.5 py-3 text-left transition-all hover:bg-surface-raised hover:border-border-default disabled:opacity-30"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-medium text-text-primary transition-colors leading-tight">
                        {t.name}
                      </span>
                      {t.scope === "global"
                        ? <Globe className="h-3 w-3 text-text-muted shrink-0" />
                        : <FolderOpen className="h-3 w-3 text-text-muted shrink-0" />
                      }
                    </div>
                    <p className="text-[10px] text-text-secondary leading-snug line-clamp-2">
                      {t.description}
                    </p>
                    <span className={`self-start mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-6 text-center">
              <span className="text-4xl mb-3">🌿</span>
              <div className="text-sm text-text-secondary">Ask me anything about calendar, people, goals, money, or projects.</div>
              <div className="mt-2 text-xs text-text-tertiary">I have full access to your knowledge graph and tools.</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent-primary text-text-inverted rounded-br-sm"
                  : msg.error
                  ? "ui-box-error rounded-bl-sm"
                  : "bg-surface-raised text-text-primary rounded-bl-sm border border-border-subtle"
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.role === "ivy" && !msg.error && msg.durationMs && (
                  <div className="mt-1.5 text-[10px] text-text-muted">
                    {(msg.durationMs / 1000).toFixed(1)}s{msg.model ? ` · ${msg.model}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-sm border border-border-subtle bg-surface-raised px-4 py-3">
                <Loader2 className="ui-spinner-sm text-status-positive shrink-0" />
                <div>
                  <span className="text-xs text-text-secondary">
                    {elapsed < 5 ? "Ivy is thinking…" :
                     elapsed < 15 ? "Searching your knowledge graph…" :
                     elapsed < 25 ? "Composing a response…" :
                     "Almost there…"}
                  </span>
                  <span className="ml-2 text-[10px] text-text-muted">{elapsed}s</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 ui-card-section">
          <div className={`flex items-end gap-1 rounded-[1.5rem] border bg-surface-overlay transition-colors ${
            listening ? "border-accent-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent-primary)_16%,transparent)]" : "border-border-default"
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={listening ? "Listening…" : "Ask Ivy anything…"}
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none max-h-32 disabled:opacity-50"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            {supported && (
              <button
                onClick={toggleMic}
                disabled={loading}
                title={listening ? "Stop recording" : "Voice input"}
                className={`m-1 rounded-2xl p-2.5 transition-colors shrink-0 ${
                  listening
                    ? "bg-status-negative/20 text-status-negative hover:bg-status-negative/30 animate-pulse"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-raised"
                }`}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="m-1 rounded-2xl bg-accent-primary p-2.5 text-text-inverted transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 text-center text-[10px] text-text-muted">
            Enter to send · Shift+Enter for new line · Esc to close
            {supported && <span> · 🎤 mic available</span>}
          </div>
        </div>
    </Modal>
  );
}
