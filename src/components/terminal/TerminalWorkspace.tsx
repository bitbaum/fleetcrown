"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TerminalLeaf } from "./TerminalLeaf";
import {
  closeLeaf,
  computeLayout,
  firstLeafId,
  leaf,
  setRatio,
  splitLeaf,
  type SplitBox,
  type SplitDir,
  type TermNode,
} from "@/lib/terminal-layout";

type Tab = { id: string; title: string; root: TermNode; activeLeafId: string };

const uid = () => crypto.randomUUID();

export function TerminalWorkspace() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const counter = useRef(0);
  const areaRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function makeTab(): Tab {
    counter.current += 1;
    const lid = uid();
    return { id: uid(), title: `Terminal ${counter.current}`, root: leaf(lid), activeLeafId: lid };
  }

  // Create the first tab after mount. uid() is client-only — a lazy useState
  // initializer would generate a different id on server vs client and
  // hydrate-mismatch, so seeding from an effect is the sanctioned pattern here.
  // The ref guard keeps StrictMode's double-invoke from opening two shells.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const t = makeTab();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only seed, see above
    setTabs([t]);
    setActiveTabId(t.id);
  }, []);

  function addTab() {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId) setActiveTabId(next[next.length - 1]?.id ?? "");
      return next;
    });
  }

  function focusLeaf(tabId: string, paneId: string) {
    setActiveTabId(tabId);
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, activeLeafId: paneId } : t)));
  }

  function splitPane(tabId: string, paneId: string, dir: SplitDir) {
    const newLeaf = uid();
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, root: splitLeaf(t.root, paneId, uid(), newLeaf, dir), activeLeafId: newLeaf }
          : t,
      ),
    );
  }

  function closePane(tabId: string, paneId: string) {
    setTabs((prev) => {
      const out: Tab[] = [];
      for (const t of prev) {
        if (t.id !== tabId) { out.push(t); continue; }
        const root = closeLeaf(t.root, paneId);
        if (root === null) continue; // last pane closed → drop the tab
        out.push({ ...t, root, activeLeafId: firstLeafId(root) });
      }
      if (!out.some((t) => t.id === activeTabId)) setActiveTabId(out[out.length - 1]?.id ?? "");
      return out;
    });
  }

  function startDrag(tabId: string, s: SplitBox, e: React.MouseEvent) {
    e.preventDefault();
    const area = areaRefs.current[tabId];
    if (!area) return;
    const box = area.getBoundingClientRect();
    const regionX = box.left + (s.rect.x / 100) * box.width;
    const regionY = box.top + (s.rect.y / 100) * box.height;
    const regionW = (s.rect.w / 100) * box.width;
    const regionH = (s.rect.h / 100) * box.height;
    const move = (ev: MouseEvent) => {
      const ratio = s.dir === "row" ? (ev.clientX - regionX) / regionW : (ev.clientY - regionY) / regionH;
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, root: setRatio(t.root, s.id, ratio) } : t)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.setProperty("user-select", "none");
  }

  return (
    <div className="ui-term-shell">
      {/* Tab bar */}
      <div className="ui-term-tabbar">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={cn("group ui-term-tab", t.id === activeTabId && "ui-term-tab-active")}
            onMouseDown={() => setActiveTabId(t.id)}
            onDoubleClick={() => setEditingTabId(t.id)}
          >
            {editingTabId === t.id ? (
              <input
                autoFocus
                defaultValue={t.title}
                className="ui-term-tab-input"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, title: v || x.title } : x)));
                  setEditingTabId(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingTabId(null); }}
              />
            ) : (
              <span className="ui-term-tab-label">{t.title}</span>
            )}
            <button
              type="button"
              className="ui-term-tab-close"
              title="Close tab"
              onMouseDown={(e) => { e.stopPropagation(); closeTab(t.id); }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button type="button" className="ui-term-newtab" title="New terminal" onClick={addTab}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Canvases — every tab stays mounted (hidden when inactive) so switching
          tabs or splitting never tears down a live PTY. */}
      <div className="ui-term-stage">
        {tabs.length === 0 ? (
          <div className="ui-term-empty">
            <p>No terminals open.</p>
            <button type="button" className="ui-btn-primary" onClick={addTab}>
              <Plus className="h-4 w-4" /> New terminal
            </button>
          </div>
        ) : (
          tabs.map((t) => {
            const { leaves, splits } = computeLayout(t.root);
            const multi = leaves.length > 1;
            return (
              <div
                key={t.id}
                ref={(el) => { areaRefs.current[t.id] = el; }}
                className={cn("ui-term-canvas", t.id !== activeTabId && "hidden")}
              >
                {leaves.map((lf, i) => (
                  <div
                    key={lf.id}
                    className="ui-term-slot"
                    style={{ left: `${lf.rect.x}%`, top: `${lf.rect.y}%`, width: `${lf.rect.w}%`, height: `${lf.rect.h}%` }}
                  >
                    <TerminalLeaf
                      paneId={lf.id}
                      label={multi ? `bash ${i + 1}` : "bash"}
                      active={t.activeLeafId === lf.id}
                      canClose={multi}
                      onFocus={() => focusLeaf(t.id, lf.id)}
                      onSplit={(dir) => splitPane(t.id, lf.id, dir)}
                      onClose={() => closePane(t.id, lf.id)}
                    />
                  </div>
                ))}
                {splits.map((s) => (
                  <div
                    key={s.id}
                    onMouseDown={(e) => startDrag(t.id, s, e)}
                    className={cn("ui-term-divider", s.dir === "row" ? "ui-term-divider-v" : "ui-term-divider-h")}
                    style={
                      s.dir === "row"
                        ? { left: `${s.rect.x + s.rect.w * s.ratio}%`, top: `${s.rect.y}%`, height: `${s.rect.h}%` }
                        : { top: `${s.rect.y + s.rect.h * s.ratio}%`, left: `${s.rect.x}%`, width: `${s.rect.w}%` }
                    }
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
