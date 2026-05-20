#!/usr/bin/env -S npx tsx
/**
 * Brain — local Node HTTP server.
 *
 * Boots, tails ~/.<APP_SLUG>/events.jsonl, projects events into in-memory
 * state, serves a minimal /control view and a /api/state JSON endpoint.
 *
 * No external deps beyond what the existing repo already brings in (node:*
 * for the server, zod via src/lib/events for parsing). M2 deliberately keeps
 * the surface tiny: this is the smallest possible thing that proves the
 * event-log → state projection → UI loop works.
 *
 * Run:    npx tsx home/server.ts
 * Test:   echo '<event-json>' >> ~/.<APP_SLUG>/events.jsonl
 *         curl http://localhost:3001/api/state
 *
 * Brain growth: M3 wires a Bridge that pulls events from the OS / hooks.
 *               M5 adds the decide() function. M6 wires dispatch back to
 *               workers. This file stays small.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { APP_NAME, APP_SLUG } from "@/config/brand";
import type { Autonomy } from "@/lib/events";
import { tailLog } from "./log";
import { applyEvent, type GlobalState, type ProjectState } from "./state";
import { decide, type Decision } from "./decide";
import { appendEvent } from "./emit";
import { renderPromptForDispatch } from "./render";
import { resolveProjectPath } from "./projects";
import { ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";

const LOG_PATH = path.join(os.homedir(), `.${APP_SLUG}`, "events.jsonl");
const PORT = parseInt(process.env.APP_HOME_PORT ?? process.env.COCKPIT_HOME_PORT ?? "3001", 10);

let state: GlobalState = new Map();
let lastError: { ts: string; message: string; raw?: string } | null = null;

const handle = tailLog(
  LOG_PATH,
  (event) => { state = applyEvent(state, event); },
  (err, raw) => {
    lastError = { ts: new Date().toISOString(), message: err.message, raw };
    // Don't spam — only echo parse errors to stderr if they look unexpected.
    if (!err.message.startsWith("parse: schema:")) console.error("[home]", err.message);
  },
);

// ── HTML page (vanilla JS, polls /api/state every 2s) ────────────────────────

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${APP_NAME} · home</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: #0a0a0a; color: #e5e5e5; padding: 2rem; margin: 0; line-height: 1.5; }
  header { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #a3a3a3; margin: 0; }
  .meta { font-size: 12px; color: #525252; }
  .empty { color: #525252; font-style: italic; padding: 2rem 0; }
  .project { border-left: 2px solid #404040; padding: 0.5rem 1rem; margin-bottom: 0.75rem; transition: border-color .15s; }
  .project.running { border-left-color: #4ade80; }
  .project h2 { font-size: 14px; font-weight: 500; margin: 0 0 0.5rem; color: #fafafa; display: flex; align-items: center; gap: 0.5rem; }
  .running-pill { font-size: 11px; padding: 0.1rem 0.4rem; border-radius: 4px; background: #16a34a33; color: #4ade80; font-weight: 500; }
  .outcomes { display: inline-flex; gap: 0.25rem; }
  .o { font-size: 13px; padding: 0 0.4rem; border-radius: 4px; font-weight: 600; line-height: 1.4; }
  .o.success { background: #16a34a33; color: #4ade80; }
  .o.partial { background: #eab30833; color: #fbbf24; }
  .o.error, .o.hang, .o.timeout { background: #dc262633; color: #f87171; }
  .o.user_abort { background: #eab30833; color: #fbbf24; }
  .handoff { color: #a3a3a3; font-size: 12px; margin-top: 0.5rem; word-break: break-word; }
  .ts { color: #525252; font-size: 11px; margin-left: auto; }
  pre { color: #525252; font-size: 11px; background: #050505; padding: 1rem; border-radius: 4px; margin-top: 2rem; overflow-x: auto; }
  .err { color: #f87171; font-size: 12px; margin-top: 1rem; padding: 0.5rem 1rem; border-left: 2px solid #dc2626; background: #dc262611; }
</style>
</head>
<body>
<header>
  <h1>${APP_NAME} · home</h1>
  <span class="meta">tailing ~/.${APP_SLUG}/events.jsonl</span>
  <span class="meta" id="meta"></span>
</header>
<div id="projects"></div>
<div id="err"></div>
<pre id="raw"></pre>
<script>
const GLYPH = { success: '✓', partial: '~', error: '✗', hang: '✗', timeout: '✗', user_abort: '✕' };
function compact(iso) { try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } }
async function refresh() {
  try {
    const r = await fetch('/api/state');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    document.getElementById('meta').textContent = j.projects.length + ' project' + (j.projects.length === 1 ? '' : 's');
    const root = document.getElementById('projects');
    if (j.projects.length === 0) {
      root.innerHTML = '<div class="empty">no events yet — append one to ~/.${APP_SLUG}/events.jsonl</div>';
    } else {
      root.innerHTML = j.projects.map(p => \`
        <div class="project\${p.currentRun ? ' running' : ''}">
          <h2>
            \${p.project}
            \${p.currentRun ? '<span class="running-pill">' + p.currentRun.intent + '</span>' : ''}
            <span class="ts">\${compact(p.lastEventTs)}</span>
          </h2>
          \${(p.recentOutcomes ?? []).length > 0 ? '<div class="outcomes">' + p.recentOutcomes.map(o => '<span class="o ' + o + '">' + (GLYPH[o] ?? '?') + '</span>').join('') + '</div>' : ''}
          \${p.lastHandoff && p.lastHandoff.done ? '<div class="handoff">' + p.lastHandoff.done + '</div>' : ''}
        </div>
      \`).join('');
    }
    document.getElementById('err').innerHTML = j.lastError
      ? '<div class="err">last parse error @ ' + compact(j.lastError.ts) + ': ' + j.lastError.message + '</div>'
      : '';
    document.getElementById('raw').textContent = JSON.stringify(j, null, 2);
  } catch (e) {
    // Server probably restarted — silent
  }
}
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;

// ── HTTP handlers ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/" || url === "/control") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(INDEX_HTML);
    return;
  }

  if (url === "/api/state") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      projects: Array.from(state.values()),
      logPath: LOG_PATH,
      position: handle.position(),
      lastError,
    }));
    return;
  }

  if (url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, projectCount: state.size, logPath: LOG_PATH }));
    return;
  }

  // Convenience: POST a JSONL event body to append to the log. Used for manual
  // testing during M2; the real producer is the worker hook layer in M4.
  if (url === "/api/events" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      try {
        const line = body.trim();
        if (!line) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "empty body" }));
          return;
        }
        fs.appendFileSync(LOG_PATH, line + "\n");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // M6 — dispatch. Run decide() against the current state for a project and
  // either emit a bridge.dispatch event (when autonomy + confidence say "go")
  // or return the proposed action for a confirm-mode UI to render.
  //
  // Body: { project: string, queueHead?: string, autonomy?: Autonomy, projectPath?: string }
  // Response on auto-execute: { dispatched: true,  decision, runId }
  // Response on hold:         { dispatched: false, decision }
  if (url === "/api/dispatch" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      try {
        const parsed = body.trim() ? JSON.parse(body) : {};
        const projectName: string | undefined = parsed.project;
        if (typeof projectName !== "string" || !projectName) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "missing 'project' string in body" }));
          return;
        }
        const projectState = state.get(projectName);
        if (!projectState) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `unknown project: ${projectName}` }));
          return;
        }
        const decision = decide({
          project: projectState,
          queueHead: typeof parsed.queueHead === "string" ? parsed.queueHead : undefined,
          autonomy: parsed.autonomy as Autonomy | undefined,
        });

        // Wait actions never dispatch; same for any action where the autonomy
        // gate said hold. Return the proposal so a confirm-mode UI can render
        // the countdown + auto-fire button.
        if (decision.action.kind === "wait" || !decision.autoExecute) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ dispatched: false, decision }));
          return;
        }

        // Auto-execute: emit a bridge.dispatch event with a fresh run id.
        const runId = randomUUID();
        // Resolve the project's filesystem path so the rendered prompt reads
        // "Work on the project at /home/g/dev/<x>" instead of the project
        // name as fallback. Caller-supplied wins; otherwise look up the
        // existing ~/.config/agent-projects.conf SSOT.
        const projectPath =
          (typeof parsed.projectPath === "string" && parsed.projectPath) ||
          resolveProjectPath(projectName);
        const prompt = buildPromptForDispatch(decision, projectState, projectPath);
        const intent = decision.action.intent;
        appendEvent({
          kind: "bridge.dispatch",
          project: projectName,
          intent,
          prompt,
          runId,
          autonomy: (parsed.autonomy as Autonomy | undefined) ?? "confirm",
          reason: decision.action.reason,
          confidence: decision.confidence,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ dispatched: true, decision, runId }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain");
  res.end("Not Found");
});

/**
 * Build the dispatch prompt for a decision.
 *
 * M7: replaces the M6 stub. Reuses the existing src/lib/orchestration
 * renderer via home/render.ts (single SSOT for prompt text). If the
 * decision carries an explicit prompt string (queue-drain case), that's
 * passed through as a 'custom' intent so the queue item itself becomes
 * the prompt body — same behavior as today's queue→intent="custom" flip.
 */
