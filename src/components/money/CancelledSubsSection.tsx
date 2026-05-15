"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CancelledSubsSection({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="border-t border-border-subtle pt-3 mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "Show"} {count} cancelled
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
