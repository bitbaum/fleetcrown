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
import type { Autonomy, Adapter } from "@/lib/events";
import { ADAPTERS, parseEvent } from "@/lib/events";
import { tailLog } from "./log";
import { applyEvent, type GlobalState, type ProjectState } from "./state";
import { decide, type Decision } from "./decide";
import { appendEvent } from "./emit";
import { renderPromptForDispatch } from "./render";
import { resolveProjectPath, resolveProjectAdapter, loadProjects } from "./projects";
import { ORCHESTRATION_TASK_INTENT_IDS, type OrchestrationTaskIntentId } from "@/lib/orchestration";

// Boot-mode gate. Naked `npx tsx home/server.ts` (no flags) should NOT spin
// up the HTTP server + fs.watch — otherwise a one-shot test invocation
// (e.g. inside a `tail -3` pipe) leaves an orphan server eating port 3001
// + watching the event log forever. Require an explicit --start.
if (!process.argv.includes("--start")) {
  console.log(`${APP_NAME} brain — local HTTP server (Brain layer of the home/ stack).
Usage:  npx tsx home/server.ts --start
Env:    APP_HOME_PORT  port to bind (default 3001)`);
  process.exit(0);
}

const LOG_PATH = path.join(os.homedir(), `.${APP_SLUG}`, "events.jsonl");
const PORT = parseInt(process.env.APP_HOME_PORT ?? process.env.COCKPIT_HOME_PORT ?? "3001", 10);

let state: GlobalState = new Map();
let lastError: { ts: string; message: string; raw?: string } | null = null;

/**
 * Union live event-projected state with registered-but-eventless projects
 * from agent-projects.conf so the UI can show every project the user has
 * registered, even ones that have never emitted an event yet (fresh boot,
 * new project just added, etc.). Live state always wins on name collision.
 *
 * Lowercase-keyed dedup matches the registry's case-insensitive lookup.
 */
