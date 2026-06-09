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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Sparkles } from "lucide-react";
import { QueueItemRow, SortableQueueItem, type RowProps } from "./queue-item-row";

export function QueueList({
  queue,
  blockedReason,
  onSend,
  onRemove,
  onReorder,
  onEdit,
  onMerge,
  merging,
  onMergeItems,
}: {
  queue: string[];
  blockedReason?: string | null;
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
        <div className="min-w-0">
          <p className="ui-kicker">Queue · {queue.length}</p>
          {blockedReason && (
            <p className="mt-1 text-micro text-status-warning" title="Next best will stay on recovery work while this gate is active. Use the row send button to run a queued item now.">
              {blockedReason} · pick an item manually
            </p>
          )}
        </div>
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
