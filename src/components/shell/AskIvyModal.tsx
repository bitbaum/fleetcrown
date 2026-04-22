"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Mic, MicOff, Zap } from "lucide-react";
import { PROMPT_TEMPLATES } from "@/config/prompt-library";

type Message = {
  role: "user" | "ivy";
  text: string;
  durationMs?: number;
  model?: string;
  error?: boolean;
};

// Featured prompts shown as quick-access chips (global scope only for AskIvy)
const QUICK_PROMPTS = PROMPT_TEMPLATES.filter((t) => t.featured && t.scope === "global").concat(
  PROMPT_TEMPLATES.filter((t) => t.featured && t.scope === "project").slice(0, 3)
);

// ─── Mic hook ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function useSpeechRecognition(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: AnySpeechRecognition) => {
      const transcript: string = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
  }, [onResult]);

  const toggle = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    if (listening) {
      r.stop();
      setListening(false);
    } else {
      r.start();
      setListening(true);
    }
  }, [listening]);

  return { listening, supported, toggle };
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, onClose]);

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
      const res = await fetch("/api/ivy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
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

  // All featured prompts + ability to expand to all global ones
  const displayedPrompts = showAllPrompts
    ? PROMPT_TEMPLATES.filter((t) => t.scope === "global")
    : QUICK_PROMPTS;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && onClose()} />

      <div className="relative w-full max-w-2xl mx-4 mb-4 md:mb-0 bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌿</span>
            <span className="text-sm font-semibold">Ask Ivy</span>
            <span className="text-xs text-white/30">your life OS copilot</span>
          </div>
          <button onClick={onClose} disabled={loading} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick prompts */}
        {messages.length === 0 && (
          <div className="px-4 pt-3 pb-2 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-white/25 flex items-center gap-1.5">
                <Zap className="h-3 w-3" /> Quick prompts
              </span>
              <button
                onClick={() => setShowAllPrompts(!showAllPrompts)}
                className="text-[10px] text-white/25 hover:text-white/60 transition-colors"
              >
                {showAllPrompts ? "show less" : `show all (${PROMPT_TEMPLATES.filter(t => t.scope === "global").length})`}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayedPrompts.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.scope === "global") {
                      send(t.template);
                    } else {
                      // For project-scoped, put in input so user can review/edit
                      setInput(t.template);
                      inputRef.current?.focus();
                    }
                  }}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-white/55 hover:text-white/80 transition-colors disabled:opacity-30 text-left"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-6 text-center">
              <span className="text-4xl mb-3">🌿</span>
              <div className="text-sm text-white/50">Ask me anything — calendar, people, goals, money, projects.</div>
              <div className="text-xs text-white/25 mt-2">I have full access to your knowledge graph and tools.</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-emerald-600/80 text-white rounded-br-sm"
                  : msg.error
                  ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-sm"
                  : "bg-white/[0.06] text-white/80 rounded-bl-sm"
              }`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.role === "ivy" && !msg.error && msg.durationMs && (
                  <div className="text-[10px] text-white/20 mt-1.5">
                    {(msg.durationMs / 1000).toFixed(1)}s{msg.model ? ` · ${msg.model}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400 shrink-0" />
                <div>
                  <span className="text-xs text-white/50">
                    {elapsed < 5 ? "Ivy is thinking…" :
                     elapsed < 15 ? "Searching your knowledge graph…" :
                     elapsed < 25 ? "Composing a response…" :
                     "Almost there…"}
                  </span>
                  <span className="text-[10px] text-white/20 ml-2">{elapsed}s</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className={`flex items-end gap-1 rounded-xl bg-white/[0.04] border transition-colors ${
            listening ? "border-emerald-500/50 shadow-[0_0_0_2px_rgba(16,185,129,0.08)]" : "border-white/10 focus-within:border-white/20"
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={listening ? "Listening…" : "Ask Ivy anything…"}
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none max-h-32 disabled:opacity-50"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            {supported && (
              <button
                onClick={toggleMic}
                disabled={loading}
                title={listening ? "Stop recording" : "Voice input"}
                className={`p-2.5 m-1 rounded-lg transition-colors shrink-0 ${
                  listening
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse"
                    : "text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="p-2.5 m-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="text-[10px] text-white/20 mt-1.5 text-center">
            Enter to send · Shift+Enter for new line · Esc to close
            {supported && <span> · 🎤 mic available</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
