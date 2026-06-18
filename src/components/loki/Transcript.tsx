"use client";

import { useEffect, useRef } from "react";
import type { LokiMessage } from "./types";

/** Human-readable label for an assistant turn's kind badge. SSOT for the
 *  small set of kinds the messages route emits. */
const KIND_LABEL: Record<string, string> = {
  dispatch: "Dispatched",
  chat: "Ivy",
  command: "Needs project",
};

export function Transcript({
  messages,
  sending,
}: {
  messages: LokiMessage[];
  sending: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Pin to the latest turn as messages arrive (chat convention).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="ui-loki-bubble ui-loki-bubble-user">
            {m.content}
          </div>
        ) : (
          <div key={m.id} className="flex flex-col">
            {m.kind && <span className="ui-loki-kind">{KIND_LABEL[m.kind] ?? m.kind}</span>}
            <div className="ui-loki-bubble ui-loki-bubble-assistant">{m.content}</div>
          </div>
        ),
      )}
      {sending && (
        <div className="ui-loki-bubble ui-loki-bubble-assistant">Thinking…</div>
      )}
      <div ref={endRef} />
    </div>
  );
}
