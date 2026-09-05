"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { PALETTE } from "@/lib/palette";

// Normalises any colour the browser understands down to #rrggbb.
//
// getComputedStyle returns a colour in the space it was AUTHORED in, so a token
// written with oklch()/lab() reads back as e.g. "lab(95.36 0 0)" — valid CSS
// Color 4 that Mermaid's colour parser rejects outright. It threw inside
// initialize(), which runs BEFORE render(), so render()'s .catch() never fired
// and every diagram on the site rendered as an empty box. Canvas is the cheapest
// converter the platform offers: assigning fillStyle round-trips through the
// browser's own parser and reads back as hex.
function toSrgbHex(value: string, fallback: string): string {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallback;
    // Sentinel: an unparseable assignment leaves fillStyle untouched, which is
    // the only way to tell "the browser rejected it" from "it is that colour".
    ctx.fillStyle = "#010203";
    ctx.fillStyle = value;
    const out = ctx.fillStyle;
    return typeof out === "string" && out !== "#010203" ? out : fallback;
  } catch {
    return fallback;
  }
}

// Resolves a CSS custom property to a concrete colour by temporarily applying it
// to a hidden element and reading the browser-computed value, then normalising
// it. This keeps Mermaid colours in sync with the design token SSOT
// (globals.css) without hardcoding hex values that would drift from the theme.
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
  if (!value || value === "rgba(0, 0, 0, 0)") return fallback;
  return toSrgbHex(value, fallback);
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
      const base = {
        startOnLoad: false,
        theme: dark ? ("dark" as const) : ("default" as const),
        fontFamily: "inherit",
      };
      try {
        m.default.initialize({
          ...base,
          themeVariables: {
            background: "transparent",
            primaryColor: resolveColorVar("--surface-raised", fallback.surfaceRaised),
            primaryTextColor: resolveColorVar("--text-primary", fallback.textPrimary),
            lineColor: resolveColorVar("--text-tertiary", fallback.textTertiary),
            edgeLabelBackground: resolveColorVar("--surface-base", fallback.surfaceBase),
            clusterBkg: resolveColorVar("--surface-raised", fallback.surfaceRaised),
          },
        });
      } catch {
        // A theme value Mermaid cannot parse must cost the reader the THEME, not
        // the diagram. initialize() runs outside render()'s promise chain, so an
        // uncaught throw here silently skipped rendering altogether.
        m.default.initialize(base);
      }
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
