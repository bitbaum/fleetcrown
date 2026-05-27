"use client";

import { useState, useRef, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Pencil, Send, X, GripVertical, Sparkles, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type RowProps = {
  index: number;
  item: string;
  isFirst: boolean;
  selected: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  editingIndex: number | null;
  editText: string;
  editRef: React.RefObject<HTMLTextAreaElement | null>;
  onSetEditText: (v: string) => void;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onSend?: () => void;
  onRemove?: () => void;
};

function QueueItemRow({
  index, item, isFirst, selected, isDragging, isOverlay,
  dragHandleProps, editingIndex, editText, editRef,
  onSetEditText, onToggleSelect, onStartEdit, onConfirmEdit, onCancelEdit,
  onSend, onRemove,
}: RowProps) {
  const editing = editingIndex === index;
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-4 py-2 sm:px-5",
        "border-b border-border-subtle last:border-b-0",
        isDragging && "opacity-20",
        isOverlay && "rounded-lg border border-border-default bg-surface-raised shadow-lg",
        selected && !isDragging && "bg-accent-primary/[0.04]",
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggleSelect}
        title={selected ? "Deselect" : "Select"}
        className={cn(
          "mt-[3px] shrink-0 p-0.5 transition-colors",
          selected ? "text-accent-text" : "text-border-default hover:text-text-muted",
        )}
      >
        {selected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
      </button>

      {/* Drag handle — omitted in overlay (no interaction needed) */}
      {dragHandleProps ? (
        <button
          {...dragHandleProps}
          className="mt-[3px] shrink-0 cursor-grab touch-none text-text-muted hover:text-text-secondary active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="mt-[3px] w-3.5 shrink-0" />
      )}

      {/* Position indicator */}
      <span
        className={cn(
          "mt-[3px] shrink-0 text-micro font-bold tabular-nums",
          isFirst ? "text-accent-text" : "text-text-muted",
        )}
      >
        {index + 1}
      </span>

      {/* Content */}
      {editing ? (
        <textarea
          ref={editRef}
          value={editText}
          onChange={(e) => onSetEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onConfirmEdit(); }
            if (e.key === "Escape") onCancelEdit();
          }}
          onBlur={onConfirmEdit}
          rows={2}
          className="ui-input flex-1 resize-none text-sm"
          style={{ fieldSizing: "content", maxHeight: "6rem" } as React.CSSProperties}
        />
      ) : (
        <button
          onClick={onStartEdit}
          title="Click to edit"
          className={cn(
            "group/edit flex flex-1 items-start gap-1 text-left text-sm leading-snug transition-colors",
            isFirst ? "text-text-primary" : "text-text-tertiary",
            "hover:text-text-primary",
          )}
        >
          <span className="flex-1">{item}</span>
          <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-text-muted opacity-0 transition-opacity group-hover/edit:opacity-100" />
        </button>
      )}

      {/* Actions — hidden while editing */}
      {!editing && (
        <div className="mt-0.5 flex shrink-0 gap-0.5">
          {onSend && (
            <button
              onClick={onSend}
              title="Send now"
              className="ui-icon-btn rounded p-0.5 text-text-muted transition-colors hover:text-accent-text"
            >
              <Send className="h-3 w-3" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              title="Remove"
              className="ui-icon-btn rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SortableQueueItem({ id, ...rowProps }: { id: string } & RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <QueueItemRow
        {...rowProps}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
}

export function QueueList({
  queue,
  onSend,
  onRemove,
  onReorder,
  onEdit,
  onMerge,
  merging,
  onMergeItems,
}: {
  queue: string[];
  onSend?: (i: number) => void;
  onRemove?: (i: number) => void;
  onReorder?: (from: number, to: number) => void;
  onEdit?: (i: number, text: string) => void;
  onMerge?: () => void;
  merging?: boolean;
  onMergeItems?: (indices: number[]) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Clear selection when queue length changes (items added/removed/merged).
  useEffect(() => { setSelected(new Set()); }, [queue.length]); // eslint-disable-line react-hooks/set-state-in-effect

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setEditingIndex(null); // close any open edit
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (over && active.id !== over.id) {
      onReorder?.(itemIds.indexOf(String(active.id)), itemIds.indexOf(String(over.id)));
      setSelected(new Set()); // reorder shifts indices — stale selection would pick wrong items
    }
  };

  const toggleSelect = (i: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleMergeSelected = () => {
    const indices = [...selected].sort((a, b) => a - b);
    onMergeItems?.(indices);
    setSelected(new Set());
  };

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditText(queue[i]);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    if (editingIndex !== null && onEdit) onEdit(editingIndex, editText);
    setEditingIndex(null);
  };

  const itemIds = queue.map((item, index) => {
    let hash = 0;
    for (let i = 0; i < item.length; i += 1) hash = ((hash << 5) - hash + item.charCodeAt(i)) | 0;
    const occurrence = queue.slice(0, index).filter((value) => value === item).length;
    return `${hash}:${occurrence}`;
  });
  const activeIndex = activeId !== null ? itemIds.indexOf(activeId) : null;

  const rowProps = (i: number): RowProps => ({
    index: i,
    item: queue[i],
    isFirst: i === 0,
    selected: selected.has(i),
    editingIndex,
    editText,
    editRef,
    onSetEditText: setEditText,
    onToggleSelect: () => toggleSelect(i),
    onStartEdit: onEdit ? () => startEdit(i) : () => {},
    onConfirmEdit: confirmEdit,
    onCancelEdit: () => setEditingIndex(null),
    onSend: onSend ? () => onSend(i) : undefined,
    onRemove: onRemove ? () => onRemove(i) : undefined,
  });

  return (
    <div className="border-t border-border-subtle">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:px-5">
        <p className="ui-kicker">Queue · {queue.length}</p>
        <div className="flex items-center gap-3">
          {selected.size >= 2 && onMergeItems && (
            <button
              onClick={handleMergeSelected}
              title="Concatenate selected items into one"
              className="text-micro text-text-muted transition-colors hover:text-text-primary"
            >
              Merge ({selected.size})
            </button>
          )}
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
      </div>

      {queue.length === 0 && (
        <p className="px-4 pb-3 text-micro text-text-muted sm:px-5">
          Alt+Enter while composing to queue a prompt
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {queue.map((_, i) => (
            <SortableQueueItem key={itemIds[i]} id={itemIds[i]} {...rowProps(i)} />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeIndex !== null && queue[activeIndex] !== undefined && (
            <QueueItemRow {...rowProps(activeIndex)} isOverlay />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
