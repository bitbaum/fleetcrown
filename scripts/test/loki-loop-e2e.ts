/**
 * Loki end-to-end, against a REAL deployment, as the signed-in operator.
 *
 * "Does Loki work as intended?" has exactly three testable meanings, and this
 * file asks all three through the same HTTP API the /loki page uses — no
 * browser, no mocks, no fixtures:
 *
 *   1. KNOWS the fleet — a fleet-shaped question is answered from the studio
 *      map (the three pillars named, `fleet_map` among the retrieved sources)
 *      and the answer is an ANSWER, not the model's plan for one.
 *   2. PUBLISHES the map — /api/fleet/map is public, names the pillars as
 *      live, and bitbaum's map.json is the same map (not a stale copy).
 *   3. CLOSES THE LOOP (--dispatch) — a request typed into a thread comes
 *      back into that thread as an `outcome` turn. When the box builder has no
 *      working auth this is the check that fails, and it says so.
 *
 * Every check prints PASS/FAIL with the evidence; the exit code is the verdict.
 * A dispatch that never returns is aborted (user_abort) so a test never leaves
 * a run hanging in the operator's queue; its prompt carries the [loki-e2e]
 * marker so it is recognisable in the ledger.
 *
 *   LOKI_SESSION_TOKEN=… npx tsx scripts/test/loki-loop-e2e.ts [--dispatch]
 *   BASE=https://loki.orangecat.ch  E2E_DISPATCH_MINUTES=20  E2E_PROJECT=loki
 */
import { config } from "dotenv";
import { smokeSessionToken } from "@/lib/brand-env";
import { looksLikePlan } from "@/lib/loki/plan-as-answer";

config({ path: ".env.local", quiet: true });
config({ path: ".env.hetzner.local", quiet: true });

const BASE = (process.env.BASE ?? "https://loki.orangecat.ch").replace(/\/$/, "");
const BITBAUM_MAP = process.env.BITBAUM_MAP_URL ?? "https://bitbaum.orangecat.ch/map.json";
const PROJECT = process.env.E2E_PROJECT ?? "loki";
const DISPATCH = process.argv.includes("--dispatch");
const DISPATCH_MINUTES = Number(process.env.E2E_DISPATCH_MINUTES ?? 20);
const MARKER = "[loki-e2e]";

const token = smokeSessionToken();
if (!token) {
  console.error(
    "✗ no session: set LOKI_SESSION_TOKEN (mint one with scripts/test/print-session-token.ts)",
  );
  process.exit(2);
}
const cookieName = BASE.startsWith("https://")
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";
const headers = { cookie: `${cookieName}=${token}`, "content-type": "application/json" };

type Verdict = { name: string; ok: boolean; evidence: string };
const verdicts: Verdict[] = [];
function record(name: string, ok: boolean, evidence: string) {
  verdicts.push({ name, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${evidence}`);
}

type Turn = {
  role: string;
  kind?: string | null;
  content: string;
  meta?: Record<string, unknown> | null;
};

async function createConversation(title: string, projectKeys: string[]): Promise<string> {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, projectKeys }),
  });
  if (!res.ok) throw new Error(`create conversation → ${res.status}`);
  const j = (await res.json()) as { conversation: { id: string } };
  return j.conversation.id;
}

/** Post one message and collect the assistant turns from the SSE stream. */
async function send(
  conversationId: string,
  text: string,
  opts: { selectedProjects: string[]; chatOnly?: boolean },
): Promise<Turn[]> {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      selectedProjects: opts.selectedProjects,
      chatOnly: opts.chatOnly ?? false,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`send → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const raw = await res.text();
  const turns: Turn[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(line.slice(5).trim()) as { type?: string; message?: Turn };
      if (ev.type === "message" && ev.message?.role === "assistant") turns.push(ev.message);
    } catch {
      /* keep-alive or partial frame */
    }
  }
  return turns;
}

async function thread(conversationId: string): Promise<Turn[]> {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}`, { headers });
  if (!res.ok) throw new Error(`read thread → ${res.status}`);
  return ((await res.json()) as { messages: Turn[] }).messages;
}

/** The run's own state — so a lost notification cannot read as a broken loop. */
async function runState(runId: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/api/orchestration/runs/${runId}`, { headers });
    if (!res.ok) return `unreadable (HTTP ${res.status})`;
    const j = (await res.json()) as { run?: { state?: string; outcome?: string } } & {
      state?: string;
      outcome?: string;
    };
    const state = j.run?.state ?? j.state ?? "?";
    const outcome = j.run?.outcome ?? j.outcome ?? "-";
    return `${state}/${outcome}`;
  } catch (e) {
    return `unreadable (${(e as Error).message})`;
  }
}

async function abortRun(runId: string, why: string): Promise<void> {
  await fetch(`${BASE}/api/orchestration/runs/${runId}/finish`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      outcome: "user_abort",
      userAbort: true,
      error: `${MARKER} ${why}`.slice(0, 2000),
    }),
  }).catch(() => undefined);
}

// ── 1. knows the fleet ──────────────────────────────────────────────────────
async function checkKnowsTheFleet() {
  const id = await createConversation(`${MARKER} pillars`, []);
  const turns = await send(
    id,
    "What are the three pillars of the studio, and which layer is each? Answer in three lines.",
    { selectedProjects: [], chatOnly: true },
  );
  const answer = turns.find((t) => t.kind === "chat") ?? turns[0];
  const text = (answer?.content ?? "").trim();
  const lower = text.toLowerCase();
  const named = ["orangecat", "loki", "solon"].filter((p) => lower.includes(p));
  const retrieved = (answer?.meta?.retrieved as Array<{ source?: string }> | undefined) ?? [];
  const fromMap = retrieved.some((r) => r.source === "fleet_map");
  const plan = looksLikePlan(text);
  record(
    "knows the fleet: pillars answered from the map",
    named.length === 3 && fromMap && !plan && text.length > 0,
    `named ${named.length}/3 (${named.join(", ") || "none"}); fleet_map retrieved: ${fromMap}; plan-as-answer: ${plan}; via ${String(answer?.meta?.via ?? "?")} ${String(answer?.meta?.model ?? "")}\n      "${text.replace(/\s+/g, " ").slice(0, 220)}"`,
  );
}

