"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * One overflow menu for list rows.
 *
 * A row that renders every action it supports asks the reader to scan them all
 * to find the one they came for, and asks it again for every row. /money
 * rendered six controls per subscription — fifty-four buttons on one page —
 * and every one of them competed with the amount, which is the thing the page
 * is actually about.
 *
 * So the repeated action stays inline and the rest come here. That is
 * progressive disclosure applied to a row rather than a page.
 *
 * Closes on outside click, on Escape, and on choosing anything — the last one
 * is why `onClick` sits on the container rather than on each item: a caller
 * that adds an item should not have to remember to close the menu, because the
 * one that forgets leaves a menu hanging over the row it just acted on.
 *
 * An item that answers IN PLACE — a two-step "Delete? Yes/No" — must opt out of
 * that, or its own first click unmounts the confirm it just asked for. Wrap it:
 *
 *   <span onClick={(e) => e.stopPropagation()}>
 *     <DeleteButton … />
 *   </span>
 *
 * The click still reaches the button; it just stops bubbling to the container.
 */
export function RowActions({
  children,
  label = "More actions",
  align = "right",
}: {
  children: React.ReactNode;
  label?: string;
  /** `left` when the trigger sits near the right edge would push the panel off-screen. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ui-btn-icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`ui-menu ${align === "left" ? "left-0 right-auto" : ""}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
