"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
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

function resolvedThemeIsDark(theme: string | undefined, systemDark: boolean): boolean {
  if (theme === "light") return false;
  if (theme === "dark") return true;
  return systemDark;
}

// The OS color-scheme preference is an external store: subscribe via
// useSyncExternalStore instead of mirroring matchMedia into useState from an
// effect. The server snapshot keeps the pre-hydration default (dark).
function subscribeSystemDark(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getSystemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const getServerSystemDark = () => true;

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme, theme } = useTheme();
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerSystemDark);

  const dark = resolvedThemeIsDark(resolvedTheme ?? theme, systemDark);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((m) => {
      if (cancelled) return;
      const fallback = dark ? PALETTE.darkFallback : PALETTE.lightFallback;
      m.default.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        themeVariables: {
          background: "transparent",
          primaryColor: resolveColorVar("--surface-raised", fallback.surfaceRaised),
          primaryTextColor: resolveColorVar("--text-primary", fallback.textPrimary),
          lineColor: resolveColorVar("--text-tertiary", fallback.textTertiary),
          edgeLabelBackground: resolveColorVar("--surface-base", fallback.surfaceBase),
          clusterBkg: resolveColorVar("--surface-raised", fallback.surfaceRaised),
        },
        fontFamily: "inherit",
      });
      m.default
        .render(`mermaid-${id}-${dark ? "d" : "l"}`, chart)
        .then(({ svg }) => {
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => {
          if (!cancelled && ref.current) {
            ref.current.textContent = chart;
            ref.current.className =
              "font-mono text-xs text-text-tertiary whitespace-pre overflow-x-auto";
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [id, chart, dark]);

  return (
    <div
      ref={ref}
      className="flex justify-center overflow-x-auto rounded-xl bg-surface-raised p-4"
    />
  );
}