function assembleProjectList(): ProjectState[] {
  const live = Array.from(state.values());
  const liveLower = new Set(live.map((p) => p.project.toLowerCase()));
  const idleRegistered: ProjectState[] = [];
  for (const cfg of loadProjects().values()) {
    if (liveLower.has(cfg.name.toLowerCase())) continue;
    idleRegistered.push({
      project: cfg.name,
      lastEventTs: "",            // empty signals "never seen an event" to the UI
      recentOutcomes: [],
    });
  }
  return [...live, ...idleRegistered];
}

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
//
// Editing trap: the entire HTML+JS body lives inside the backtick template
// literal below. Two characters need careful handling when adding content
// here that don't matter in a normal .ts file:
//   • Backticks (`) close the literal — escape as \` or avoid in comments
//     and strings. A stray ` mid-comment produces opaque TS1005 errors
//     pointing at the surrounding line, not the backtick itself.
//   • ${expr} interpolates at server-render time. Use \${ in any JS that
//     should evaluate in the browser (we already do this for refresh's
//     template strings — see the renderProposal returns).
//
// If a tsc syntax error points at a line that "looks fine," grep for an
// unescaped backtick or ${ in the surrounding template body.

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
  .status-pill { font-size: 11px; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 500; }
  .status-pill.ready   { background: #16a34a33; color: #4ade80; }
  .status-pill.working { background: #eab30833; color: #fbbf24; }
  .queue-pill  { font-size: 11px; padding: 0.1rem 0.4rem; border-radius: 4px; background: #3b82f633; color: #93c5fd; font-weight: 500; }
  .outcomes { display: inline-flex; gap: 0.25rem; }
  .o { font-size: 13px; padding: 0 0.4rem; border-radius: 4px; font-weight: 600; line-height: 1.4; }
  .o.success { background: #16a34a33; color: #4ade80; }
  .o.partial { background: #eab30833; color: #fbbf24; }
  .o.error, .o.hang, .o.timeout { background: #dc262633; color: #f87171; }
  .o.user_abort { background: #eab30833; color: #fbbf24; }
  .handoff { color: #a3a3a3; font-size: 12px; margin-top: 0.5rem; word-break: break-word; }
  .reason { color: #d4d4d8; font-size: 12px; margin: 0.4rem 0 0.5rem; word-break: break-word; line-height: 1.5; }
  .conf { color: #71717a; font-size: 11px; }
  .proj-err { color: #f87171; font-size: 12px; margin-top: 0.5rem; padding: 0.3rem 0.6rem; border-left: 2px solid #dc2626; background: #dc262611; word-break: break-word; line-height: 1.5; }
  .ts { color: #525252; font-size: 11px; margin-left: auto; }
  .actions { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
  .actions button { font: inherit; font-size: 11px; padding: 0.25rem 0.6rem; border: 1px solid #404040; background: #1a1a1a; color: #d4d4d8; border-radius: 4px; cursor: pointer; transition: background .12s, border-color .12s; }
  .actions button:hover:not(:disabled) { background: #262626; border-color: #525252; }
  .actions button:disabled { opacity: 0.4; cursor: not-allowed; }
  .actions button.primary { border-color: #16a34a55; color: #4ade80; }
  .actions button.primary:hover:not(:disabled) { background: #16a34a22; }
  .actions button.danger { border-color: #dc262655; color: #f87171; }
  .actions button.danger:hover:not(:disabled) { background: #dc262622; }
  .proposal { font-size: 11px; color: #a3a3a3; margin-top: 0.5rem; padding: 0.4rem 0.6rem; border-left: 2px solid #525252; background: #0f0f0f; line-height: 1.5; word-break: break-word; }
  .proposal .label { color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; margin-right: 0.4rem; }
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
function compact(iso) {
  if (!iso) return 'idle';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? 'idle' : d.toLocaleTimeString();
  } catch { return 'idle'; }
}
// Per-project transient UI: last /api/dispatch response shown until the next
// refresh succeeds or a new run starts. Keyed by project name.
const proposals = new Map();
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// If a dispatched chip has been showing this long without the brain seeing
// a corresponding currentRun (worker.started never arrived), the worker
// almost certainly isn't running. Stop showing the optimistic "dispatched"
// and surface a diagnostic instead.
const DISPATCH_ACK_TIMEOUT_MS = 10000;
function renderProposal(p) {
  const prop = proposals.get(p.project);
  if (!prop) return '';
  if (prop.dispatched) {
    const age = Date.now() - (prop.postedAt ?? Date.now());
    if (age > DISPATCH_ACK_TIMEOUT_MS) {
      return '<div class="proposal" style="border-left-color:#dc2626;color:#f87171"><span class="label">unacked</span>' +
        'dispatched ' + Math.round(age / 1000) + 's ago but worker.started never arrived · runId ' +
        escapeHtml(prop.runId.slice(0, 8)) + ' · is the worker running?</div>';
    }
    return '<div class="proposal"><span class="label">dispatched</span>' +
      escapeHtml(prop.decision.action.intent) + ' · runId ' + escapeHtml(prop.runId.slice(0, 8)) + '</div>';
  }
  const a = prop.decision.action;
  const reason = a.reason ?? '';
  // Cancel and error chips carry their full message in the reason field —
  // don't tack on the meaningless 0% confidence pill or the "proposed"
  // prefix (Cancel isn't a proposal, Error wasn't a brain decision). Only
  // real decide()-produced proposals (wait/dispatch/recovery) get the
  // confidence footer.
  if (a.kind === 'cancelled') {
    return '<div class="proposal"><span class="label">cancelled</span>' +
      (reason ? escapeHtml(reason) : 'Ctrl+C sent') + '</div>';
  }
  if (a.kind === 'error') {
    return '<div class="proposal" style="border-left-color:#dc2626;color:#f87171"><span class="label">error</span>' +
      escapeHtml(reason || 'unknown') + '</div>';
  }
  return '<div class="proposal"><span class="label">proposed</span>' +
    escapeHtml(a.kind) + (a.intent ? ' · ' + escapeHtml(a.intent) : '') +
    (reason ? ' — ' + escapeHtml(reason) : '') +
    ' <span class="conf">· ' + Math.round(prop.decision.confidence * 100) + '% confidence</span></div>';
}
async function dispatch(project, autonomy, btn) {
  const buttons = btn.parentElement.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try {
    const r = await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, autonomy }),
    });
    const j = await r.json();
    if (!r.ok) {
      proposals.set(project, { dispatched: false, decision: { action: { kind: 'error', intent: '', reason: j.error || ('HTTP ' + r.status) }, confidence: 0 } });
    } else {
      proposals.set(project, { ...j, postedAt: Date.now() });
    }
  } catch (e) {
    proposals.set(project, { dispatched: false, decision: { action: { kind: 'error', intent: '', reason: String(e) }, confidence: 0 } });
  } finally {
    buttons.forEach(b => b.disabled = false);
    refresh();
  }
}
async function cancelRun(project, btn) {
  const buttons = btn.parentElement.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try {
    const r = await fetch('/api/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, reason: 'cancelled from /control' }),
    });
    const j = await r.json();
    if (!r.ok) {
      proposals.set(project, { dispatched: false, decision: { action: { kind: 'error', intent: '', reason: j.error || ('HTTP ' + r.status) }, confidence: 0 } });
    } else {
      proposals.set(project, { dispatched: false, decision: { action: { kind: 'cancelled', intent: '', reason: 'Ctrl+C sent · runId ' + (j.runId || '').slice(0, 8) }, confidence: 0 } });
    }
  } catch (e) {
    proposals.set(project, { dispatched: false, decision: { action: { kind: 'error', intent: '', reason: String(e) }, confidence: 0 } });
  } finally {
    buttons.forEach(b => b.disabled = false);
    refresh();
  }
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'dispatch') {
    dispatch(btn.dataset.project, btn.dataset.autonomy, btn);
  } else if (btn.dataset.action === 'cancel') {
    cancelRun(btn.dataset.project, btn);
  }
});
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
      // Clear stale proposals once the project actually starts a run.
      for (const p of j.projects) {
        if (p.currentRun && proposals.has(p.project)) proposals.delete(p.project);
      }
      root.innerHTML = j.projects.map(p => {
        const cr = p.currentRun;
        const confPct = cr && typeof cr.confidence === 'number' ? Math.round(cr.confidence * 100) + '%' : null;
        const reasonLine = cr && cr.reason
          ? '<div class="reason">' + escapeHtml(cr.reason) + (confPct ? ' <span class="conf">· ' + confPct + ' confidence</span>' : '') + '</div>'
          : '';
        const errorLine = p.lastError
          ? '<div class="proj-err">last error @ ' + compact(p.lastError.ts) + ': ' + escapeHtml(p.lastError.message) + '</div>'
          : '';
        const projAttr = escapeHtml(p.project);
        const actions = cr
          ? '<div class="actions">' +
              '<button class="danger" data-action="cancel" data-project="' + projAttr + '">Cancel</button>' +
            '</div>'
          : '<div class="actions">' +
              '<button data-action="dispatch" data-project="' + projAttr + '" data-autonomy="confirm">Propose</button>' +
              '<button class="primary" data-action="dispatch" data-project="' + projAttr + '" data-autonomy="manual">Dispatch</button>' +
            '</div>';
        return \`
        <div class="project\${cr ? ' running' : ''}">
          <h2>
            \${escapeHtml(p.project)}
            \${cr ? '<span class="running-pill">' + escapeHtml(cr.intent) + (cr.adapter && cr.adapter !== 'claude' ? ' · ' + escapeHtml(cr.adapter) : '') + '</span>' : (() => {
              const st = (p.lastHandoff && p.lastHandoff.status || '').toLowerCase();
              if (st === 'ready')   return '<span class="status-pill ready">ready</span>';
              if (st === 'working') return '<span class="status-pill working">working</span>';
              return '';
            })()}
            \${p.queueLen > 0 ? '<span class="queue-pill">' + p.queueLen + ' queued</span>' : ''}
            <span class="ts">\${compact(p.lastEventTs)}</span>
          </h2>
          \${reasonLine}
          \${(p.recentOutcomes ?? []).length > 0 ? '<div class="outcomes">' + p.recentOutcomes.map(o => '<span class="o ' + o + '">' + (GLYPH[o] ?? '?') + '</span>').join('') + '</div>' : ''}
          \${errorLine}
          \${p.lastHandoff && p.lastHandoff.done ? '<div class="handoff">' + escapeHtml(p.lastHandoff.done) + '</div>' : ''}
          \${renderProposal(p)}
          \${actions}
        </div>
        \`;
      }).join('');
    }
    document.getElementById('err').innerHTML = j.lastError
      ? '<div class="err">last parse error @ ' + compact(j.lastError.ts) + ': ' + escapeHtml(j.lastError.message) + '</div>'
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
    // Annotate each project with the local /tmp/agent-queue-<tab> length so
    // the /control UI can surface a "Nqueued" badge. The file mirror is
    // hydrated by the Cockpit API/daemon bridge from DB authority.
    // Reading the file lets home/ show queue depth without taking
    // a DB dep — keeping home/ local-first.
    const projects = assembleProjectList().map((p) => {
      let queueLen = 0;
      try {
        const raw = fs.readFileSync(path.join("/tmp", `agent-queue-${p.project.toLowerCase()}`), "utf8");
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) queueLen = arr.length;
      } catch { /* file missing or unreadable → no badge */ }
      return { ...p, queueLen };
    });
    res.end(JSON.stringify({
      projects,
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
  // testing; the real producers are home/watcher.ts, home/worker.ts, and the
  // emit_worker_finished function in scripts/agent-hook-bridge.sh.
  //
  // Validated against the v=1 schema before append — otherwise a typo or
  // half-built event leaves a permanent garbled line in the log that
  // parseEvent on the read side has to skip on every boot.
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
        const parsed = parseEvent(line);
        if (!parsed.ok) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: parsed.error, raw: parsed.raw }));
          return;
        }
        // Append the original line (preserves caller's field ordering /
        // formatting) — parsed.event is just the validation product.
        fs.appendFileSync(LOG_PATH, line + "\n");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, kind: parsed.event.kind }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // Cancel an in-flight run. Emits a bridge.cancel event that:
  //  1) the worker tails and turns into a Ctrl+C sent to the project's tab
  //  2) state.ts projects into "currentRun = undefined" once the runId matches
  //  3) the worker treats as a terminator so a never-started dispatch sitting
  //     in pendingDispatches doesn't fire on next worker restart
  //
  // Body: { project: string, runId?: string, reason?: string }
  // If runId is omitted, the live currentRun.runId is used. 404 if there's
  // no active run for the project.
  if (url === "/api/cancel" && req.method === "POST") {
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
        const liveState = state.get(projectName);
        const runId: string | undefined =
          (typeof parsed.runId === "string" && parsed.runId) || liveState?.currentRun?.runId;
        if (!runId) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            error: `no active run for project: ${projectName}`,
            hint: "POST body can include a runId to cancel a specific run; otherwise the project must have a currentRun.",
          }));
          return;
        }
        const reason = (typeof parsed.reason === "string" && parsed.reason.slice(0, 200)) || "user cancel";
        const cancelled = appendEvent({
          kind: "bridge.cancel",
          project: projectName,
          runId,
          reason,
        });
        // Eager projection — match the /api/dispatch pattern. Closes the
        // same race: a follow-up dispatch arriving before fs.watch fires
        // would see stale currentRun and refuse to proceed; with eager
        // apply, currentRun is already cleared (bridge.cancel projection
        // matches runId and unsets it). Idempotent re-application by
        // tailLog: cancelledRunIds.filter() dedupes, currentRun stays
        // undefined.
        state = applyEvent(state, cancelled);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, runId, reason }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(e) }));
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
        // Look up the project — first in the live event-projected state, then
        // fall back to the agent-projects.conf registry so a brand-new project
        // (no events yet) can still receive its first dispatch. Last resort:
        // accept the name verbatim; the brain has nothing to reason about so
        // decide() defaults to "next_best" with neutral confidence, but that's
        // a valid first run.
        const liveState = state.get(projectName);
        const registered = resolveProjectPath(projectName);
        if (!liveState && !registered) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            error: `unknown project: ${projectName}`,
            hint: "Add it to ~/.config/agent-projects.conf (TabName|/absolute/path), or POST a worker.* event first.",
          }));
          return;
        }
        const projectState: ProjectState = liveState ?? {
          project: projectName,
          lastEventTs: new Date().toISOString(),
          recentOutcomes: [],
        };
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
        // Pick up the user's prompt queue if present: caller-supplied (request
        // body) wins, else read /tmp/agent-queue-<tab> — the file mirror the
        // cloud /api/beacon/queue/[tab] PUT writes (best-effort) for bash-hook
        // and home/ compat. Either source flows through buildPromptForDispatch
        // → renderTaskForAdapter → renderQueueBlock so the dispatched prompt
        // body shows the agent what's pending. Empty/missing queue → no block.
        const queue: string[] = (() => {
          if (Array.isArray(parsed.queue)) {
            return parsed.queue.filter((s: unknown): s is string => typeof s === "string");
          }
          try {
            const file = path.join("/tmp", `agent-queue-${projectName.toLowerCase()}`);
            const raw = fs.readFileSync(file, "utf8");
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter((s: unknown): s is string => typeof s === "string") : [];
          } catch { return []; }
        })();
        const prompt = buildPromptForDispatch(decision, projectState, projectPath, queue);
        const intent = decision.action.intent;
        // Adapter resolution: caller-supplied wins (lets the UI override per
        // dispatch), otherwise fall back to the project's declared adapter
        // from agent-projects.conf's 3rd field. Worker defaults to "claude"
        // downstream if both are absent.
        const adapter: Adapter | undefined =
          (typeof parsed.adapter === "string" && (ADAPTERS as readonly string[]).includes(parsed.adapter)
            ? (parsed.adapter as Adapter)
            : undefined)
          ?? resolveProjectAdapter(projectName);
        const dispatched = appendEvent({
          kind: "bridge.dispatch",
          project: projectName,
          intent,
          prompt,
          runId,
          autonomy: (parsed.autonomy as Autonomy | undefined) ?? "confirm",
          adapter,
          reason: decision.action.reason,
          confidence: decision.confidence,
        });
        // Eagerly project so a concurrent /api/dispatch reads the post-state
        // and decide() returns "wait" instead of firing a second dispatch.
        // tailLog will re-apply the same event when fs.watch fires; that's
        // idempotent for bridge.dispatch (just overwrites currentRun).
        state = applyEvent(state, dispatched);
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
  queue?: string[],
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
  // intent="custom" so renderTaskForAdapter echoes it verbatim. The
  // remaining queue (everything after the drained head) still flows so
  // the agent sees what's coming after this run.
  if (decision.action.kind === "dispatch" && decision.action.prompt) {
    return renderPromptForDispatch({
      project: project.project,
      projectPath,
      intent: "custom",
      customInstructions: decision.action.prompt,
      queue,
    });
  }
  return renderPromptForDispatch({
    project: project.project,
    projectPath,
    intent,
    queue,
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
