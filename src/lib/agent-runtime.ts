import { execSync, spawnSync } from "child_process";
import { buildAgentOptionLaunchCommand, type AgentOption } from "@/lib/agent-registry";
import { findMatchingTab } from "@/lib/tab-match";

const DEFAULT_SESSION_NAME = "fleet";

// A zellij `action` against a session with no attached client (a stale/background
// session) can block indefinitely — e.g. `go-to-tab-name` waits forever for a
// client to focus. Because launchAgentInTab runs these synchronously on the
// single-threaded server, one such hang freezes the ENTIRE app. Every zellij
// shellout therefore goes through a hard timeout: a wedged call becomes a fast
// throw the caller can recover from, never a server-wide freeze.
const ZELLIJ_TIMEOUT_MS = 6000;

function zellijExec(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", timeout: ZELLIJ_TIMEOUT_MS });
}

function escapeTabValue(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}

/**
 * Find the Zellij session that contains a tab with the given name.
 * If ZELLIJ_SESSION_NAME is already set in the environment (i.e., the server
 * process is running inside a Zellij pane), that session is used directly.
 * Otherwise, scan all sessions to find which one owns the tab.
 */
function findSessionForTab(tab: string): string | null {
  const envSession = process.env.ZELLIJ_SESSION_NAME;
  if (envSession) {
    // Verify the tab actually lives in this session before trusting it.
    try {
      const out = zellijExec(
        `ZELLIJ_SESSION_NAME='${escapeTabValue(envSession)}' zellij action query-tab-names 2>/dev/null || true`,
      );
      if (
        findMatchingTab(
          tab,
          out
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        )
      ) {
        return envSession;
      }
    } catch {
      /* fall through to full scan */
    }
  }

  // Scan all sessions for the tab.
  try {
    const sessions = zellijExec("zellij list-sessions -n 2>/dev/null || true")
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);

    for (const session of sessions) {
      try {
        const out = zellijExec(
          `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action query-tab-names 2>/dev/null || true`,
        );
        if (
          findMatchingTab(
            tab,
            out
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          )
        ) {
          return session;
        }
      } catch {
        /* try next */
      }
    }
  } catch {
    /* no sessions */
  }

  return null;
}

function getOpenZellijTabs(session: string): string[] {
  try {
    const out = zellijExec(
      `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action query-tab-names 2>/dev/null || true`,
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * When a tab doesn't exist yet, pick the session to create it in. Prefer the
 * session with the most open tabs — that's the user's real workspace (the
 * attached session where every other agent lives), not a stale/background
 * session. Picking arbitrarily (sessions[0]) could land the new tab in an
 * unattached session, where the subsequent go-to-tab-name blocks forever.
 */
function pickPrimarySession(sessions: string[]): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const session of sessions) {
    const count = getOpenZellijTabs(session).length;
    if (count > bestCount) {
      best = session;
      bestCount = count;
    }
  }
  return best;
}

function ensureTabExists(tab: string, session: string): void {
  const open = getOpenZellijTabs(session);
  // Reuse a fuzzily-matching tab (e.g. existing "revamp-it" for "revampit")
  // instead of creating a near-duplicate; only create when nothing matches.
  if (!findMatchingTab(tab, open)) {
    zellijExec(
      `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action new-tab --name '${escapeTabValue(tab)}'`,
    );
    execSync("sleep 0.5");
  }
}

function restartTab(tab: string, command: string, session: string): void {
  const env = `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}'`;
  // Resolve the live tab name so `go-to-tab-name` doesn't silently no-op
  // when our input case (e.g., DB-stored "fleetcrown") differs from zellij's
  // stored case ("FleetCrown"). Falls back to the input if no live tab matches.
  const liveTabs = getOpenZellijTabs(session);
  const liveTab = findMatchingTab(tab, liveTabs) ?? tab;
  zellijExec(`${env} zellij action go-to-tab-name '${escapeTabValue(liveTab)}'`);
  execSync("sleep 0.2");
  zellijExec(`${env} zellij action write 3`);
  execSync("sleep 0.1");
  zellijExec(`${env} zellij action write-chars '${escapeTabValue(command)}'`);
  execSync("sleep 0.1");
  zellijExec(`${env} zellij action write 13`);
}

/**
 * Bootstrap a minimal zellij session if none exists. Synchronous wrapper
 * around the spawn-detached path used elsewhere — agent-runtime.ts has
 * always been synchronous and the callers don't await it. Returns the
 * spawned session name on success, null on failure (caller throws then).
 */
function spawnDefaultSession(): string | null {
  // Spawn `zellij --session fleet` detached; wait up to 3s for it to appear.
  // We don't pass --layout here because the caller will create the tab they
  // need next via ensureTabExists. The default zellij session shows a single
  // empty tab — fine; restartTab fills it.
  try {
    spawnSync("bash", ["-c", `nohup zellij --session ${DEFAULT_SESSION_NAME} >/dev/null 2>&1 &`], {
      timeout: 2000,
    });
  } catch {
    return null;
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const sessions = zellijExec("zellij list-sessions -n 2>/dev/null || true")
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (sessions.includes(DEFAULT_SESSION_NAME)) return DEFAULT_SESSION_NAME;
      if (sessions.length > 0) return sessions[0]!;
    } catch {
      /* keep waiting */
    }
    execSync("sleep 0.2");
  }
  return null;
}

export function launchAgentInTab(
  tab: string,
  dir: string,
  agent: AgentOption,
  model?: string,
): void {
  // Try to find the existing session; fall back to any available session for new-tab creation.
  let session = findSessionForTab(tab);

  if (!session) {
    // Tab doesn't exist yet — find any session to create it in.
    try {
      const sessions = zellijExec("zellij list-sessions -n 2>/dev/null || true")
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter(Boolean);
      session = pickPrimarySession(sessions);
    } catch {
      /* ignore */
    }
  }

  if (!session) {
    // Self-heal: spawn a default session so the user never sees the old
    // "start Zellij first" error. The poller does the same pre-flight up
    // its own call path; this is defense in depth for callers that bypass
    // the poller (e.g., /api/agent/launch on a local self-hosted server).
    session = spawnDefaultSession();
  }

  if (!session) {
    throw new Error(
      "No Zellij session found and auto-spawn failed — install zellij or check $PATH.",
    );
  }

  try {
    ensureTabExists(tab, session);
    const command = buildAgentOptionLaunchCommand({ agent, model }, dir);
    restartTab(tab, command, session);
  } catch (e) {
    // A zellij `action` against a session with no attached client blocks until
    // ZELLIJ_TIMEOUT_MS and throws a cryptic "spawnSync /bin/sh ETIMEDOUT".
    // Turn that into the exact next step instead of a dead end.
    const msg = (e as Error).message ?? "";
    if (/ETIMEDOUT|timed out|timeout/i.test(msg)) {
      throw new Error(
        `Zellij didn't respond while launching "${agent}" in session "${session}" — it's likely detached. ` +
          `Attach it (zellij attach ${session}) so FleetCrown can drive it, then retry.`,
      );
    }
    throw e;
  }
}
