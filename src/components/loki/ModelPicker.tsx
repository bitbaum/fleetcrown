"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import { getJson } from "@/lib/api/fetch";
import type { LokiModelOption, LokiModelsResponse } from "@/lib/loki/models";

/**
 * Which model starts the turn.
 *
 * ── Why "starting point" and not "model" ─────────────────────────────────────
 * Loki runs on a CHAIN, not a model: it walks across vendors when one rots,
 * rate-limits, or runs out of its daily free budget. A picker that pinned one
 * model would hand the operator back the single point of failure the chain
 * exists to remove — on the free tier, a pin is a scheduled outage. So a choice
 * here says where the chain STARTS and the fallback below it survives, which is
 * exactly what `chainFrom()` already means. The footnote in the menu says so,
 * because a control that silently does something other than its label is worse
 * than no control.
 *
 * ── Locked rows ──────────────────────────────────────────────────────────────
 * A vendor with no key on the server is listed, disabled, with the reason.
 * Hiding it answers "why can't I pick X" with silence; enabling it answers with
 * a failed turn.
 */
export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  /** undefined = Auto (walk the whole chain). */
  value: string | undefined;
  onChange: (model: string | undefined) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LokiModelsResponse | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fetched on first open, not on mount: most turns never touch this control,
  // and the composer should not cost a request to render.
  useEffect(() => {
    if (!open || data) return;
    let live = true;
    getJson<LokiModelsResponse>("/api/loki/models")
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        if (live) setData({ options: [], autoStartsAt: null });
      });
    return () => {
      live = false;
    };
  }, [open, data]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byProvider = new Map<string, LokiModelOption[]>();
  for (const option of data?.options ?? []) {
    byProvider.set(option.provider, [...(byProvider.get(option.provider) ?? []), option]);
  }

  const pick = (model: string | undefined) => {
    onChange(model);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="ui-loki-model-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? `Starts at ${value}` : "Auto — best available model"}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{value ?? "Auto"}</span>
        <ChevronDown
          className={open ? "ui-loki-model-caret ui-loki-model-caret-open" : "ui-loki-model-caret"}
          aria-hidden
        />
      </button>

      {open && (
        <div className="ui-loki-model-menu" role="listbox">
          <button
            type="button"
            className="ui-loki-model-row"
            onClick={() => pick(undefined)}
            role="option"
            aria-selected={value === undefined}
          >
            <span className="ui-loki-model-row-text">
              <span className="ui-loki-model-row-title">Auto</span>
              <span className="ui-loki-model-row-sub">
                {data?.autoStartsAt
                  ? `Best available — starts at ${data.autoStartsAt}`
                  : "Best available model"}
              </span>
            </span>
            {value === undefined && <Check className="ui-loki-model-check" aria-hidden />}
          </button>

          {data === null && <p className="ui-loki-model-note">Loading models…</p>}

          {[...byProvider.entries()].map(([provider, options]) => (
            <div key={provider}>
              <div className="ui-loki-model-group">{provider}</div>
              {options.map((option) =>
                option.usable ? (
                  <button
                    key={`${provider}/${option.id}`}
                    type="button"
                    className="ui-loki-model-row"
                    onClick={() => pick(option.id)}
                    role="option"
                    aria-selected={value === option.id}
                  >
                    <span className="ui-loki-model-row-text">
                      <span className="ui-loki-model-row-title">{option.label}</span>
                    </span>
                    {value === option.id && <Check className="ui-loki-model-check" aria-hidden />}
                  </button>
                ) : (
                  <div
                    key={`${provider}/${option.id}`}
                    className="ui-loki-model-row ui-loki-model-row-locked"
                    title={option.reason}
                  >
                    <span className="ui-loki-model-row-text">
                      <span className="ui-loki-model-row-title">{option.label}</span>
                      <span className="ui-loki-model-row-sub">{option.reason}</span>
                    </span>
                    <Lock className="ui-loki-model-check" aria-hidden />
                  </div>
                ),
              )}
            </div>
          ))}

          {data !== null && (
            <p className="ui-loki-model-note">
              A choice sets where the chain <em>starts</em>. If that model is busy or out of budget,
              Loki still falls through to the next one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