function buildPromptForDispatch(
  decision: Decision,
  project: ProjectState,
  projectPath?: string,
): string {
  if (decision.action.kind === "wait") {
    // Caller is supposed to short-circuit on wait — never dispatch one.
    throw new Error("buildPromptForDispatch called on a wait decision");
  }
  const intentRaw = decision.action.intent;
  // Decision.action.intent is a free-form string in the home types; gate
  // it against the canonical id set before handing to the renderer.
  const intent =
    (ORCHESTRATION_TASK_INTENT_IDS as readonly string[]).includes(intentRaw)
      ? (intentRaw as OrchestrationTaskIntentId)
      : "next_best";
  // Queue-drain case: the queue item IS the prompt. Pass it through as
  // intent="custom" so renderTaskForAdapter echoes it verbatim.
  if (decision.action.kind === "dispatch" && decision.action.prompt) {
    return renderPromptForDispatch({
      project: project.project,
      projectPath,
      intent: "custom",
      customInstructions: decision.action.prompt,
    });
  }
  return renderPromptForDispatch({
    project: project.project,
    projectPath,
    intent,
  });
}

server.listen(PORT, () => {
  console.log(`[home] ${APP_NAME} brain listening on http://localhost:${PORT}`);
  console.log(`[home] tailing ${LOG_PATH}`);
});

const shutdown = (signal: string) => {
  console.log(`[home] ${signal} — shutting down`);
  handle.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
