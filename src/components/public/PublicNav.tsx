"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { PUBLIC_NAV_GROUPS, type PublicNavGroup } from "@/config/auth";

/**
 * Public marketing nav.
 *   Desktop (md+): each group label is a hover/click dropdown. Panel shows
 *                  label + description per item — same as a Linear / Vercel
 *                  mega-menu, but tuned for the small surface area Cockpit
 *                  actually has (two groups, six items).
 *   Mobile (<md):  hamburger icon → full-screen drawer with the same groups
 *                  stacked vertically.
 */
export function PublicNav() {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Esc closes anything open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenGroup(null);
      setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Lock body scroll when mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <>
      {/* Desktop — grouped dropdowns */}
      <div className="hidden items-center gap-1 md:flex">
        {PUBLIC_NAV_GROUPS.map((group) => (
          <PublicNavDropdown
            key={group.label}
            group={group}
            open={openGroup === group.label}
            onOpen={() => setOpenGroup(group.label)}
            onClose={() => setOpenGroup(null)}
          />
        ))}
      </div>

      {/* Mobile — hamburger + drawer */}
      <button
        type="button"
        className="ui-public-nav-toggle md:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {drawerOpen && (
        <PublicNavDrawer onClose={() => setDrawerOpen(false)} />
      )}
    </>
  );
}

function PublicNavDropdown({
  group,
  open,
  onOpen,
  onClose,
}: {
  group: PublicNavGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        className="ui-public-nav-trigger"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span>{group.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ui-public-nav-panel" role="menu">
          <div className="grid gap-1">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="ui-public-nav-panel-item"
                role="menuitem"
                onClick={onClose}
              >
                <span className="ui-public-nav-panel-item-label">{item.label}</span>
                <span className="ui-public-nav-panel-item-desc">{item.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicNavDrawer({ onClose }: { onClose: () => void }) {
  // Render at the document root so the drawer is never trapped inside an
  // ancestor with overflow-hidden or a transform-induced containing block.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ui-public-drawer" role="dialog" aria-modal="true">
      <div className="ui-public-drawer-bar">
        <button
          type="button"
          className="ui-public-nav-toggle"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="ui-public-drawer-body">
        {PUBLIC_NAV_GROUPS.map((group) => (
          <section key={group.label} className="ui-public-drawer-section">
            <div className="ui-public-drawer-section-label">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="ui-public-drawer-item"
                >
                  <span className="ui-public-nav-panel-item-label">{item.label}</span>
                  <span className="ui-public-nav-panel-item-desc">{item.description}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