// ── 2. publishes the map ────────────────────────────────────────────────────
async function checkPublishesTheMap() {
  const res = await fetch(`${BASE}/api/fleet/map`);
  const map = res.ok
    ? ((await res.json()) as {
        generatedAt: string;
        summary: { projects: number; live: number };
        projects: Array<{ slug: string; status: string }>;
      })
    : null;
  const pillars = ["orangecat", "loki", "solon"].map((s) =>
    map?.projects.find((p) => p.slug === s),
  );
  const pillarsLive = pillars.every((p) => p?.status === "live");
  record(
    "publishes the map: public, pillars live",
    res.ok && (map?.summary.projects ?? 0) >= 20 && pillarsLive,
    `HTTP ${res.status}; ${map?.summary.projects ?? 0} projects, ${map?.summary.live ?? 0} live; pillars ${pillars.map((p) => `${p?.slug ?? "?"}=${p?.status ?? "missing"}`).join(" ")}`,
  );

  const bb = await fetch(BITBAUM_MAP).catch(() => null);
  const published = bb?.ok
    ? ((await bb.json()) as { generatedAt: string; summary: { projects: number } })
    : null;
  const ageDays = published
    ? (Date.now() - Date.parse(published.generatedAt)) / 86_400_000
    : Infinity;
  const sameSize =
    !!map && !!published && Math.abs(map.summary.projects - published.summary.projects) <= 3;
  record(
    "bitbaum shows the same map, recently",
    !!published && ageDays < 8 && sameSize,
    `bitbaum map.json ${bb?.status ?? "unreachable"}; generated ${published ? ageDays.toFixed(1) : "?"} days ago; ${published?.summary.projects ?? "?"} vs ${map?.summary.projects ?? "?"} projects`,
  );
}

// ── 3. closes the loop ──────────────────────────────────────────────────────
async function checkClosesTheLoop() {
  const id = await createConversation(`${MARKER} loop`, [PROJECT]);
  const task =
    `${MARKER} Health probe of the dispatch loop. Do NOT change any file, do NOT commit, push or open a pull request. ` +
    `Run \`git status --short | head -3\` in the checkout, then write a handoff whose summary is exactly: "e2e ok — no changes". Finish immediately.`;
  const turns = await send(id, task, { selectedProjects: [PROJECT] });
  const dispatch = turns.find((t) => t.kind === "dispatch");
  const runId = (dispatch?.meta?.runId as string | undefined) ?? null;
  const ok = dispatch?.meta?.ok === true;
  if (!ok || !runId) {
    record(
      "closes the loop: dispatch accepted",
      false,
      `no dispatch turn / runId (${JSON.stringify(dispatch?.meta ?? {}).slice(0, 200)})`,
    );
    return;
  }
  record(
    "closes the loop: dispatch accepted",
    true,
    `run ${runId} via ${String(dispatch?.meta?.channel ?? "?")}`,
  );

  const deadline = Date.now() + DISPATCH_MINUTES * 60_000;
  let outcome: Turn | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20_000));
    const msgs = await thread(id).catch(() => []);
    outcome = msgs.find((m) => m.kind === "outcome");
    if (outcome) break;
  }
  if (!outcome) {
    // Name WHICH half broke. A closed run with no turn is a lost notification
    // (the work happened); an open run is a stuck builder.
    const state = await runState(runId);
    const closed = /^(done|error|closed)\//.test(state);
    if (!closed) {
      await abortRun(
        runId,
        `no outcome within ${DISPATCH_MINUTES} min — check builder auth (loki-builder-auth timer) and the box-runner`,
      );
    }
    record(
      "closes the loop: outcome came back into the thread",
      false,
      closed
        ? `run ${runId} CLOSED (${state}) but wrote no outcome turn — the work happened, the notification was lost. Suspect a process that exits before its fire-and-forget close notification (see settle-background-work.ts).`
        : `run ${runId} still ${state} after ${DISPATCH_MINUTES} min — aborted. First suspect: the box builder cannot authenticate (see /opt/monitoring/builder-auth-check.sh --report).`,
    );
    return;
  }
  const text = outcome.content.replace(/\s+/g, " ");
  const success = /✅/.test(text);
  record(
    "closes the loop: outcome came back into the thread",
    success,
    `run ${runId}: "${text.slice(0, 220)}"`,
  );
}

(async () => {
  console.log(
    `loki e2e against ${BASE} (dispatch: ${DISPATCH ? `on, ${DISPATCH_MINUTES} min` : "off"})\n`,
  );
  try {
    await checkKnowsTheFleet();
  } catch (e) {
    record("knows the fleet: pillars answered from the map", false, (e as Error).message);
  }
  try {
    await checkPublishesTheMap();
  } catch (e) {
    record("publishes the map", false, (e as Error).message);
  }
  if (DISPATCH) {
    try {
      await checkClosesTheLoop();
    } catch (e) {
      record("closes the loop", false, (e as Error).message);
    }
  }
  const failed = verdicts.filter((v) => !v.ok);
  console.log(
    `\n${verdicts.length - failed.length}/${verdicts.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join("; ")}` : ""}`,
  );
  process.exit(failed.length ? 1 : 0);
})();
