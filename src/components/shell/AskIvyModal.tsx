"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2 } from "lucide-react";

type Message = {
  role: "user" | "ivy";
  text: string;
  durationMs?: number;
  model?: string;
  error?: boolean;
};

export function AskIvyModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, onClose]);

  const send = async () => {
    const text = input.trim();
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
        setMessages((prev) => [
          ...prev,
          { role: "ivy", text: data.error ?? "Something went wrong.", error: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ivy", text: data.text, durationMs: data.durationMs, model: data.model },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "ivy", text: String(e), error: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl mx-4 mb-4 md:mb-0 bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌿</span>
            <span className="text-sm font-semibold">Ask Ivy</span>
            <span className="text-xs text-white/30">your life OS copilot</span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <span className="text-4xl mb-3">🌿</span>
              <div className="text-sm text-white/50">
                Ask me anything — calendar, people, goals, money, reminders.
              </div>
              <div className="text-xs text-white/25 mt-2">
                I have full access to your knowledge graph and tools.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-emerald-600/80 text-white rounded-br-sm"
                    : msg.error
                    ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-sm"
                    : "bg-white/[0.06] text-white/80 rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.role === "ivy" && !msg.error && msg.durationMs && (
                  <div className="text-[10px] text-white/20 mt-1.5">
                    {(msg.durationMs / 1000).toFixed(1)}s
                    {msg.model ? ` · ${msg.model}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span className="text-xs text-white/40">Ivy is thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2">
          <div className="flex items-end gap-2 rounded-xl bg-white/[0.04] border border-white/10 focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Ivy anything…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none max-h-32 disabled:opacity-50"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2.5 m-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="text-[10px] text-white/20 mt-1.5 text-center">
            Enter to send · Shift+Enter for new line · Esc to close
          </div>
        </div>
      </div>
    </div>
  );
}
