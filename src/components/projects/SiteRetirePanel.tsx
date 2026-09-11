"use client";

/**
 * Taking the SITE down — separate from deleting the project, because they are
 * different questions and conflating them is what left live websites behind.
 *
 * "Delete project" removes FleetCrown's rows and, if asked, the repository. It
 * has never touched the box. So a project that had been kicked off kept its
 * website: a Caddy vhost, a certificate, an enabled service, /opt, a port and a
 * monitoring target that still pages. This panel is the off switch, and it
 * shows the plan before it does anything.
 */
import { useState } from "react";
import { EyeOff, Loader2, Lock, RotateCcw, Trash2 } from "lucide-react";
import { postJson, throwApiError } from "@/lib/api/fetch";

type Mode = "offline" | "private" | "restore" | "delete";

const MODES: { id: Mode; label: string; detail: string; danger?: boolean }[] = [
  {
    id: "offline",
    label: "Take it off the internet",
    detail:
      "The site stops being served immediately. The code, the server files and the port are all kept — put it back whenever you like.",
  },
  {
    id: "private",
    label: "Password-protect it",
    detail:
      "It keeps working, but asks for a password first, and the repository is made private. For showing work in progress.",
  },
  {
    id: "restore",
    label: "Put it back",
    detail: "Undo the two above: the site is served publicly again.",
  },
  {
    id: "delete",
    label: "Remove it from the server",
    detail:
      "The service, the web address, the server files and the port are all removed, and the port becomes reusable. The repository is archived, not deleted, unless you say otherwise.",
    danger: true,
  },
];

export function SiteRetirePanel({ projectId, liveUrl }: { projectId: string; liveUrl: string }) {
  const [mode, setMode] = useState<Mode>("offline");
  const [plan, setPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = MODES.find((m) => m.id === mode)!;

  async function send(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson(`/api/projects/${projectId}/retire`, { mode, confirm });
      if (!res.ok) await throwApiError(res, "Could not reach the site");
      const body = (await res.json()) as { commandId: string; plan?: string | null };
      // The box runs this; the plan and the result both come back as the
      // command's output, which Activity shows. Queueing is the honest report
      // here — claiming "done" before the runner has run is the lie this whole
      // session has been removing.
      if (confirm) {
        setDone(`Running. Watch it finish in Activity (command ${body.commandId.slice(0, 8)}).`);
        setPlan(null);
      } else {
        setPlan(
          body.plan ??
            `The runner has not picked this up yet (command ${body.commandId.slice(0, 8)}). Its answer appears in Activity.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the site");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-border-subtle pt-5">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          The live site
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          <span className="font-mono">{liveUrl.replace(/^https?:\/\//, "")}</span> is public right
          now. Deleting the project does not change that — this does.
        </p>
      </div>

      <div className="space-y-2 text-xs text-text-secondary">
        {MODES.map((m) => (
          <label key={m.id} className="flex min-h-11 items-start gap-2">
            <input
              className="mt-0.5 h-5 w-5 shrink-0"
              type="radio"
              name="site-retire-mode"
              checked={mode === m.id}
              onChange={() => {
                setMode(m.id);
                setPlan(null);
                setDone(null);
              }}
            />
            <span className="min-w-0">
              <span
                className={
                  m.danger ? "font-medium text-status-negative" : "font-medium text-text-primary"
                }
              >
                {m.label}
              </span>
              <span className="block text-text-tertiary">{m.detail}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send(false)}
          disabled={busy}
          className="ui-btn-secondary min-h-11 gap-1.5"
        >
          {busy ? <Loader2 className="ui-spinner-xs" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Show me what this does
        </button>
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={busy}
          className={
            chosen.danger ? "ui-btn-danger min-h-11 gap-1.5" : "ui-btn-primary min-h-11 gap-1.5"
          }
        >
          {chosen.danger ? (
            <Trash2 className="h-3.5 w-3.5" />
          ) : mode === "private" ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {chosen.label}
        </button>
      </div>

      {plan && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-raised p-3 text-micro text-text-secondary">
          {plan}
        </pre>
      )}
      {done && <p className="text-xs text-status-positive">{done}</p>}
      {error && <p className="ui-error-xs">{error}</p>}
    </section>
  );
}
