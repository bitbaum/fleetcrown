/**
 * Where a dispatched project lives on THIS runner.
 *
 * Regression coverage for #145: token accounting shipped, ran for a day, and
 * wrote ZERO rows. A dispatch carries the founder's laptop path
 * (`/home/g/dev/solon`); the box resolves a local clone inside
 * `launchAgentPty`, but that resolution never escaped the function — so the
 * poller recorded the laptop path, `collectClaudeUsage` looked for
 * `~/.claude/projects/-home-g-dev-solon`, found nothing, and skipped silently
 * forever. The same unresolved path made `detectAuthFailure` unable to see dead
 * box credentials.
 *
 * The invariant: the path used for transcript lookups is the path the agent
 * actually runs in.
 *
 * Run: npx tsx scripts/test/box-workspace-path.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  resolveRunnerWorkspaceDir,
  sanitizeWorkspaceKey,
  BOX_DEV_ROOT,
} from "@/lib/agent-execution/box-workspace-path";
import { claudeProjectSlug } from "@/lib/usage/claude-transcript-usage";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  // A directory that certainly exists, to stand in for the laptop case.
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-ws-"));

  check("an existing requested dir is used as-is (laptop: identity)", () => {
    assert(
      resolveRunnerWorkspaceDir("solon", realDir) === realDir,
      "a dir that exists must never be remapped",
    );
  });

  // A path that cannot exist on ANY machine running this suite — the laptop
  // path `/home/g/dev/<p>` is real on the founder's own laptop, so using it
  // here would make the test pass or fail depending on who runs it.
  const FOREIGN = "/nonexistent-runner-host/dev/solon";

  check("a dir that does not exist here resolves to the box-local clone", () => {
    const resolved = resolveRunnerWorkspaceDir("solon", FOREIGN);
    assert(
      resolved === path.join(BOX_DEV_ROOT, "solon"),
      `expected the box clone path, got ${resolved}`,
    );
  });

  check("resolution is keyed on the TAB, not the foreign path's basename", () => {
    // The laptop path may be named anything; the box clone is named after the
    // project, which is what box-workspace clones into.
    const resolved = resolveRunnerWorkspaceDir("SBB-Lost-Found", "/home/g/code/whatever");
    assert(
      resolved === path.join(BOX_DEV_ROOT, "sbb-lost-found"),
      `expected the sanitized tab clone path, got ${resolved}`,
    );
  });

  check("the resolved dir yields a transcript slug that can exist locally", () => {
    // The actual bug: a foreign path produced a slug like `-home-g-dev-solon`,
    // which no transcript directory on THIS host ever matches, so the usage
    // collector found nothing and skipped in silence.
    const foreignSlug = claudeProjectSlug(FOREIGN);
    const resolvedSlug = claudeProjectSlug(resolveRunnerWorkspaceDir("solon", FOREIGN));
    assert(
      foreignSlug === "-nonexistent-runner-host-dev-solon",
      `unexpected foreign slug: ${foreignSlug}`,
    );
    assert(resolvedSlug !== foreignSlug, "resolution must move the slug onto this host");
    assert(
      resolvedSlug === claudeProjectSlug(path.join(BOX_DEV_ROOT, "solon")),
      "resolved slug must match the box clone directory",
    );
  });

  check("the real dispatch shape is handled: laptop path on a box-style host", () => {
    // Verbatim from a production dispatch payload, with a host root that this
    // suite can guarantee is absent.
    const resolved = resolveRunnerWorkspaceDir("datacat", "/nonexistent-runner-host/dev/datacat");
    assert(
      claudeProjectSlug(resolved).startsWith(claudeProjectSlug(BOX_DEV_ROOT)),
      `resolved transcript slug must live under this host's dev root, got ${resolved}`,
    );
  });

  check("empty requested dir still resolves rather than throwing", () => {
    assert(
      resolveRunnerWorkspaceDir("solon", "") === path.join(BOX_DEV_ROOT, "solon"),
      "an absent dir must fall back to the box clone path",
    );
  });

  check("sanitizeWorkspaceKey never yields an empty segment", () => {
    assert(sanitizeWorkspaceKey("///") === "workspace", "degenerate names need a safe fallback");
    assert(sanitizeWorkspaceKey("My Project!") === "my-project", "unexpected sanitization");
  });

  fs.rmSync(realDir, { recursive: true, force: true });
  console.log(`\n${passed} box-workspace-path test(s) passed`);
}

runTests();
