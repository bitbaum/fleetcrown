"use client";

import { useEffect, useId, useRef } from "react";
import { PALETTE } from "@/lib/palette";

// Resolves a CSS custom property to a concrete rgb() value by temporarily
// applying it to a hidden element and reading the browser-computed color.
// This keeps Mermaid colours in sync with the design token SSOT (globals.css)
// without hardcoding hex values that would drift from the theme.
function resolveColorVar(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.backgroundColor = `var(${cssVar})`;
  document.documentElement.appendChild(el);
  const value = getComputedStyle(el).backgroundColor;
  el.remove();
  // If the browser couldn't resolve it (returns "" or "transparent"), use fallback.
  return value && value !== "rgba(0, 0, 0, 0)" ? value : fallback;
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((m) => {
      if (cancelled) return;
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          background:          "transparent",
          primaryColor:        resolveColorVar("--surface-raised",  PALETTE.darkFallback.surfaceRaised),
          primaryTextColor:    resolveColorVar("--text-primary",    PALETTE.darkFallback.textPrimary),
          lineColor:           resolveColorVar("--text-tertiary",   PALETTE.darkFallback.textTertiary),
          edgeLabelBackground: resolveColorVar("--surface-base",    PALETTE.darkFallback.surfaceBase),
          clusterBkg:          resolveColorVar("--surface-raised",  PALETTE.darkFallback.surfaceRaised),
        },
        fontFamily: "inherit",
      });
      m.default
        .render(`mermaid-${id}`, chart)
        .then(({ svg }) => {
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => {
          if (!cancelled && ref.current) {
            ref.current.textContent = chart;
            ref.current.className = "font-mono text-xs text-text-tertiary whitespace-pre overflow-x-auto";
          }
        });
    });
    return () => { cancelled = true; };
  }, [id, chart]);

  return (
    <div
      ref={ref}
      className="flex justify-center overflow-x-auto rounded-xl bg-surface-raised p-4"
    />
  );
}
