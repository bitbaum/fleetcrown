"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

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
  const containerPos =
    position === "bottom-mobile"
      ? "items-end md:items-center"
      : "items-center";
  const panelMargin =
    position === "bottom-mobile" ? "mx-4 mb-4 md:mb-0" : "";
  return (
    <div className={cn("fixed inset-0 z-50 flex justify-center p-4", containerPos)}>
      <div
        className="absolute inset-0 bg-black/48 backdrop-blur-md"
        onClick={disableClose ? undefined : onClose}
      />
      <div
        className={cn(
          "relative w-full ui-card-shell-raised rounded-[2rem] max-h-[calc(100vh-2rem)] overflow-y-auto",
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
  size?: "md" | "lg" | "xl";
  /** "drawer", "modal", or "background" (page bg). */
  surface?: "drawer" | "modal" | "background";
  disableClose?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  useEscapeToClose(onClose, disableClose);
  const surfaceClass =
    surface === "drawer"
      ? "bg-surface-drawer"
      : surface === "modal"
        ? "bg-surface-modal"
        : "bg-surface-page";
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/42 backdrop-blur-sm"
        onClick={disableClose ? undefined : onClose}
      />
      <div
        className={cn(
          "relative flex w-full flex-col border-l border-border-subtle shadow-[var(--shadow-panel-strong)]",
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
