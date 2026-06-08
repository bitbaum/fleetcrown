/**
 * Pure KDL layout emitter for Fleet Runner's cold-start restore path.
 *
 * Input: PaneRecord[] (from runtime_snapshots.panes — the last-observed
 * fleet state). Output: a zellij layout in KDL syntax with one `tab` per
 * unique tab name, one `pane` per record, with `command` baked in so the
 * agent runs immediately when zellij spawns the layout. No press-ENTER
 * prompt because we're not using zellij's serialized resurrect file —
 * we're generating fresh KDL from our own SSOT.
 *
 * Reuses the agent-registry's launch-command builder so Claude/Codex/etc.
 * pick up their cwd + source-bashrc + invocation exactly like a manual
 * `restartTab()` injection would.
 *
 * Pure function. No I/O. Tested via the inline self-test at the bottom.
 */

import { buildAgentOptionLaunchCommand, type AgentOption, isAgentId } from "@/lib/agent-registry";
import type { PaneRecord } from "@/db/schema/runtime-snapshots";

export type GenerateOpts = {
  /**
   * If true, panes that have a command are emitted with `start_suspended=true`,
   * which makes zellij wait for the user to press ENTER before running. This
   * is the "safe" mode — used when the snapshot might be stale and we want
   * a confirmation gate. Default false: we trust our own snapshot.
   */
  suspendCommands?: boolean;
};

/** Escape a value for use inside a KDL double-quoted string. */
function kdlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function emitPane(rec: PaneRecord, suspend: boolean): string {
  const indent = "    ";
  const cwd = rec.cwd?.trim();
  // No agent → shell pane in cwd. Useful for utility tabs.
  if (!rec.agentCli || !isAgentId(rec.agentCli)) {
    return cwd ? `${indent}pane cwd=${kdlString(cwd)}` : `${indent}pane`;
  }
  // Agent pane → bash -c <launch command>. We can't use `pane command="claude"`
  // directly because the adapter's launch line is a shell pipeline
  // (source ~/.bashrc; cd …; claude). Wrap in bash -c so the whole line runs.
  const launchLine = buildAgentOptionLaunchCommand(
    { agent: rec.agentCli as AgentOption },
    cwd ?? process.env.HOME ?? "/",
  );
  const suspendAttr = suspend ? " start_suspended=true" : "";
  // KDL multi-line node — args followed by the string. Indent the args.
  return [
    `${indent}pane command="bash"${suspendAttr} {`,
    `${indent}    args "-c" ${kdlString(launchLine)}`,
    `${indent}}`,
  ].join("\n");
}

/**
 * Generate a KDL layout that recreates the given panes. Panes are grouped
 * by tab, sorted by paneIndex within each tab. Tab order follows the order
 * tabs first appear in the input.
 */
export function generateLayoutKdl(panes: PaneRecord[], opts: GenerateOpts = {}): string {
  const suspend = opts.suspendCommands === true;
  // Preserve first-appearance order for tabs.
  const tabOrder: string[] = [];
  const byTab = new Map<string, PaneRecord[]>();
  for (const pane of panes) {
    if (!pane.tab.trim()) continue;
    if (!byTab.has(pane.tab)) {
      tabOrder.push(pane.tab);
      byTab.set(pane.tab, []);
    }
    byTab.get(pane.tab)!.push(pane);
  }

  // Empty input → a single empty tab so zellij still spawns something usable.
  if (tabOrder.length === 0) {
    return ["layout {", "    tab {", "        pane", "    }", "}"].join("\n") + "\n";
  }

  const lines: string[] = ["layout {"];
  for (const tab of tabOrder) {
    const records = byTab.get(tab)!.slice().sort((a, b) => a.paneIndex - b.paneIndex);
    lines.push(`    tab name=${kdlString(tab)} {`);
    for (const rec of records) lines.push(emitPane(rec, suspend));
    lines.push("    }");
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test — run via `npx tsx desktop/src/main/zellij-layout-generator.ts --self-test`
// Picked up by scripts/test-home.sh.

function runSelfTest(): void {
  const cases: Array<{ name: string; run: () => boolean }> = [
    {
      name: "empty input → single empty tab fallback",
      run: () => {
        const out = generateLayoutKdl([]);
        return out.includes("layout {") && out.includes("pane") && out.includes("tab {");
      },
    },
    {
      name: "single claude pane → bash -c launch line",
      run: () => {
        const out = generateLayoutKdl([
          { tab: "fleetcrown", paneIndex: 0, agentCli: "claude", cwd: "/home/g/dev/fleetcrown" },
        ]);
        const hasTab = out.includes('tab name="fleetcrown"');
        const hasBashC = out.includes('pane command="bash"') && out.includes('args "-c"');
        const hasCwd = out.includes("/home/g/dev/fleetcrown");
        const hasClaude = out.includes("claude");
        return hasTab && hasBashC && hasCwd && hasClaude;
      },
    },
    {
      name: "shell pane (no agentCli) emits bare pane with cwd",
      run: () => {
        const out = generateLayoutKdl([
          { tab: "scratch", paneIndex: 0, cwd: "/tmp" },
        ]);
        return out.includes('tab name="scratch"') && out.includes('pane cwd="/tmp"') && !out.includes('command="bash"');
      },
    },
    {
      name: "two panes in one tab preserve paneIndex order",
      run: () => {
        const out = generateLayoutKdl([
          { tab: "split", paneIndex: 1, agentCli: "claude", cwd: "/home/g/dev/a" },
          { tab: "split", paneIndex: 0, agentCli: "codex", cwd: "/home/g/dev/b" },
        ]);
        // codex (paneIndex 0) should appear before claude (paneIndex 1)
        const codexIdx = out.indexOf("codex");
        const claudeIdx = out.indexOf("claude");
        return codexIdx > 0 && claudeIdx > 0 && codexIdx < claudeIdx;
      },
    },
    {
      name: "two tabs preserve first-appearance order",
      run: () => {
        const out = generateLayoutKdl([
          { tab: "second", paneIndex: 0, cwd: "/home/g/dev/x" },
          { tab: "first", paneIndex: 0, cwd: "/home/g/dev/y" },
          { tab: "second", paneIndex: 1, cwd: "/home/g/dev/z" },
        ]);
        const secondIdx = out.indexOf('tab name="second"');
        const firstIdx = out.indexOf('tab name="first"');
        return secondIdx > 0 && firstIdx > secondIdx;
      },
    },
    {
      name: "suspendCommands=true adds start_suspended=true",
      run: () => {
        const out = generateLayoutKdl(
          [{ tab: "t", paneIndex: 0, agentCli: "claude", cwd: "/tmp" }],
          { suspendCommands: true },
        );
        return out.includes("start_suspended=true");
      },
    },
    {
      name: "KDL string escapes embedded quotes",
      run: () => {
        const out = generateLayoutKdl([{ tab: 'has"quote', paneIndex: 0, cwd: "/tmp" }]);
        return out.includes('tab name="has\\"quote"');
      },
    },
    {
      name: "empty tab name is skipped",
      run: () => {
        const out = generateLayoutKdl([
          { tab: "", paneIndex: 0, cwd: "/tmp" },
          { tab: "real", paneIndex: 0, cwd: "/tmp" },
        ]);
        return out.includes('tab name="real"') && !out.includes('tab name=""');
      },
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = c.run(); } catch { ok = false; }
    if (ok) { console.log(`  ✓ ${c.name}`); pass++; }
    else    { console.log(`  ✗ ${c.name}`); fail++; }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
const hasFlag = process.argv.includes("--self-test");
if (isMain && hasFlag) runSelfTest();
