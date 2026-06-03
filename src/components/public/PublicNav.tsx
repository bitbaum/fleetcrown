"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Menu, X, ExternalLink } from "lucide-react";
import { PUBLIC_NAV, type PublicNavEntry } from "@/config/auth";

/**
 * Public marketing nav.
 *
 *   Desktop (md+): renders each PUBLIC_NAV entry — a "menu" becomes a hover/
 *                  click mega-menu dropdown with label + description per
 *                  item; a "link" becomes a single nav link.
 *   Mobile (<md):  hamburger icon → portaled full-screen drawer with the
 *                  same entries stacked vertically.
 *
 * PUBLIC_NAV is the SSOT — the architectural boundary that per-user content
 * (e.g. Thoughts) does not live here is enforced by editing that constant
 * alone.
 */
export function PublicNav() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenMenu(null);
      setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      {/* Desktop */}
      <div className="hidden items-center gap-1 md:flex">
        {PUBLIC_NAV.map((entry) => {
          if (entry.kind === "menu") {
            return (
              <PublicNavDropdown
                key={entry.label}
                entry={entry}
                open={openMenu === entry.label}
                onOpen={() => setOpenMenu(entry.label)}
                onClose={() => setOpenMenu(null)}
              />
            );
          }
          if (entry.kind === "external") {
            return (
              <a
                key={entry.label}
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-public-nav-link inline-flex items-center gap-1"
                title={entry.description}
              >
                {entry.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            );
          }
          return (
            <Link key={entry.label} href={entry.href} className="ui-public-nav-link">
              {entry.label}
            </Link>
          );
        })}
      </div>

      {/* Mobile */}
      <button
        type="button"
        className="ui-public-nav-toggle md:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {drawerOpen && <PublicNavDrawer onClose={() => setDrawerOpen(false)} />}
    </>
  );
}

function PublicNavDropdown({
  entry,
  open,
  onOpen,
  onClose,
}: {
  entry: Extract<PublicNavEntry, { kind: "menu" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    >
      <button
        type="button"
        className="ui-public-nav-trigger"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span>{entry.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ui-public-nav-panel-wrap">
          <div className="ui-public-nav-panel" role="menu">
            {entry.sections.map((section) => (
              <section key={section.title} className="ui-public-nav-panel-section">
                <div className="ui-public-nav-panel-section-label">{section.title}</div>
                <div className="grid gap-1">
                  {section.items.map((item) => (
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
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicNavDrawer({ onClose }: { onClose: () => void }) {
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
        {PUBLIC_NAV.map((entry) => {
          if (entry.kind === "menu") {
            return (
              <section key={entry.label} className="ui-public-drawer-section">
                <div className="ui-public-drawer-section-label">{entry.label}</div>
                <div className="space-y-1">
                  {entry.sections.map((section) => (
                    <div key={section.title} className="space-y-1">
                      <div className="ui-public-drawer-subsection-label">{section.title}</div>
                      {section.items.map((item) => (
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
                  ))}
                </div>
              </section>
            );
          }
          if (entry.kind === "external") {
            return (
              <a
                key={entry.label}
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="ui-public-drawer-item"
              >
                <span className="ui-public-nav-panel-item-label inline-flex items-center gap-1.5">
                  {entry.label}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </span>
                {entry.description && (
                  <span className="ui-public-nav-panel-item-desc">{entry.description}</span>
                )}
              </a>
            );
          }
          return (
            <Link
              key={entry.label}
              href={entry.href}
              onClick={onClose}
              className="ui-public-drawer-item"
            >
              <span className="ui-public-nav-panel-item-label">{entry.label}</span>
            </Link>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
