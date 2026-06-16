import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { launchAgentInTab } from "@/lib/agent-runtime";
import { listAgentRegistry } from "@/lib/agent-registry";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { enqueueLaunchAgentCommand } from "@/db/queries/pending-commands";
import { persistProjectRuntimeIfNewer, prependProjectPrompt } from "@/db/queries/project-states";
import { stateFile } from "@/lib/agent-config";

const LaunchAgentBody = z.object({
  tab: z.string().trim().min(1).max(120),
  dir: z.string().trim().min(1).max(500),
  agent: z.string().trim().min(1).max(40),
  model: z.string().trim().max(160).optional(),
  initialPrompt: z.string().trim().max(4000).optional(),
});

const AGENT_BASENAMES = new Set(["claude", "codex", "gemini", "openclaw", "grok"]);

function isCursorAgentArgv0(argv0: string): boolean {
  return argv0.includes(".local/bin/agent") || argv0.includes("/.cursor/");
}

function isAgentRunningIn(dir: string): boolean {
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const argv0 = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0")[0] ?? "";
        const basename = argv0.split("/").pop() ?? "";
        const isKnownAgent = AGENT_BASENAMES.has(basename)
          || (basename === "agent" && isCursorAgentArgv0(argv0));
        if (!isKnownAgent) continue;
        if (fs.readlinkSync(`/proc/${entry}/cwd`) === dir) return true;
      } catch { /* skip */ }
    }
  } catch { /* /proc unavailable */ }
  return false;
}

function scheduleInjectAfterLaunch(userId: string, tab: string, dir: string, prompt: string): void {
  // The agent appearing in /proc does NOT mean its TUI is ready for keystrokes
  // — claude/grok take a beat to render their input box, and a single blind
  // inject at first-sighting races that render and is silently lost (observed:
  // identical launches where the prompt landed in one tab and vanished in
  // another). So: inject, then VERIFY the text actually shows up in the pane;
  // retry until it does. If it never lands within the window, drop the prompt
  // into the project's visible queue rather than losing it — a recoverable
  // failure beats a silent one. This writes the queue ONLY as a last resort, so
  // it does not double-deliver against a successful inject.
  const probe = prompt.replace(/\s+/g, " ").trim().slice(0, 24);
  const MAX_ATTEMPTS = 16; // ~48s — covers slow agent cold-starts
  let attempts = 0;
  const tick = async () => {
    attempts++;
    try {
      const { injectIntoTab, peekTab } = await import("@/lib/zellij");
      if (isAgentRunningIn(dir)) {
        // Already delivered (this or a prior attempt landed)? Stop — never double-send.
        if (probe && peekTab(tab).includes(probe)) return;
        injectIntoTab(tab, prompt);
      }
    } catch { /* retry below */ }
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tick, 3000);
      return;
    }
    // Window exhausted — confirm once more, then fall back to the visible queue.
    try {
      const { peekTab } = await import("@/lib/zellij");
      if (probe && peekTab(tab).includes(probe)) return;
    } catch { /* fall through to the queue fallback */ }
    try {
      await prependProjectPrompt(userId, tab, tab, prompt);
      console.error(`[agent/launch] inject never confirmed for "${tab}" — prompt queued for manual/auto delivery`);
    } catch (err) {
      console.error(`[agent/launch] inject + queue fallback both failed for "${tab}":`, err);
    }
  };
  setTimeout(tick, 3000);
}

/**
 * Record the state transition the launch just caused, so the dashboard reflects
 * reality immediately instead of waiting for the next runtime observation to
 * re-discover the new tab. Without this, a freshly launched (and actively
 * working) agent shows a gray dot + "Awaiting input", and downstream features
 * that read "is a tab live" (switch-agent, auto-continue) silently no-op.
 *
 * This writes the *display-state* mirror only — never the prompt-queue transport
 * (which would double-deliver against scheduleInjectAfterLaunch). The write is
 * guarded by runtimeObservedAt, so the next genuine observation supersedes it,
 * and isCurrentPromptStale's absent-agent grace self-heals if the launch failed.
 */
async function recordLaunchedState(
  userId: string,
  tab: string,
  agent: string,
  label: string,
): Promise<void> {
  // The authoritative local Control path (readFastState) reads the running
  // prompt from this /tmp sentinel, not the DB — so without it a freshly
  // launched agent shows no "Working" badge even though it just started. Mirror
  // exactly what /api/inject writes (source "inject" → /proc-backed, so
  // isCurrentPromptStale clears it the moment the agent process exits).
  try {
    const nowS = Math.floor(Date.now() / 1000);
    fs.writeFileSync(stateFile.prompt(tab), JSON.stringify({
      key: "launch",
      label: label.slice(0, 120),
      startedAt: nowS,
      source: "inject",
      adapter: agent,
    }));
  } catch { /* best effort — /tmp may be unwritable */ }

  try {
    const now = new Date();
    await persistProjectRuntimeIfNewer({
      userId,
      projectKey: tab,
      tabName: tab,
      agentRunning: true,
      tabOpen: true,
      activeAgents: [agent],
      currentPromptKey: "launch",
      currentPromptLabel: label.slice(0, 120),
      currentPromptStartedAt: now,
      readyAt: null,
      closingAt: null,
      closedAt: null,
      runtimeObservedAt: now,
    });
  } catch { /* best effort — never fail the launch on a state-mirror write */ }
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, LaunchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, agent, model, initialPrompt } = dataOrResp;
  const registry = listAgentRegistry();
  const exactEntry = registry.find((candidate) => candidate.id === agent);
  if (!exactEntry) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }
  if (isRuntimeAvailable() && !exactEntry.available) {
    return NextResponse.json({ error: exactEntry.availabilityReason ?? `${exactEntry.label} is not available on this machine.` }, { status: 400 });
  }
  if (!exactEntry.capabilities.tabSwitching) {
    return NextResponse.json({ error: `${exactEntry.label} does not support launching into a development tab yet.` }, { status: 400 });
  }

  if (!isRuntimeAvailable()) {
    const commandId = await enqueueLaunchAgentCommand(userId, { tab, dir, agent, model, initialPrompt });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId, tab, agent });
  }

  try {
    launchAgentInTab(tab, dir, exactEntry.id, model);
    const promptText = initialPrompt?.trim();
    await recordLaunchedState(userId, tab, exactEntry.id, promptText || `Starting ${exactEntry.label}…`);
    if (promptText) {
      scheduleInjectAfterLaunch(userId, tab, dir, promptText);
    }
    return NextResponse.json({ ok: true, tab, agent: exactEntry.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Launch failed: ${message}` }, { status: 500 });
  }
}
