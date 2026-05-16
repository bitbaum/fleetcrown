"use client";

import { useState, useRef } from "react";
import { Loader2, Send, X, GripVertical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function QueueList({
  queue,
  onSend,
  onRemove,
  onReorder,
  onEdit,
  onMerge,
  merging,
}: {
  queue: string[];
  onSend?: (i: number) => void;
  onRemove?: (i: number) => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (i: number, text: string) => void;
  onMerge?: () => void;
  merging?: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditText(queue[i]);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    if (editingIndex !== null && onEdit) onEdit(editingIndex, editText);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-0 border-t border-border-subtle">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:px-5">
        <p className="ui-kicker">Queue · {queue.length}</p>
        {queue.length >= 2 && onMerge && (
          <button
            onClick={onMerge}
            disabled={merging}
            title="Merge all items into one coherent prompt with AI"
            className="flex items-center gap-1 text-micro text-text-muted transition-colors hover:text-accent-text disabled:opacity-50"
          >
            {merging ? <Loader2 className="ui-spinner-xs" /> : <Sparkles className="h-3 w-3" />}
            {merging ? "Merging…" : "AI merge"}
          </button>
        )}
      </div>
      {queue.map((item, i) => (
        <div
          key={i}
          draggable={onReorder ? true : undefined}
          onDragStart={() => { dragIndex.current = i; }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex.current !== null && dragIndex.current !== i && onReorder) {
              onReorder(dragIndex.current, i);
            }
            setDragOver(null);
            dragIndex.current = null;
          }}
          onDragEnd={() => { setDragOver(null); dragIndex.current = null; }}
          className={cn(
            "flex items-start gap-2 px-4 py-2 sm:px-5",
            dragOver === i && "bg-accent-primary/5",
            "border-b border-border-subtle last:border-b-0",
          )}
        >
          {onReorder && (
            <div className="mt-[3px] shrink-0 cursor-grab text-text-muted hover:text-text-secondary active:cursor-grabbing">
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
          <span className={cn(
            "mt-[3px] shrink-0 text-micro font-bold tabular-nums",
            i === 0 ? "text-accent-text" : "text-text-muted",
          )}>
            {i + 1}
          </span>

          {editingIndex === i ? (
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); }
                if (e.key === "Escape") setEditingIndex(null);
              }}
              onBlur={confirmEdit}
              rows={2}
              className="ui-input flex-1 resize-none text-sm"
              style={{ fieldSizing: "content", maxHeight: "6rem" } as React.CSSProperties}
            />
          ) : (
            <button
              onClick={() => onEdit && startEdit(i)}
              title="Click to edit · use → to send now"
              className={cn(
                "flex-1 text-left text-sm leading-snug transition-colors",
                i === 0 ? "text-text-primary" : "text-text-tertiary",
                onEdit && "hover:text-text-primary",
              )}
            >
              {item}
            </button>
          )}

          {editingIndex !== i && (
            <div className="mt-0.5 flex shrink-0 gap-0.5">
              {onSend && (
                <button
                  onClick={() => onSend(i)}
                  className="ui-icon-btn rounded p-0.5 text-text-muted transition-colors hover:text-accent-text"
                  title="Send now"
                >
                  <Send className="h-3 w-3" />
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="ui-icon-btn rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
                  title="Remove from queue"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
