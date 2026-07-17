"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useOverlayLock } from "@/hooks/use-overlay-lock";

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
} as const;

type Size = keyof typeof SIZE_CLASSES;

function useEscapeToClose(onClose: () => void, disabled: boolean) {
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, disabled]);
}

/** Centered modal dialog with backdrop + Esc-to-close. */
export function Modal({
  onClose,
  size = "md",
  padded = true,
  position = "center",
  disableClose = false,
  className,
  children,
}: {
  onClose: () => void;
  size?: Size;
  /** Apply default p-5 + space-y-4 panel padding. Disable for modals with custom internal layout. */
  padded?: boolean;
  /** "center" (default) or "bottom-mobile" — anchors to bottom on small screens, centered on md+. */
  position?: "center" | "bottom-mobile";
  /** When true, backdrop click and Esc are ignored (e.g. during async work). */
  disableClose?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  useEscapeToClose(onClose, disableClose);
  useOverlayLock(true);
  const containerPos =
    position === "bottom-mobile"
      ? "items-end md:items-center"
      : "items-end md:items-center";
  const panelMargin =
    position === "bottom-mobile"
      ? "ui-modal-panel-mobile-bottom"
      : "ui-modal-panel-mobile-clearance";
  return (
    <div className={cn("fixed inset-0 z-[60] flex justify-center p-4", containerPos)}>
      <div
        className="absolute inset-0 ui-backdrop-strong"
        onClick={disableClose ? undefined : onClose}
      />
      <div
        className={cn(
          "ui-modal-panel ui-card-shell-raised",
          SIZE_CLASSES[size],
          padded && "p-5 space-y-4",
          panelMargin,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Right-anchored drawer with backdrop + Esc-to-close. */
export function Drawer({
  onClose,
  size = "lg",
  surface = "drawer",
  disableClose = false,
  className,
  children,
}: {
  onClose: () => void;
  size?: "md" | "lg" | "xl" | "2xl";
  /** "drawer", "modal", or "background" (page bg). */
  surface?: "drawer" | "modal" | "background";
  disableClose?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  useEscapeToClose(onClose, disableClose);
  useOverlayLock(true);
  const surfaceClass =
    surface === "drawer"
      ? "bg-surface-drawer"
      : surface === "modal"
        ? "bg-surface-modal"
        : "bg-surface-page";
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="presentation">
      <div
        className="absolute inset-0 ui-backdrop"
        onClick={disableClose ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-full w-full max-w-full flex-col overflow-hidden sm:border-l border-border-subtle shadow-panel-strong",
          SIZE_CLASSES[size],
          surfaceClass,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
