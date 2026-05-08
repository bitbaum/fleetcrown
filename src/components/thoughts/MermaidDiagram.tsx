"use client";

import { useEffect, useId, useRef } from "react";

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
          background: "transparent",
          primaryColor: "#1e293b",
          primaryTextColor: "#e2e8f0",
          lineColor: "#64748b",
          edgeLabelBackground: "#0f172a",
          clusterBkg: "#1e293b",
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
