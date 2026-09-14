import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fleetSessionsDir,
  legacyClaudeSessionsDir,
  migrateLegacyHandoffs,
} from "@/lib/session-paths";
import { resolveSessionFile, sessionFilePath } from "@/lib/agent-config";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "loki-session-paths-"));
const previousHome = process.env.HOME;
const previousOverride = process.env.APP_SESSIONS_DIR;

try {
  delete process.env.APP_SESSIONS_DIR;
  process.env.HOME = root;
  const legacy = legacyClaudeSessionsDir(root);
  const current = fleetSessionsDir(root);
  fs.mkdirSync(path.join(legacy, "Loki.blockers", "pending"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "Loki.md"), "status: ready\ndone: legacy\n");
  fs.writeFileSync(path.join(legacy, "12345.json"), '{"status":"idle"}');
  fs.writeFileSync(path.join(legacy, "Loki.blockers", "pending", "ask.md"), "Need input");

  assert.equal(migrateLegacyHandoffs(root), current);
  assert.equal(
    fs.readFileSync(path.join(current, "Loki.md"), "utf8"),
    "status: ready\ndone: legacy\n",
  );
  assert.equal(fs.existsSync(path.join(current, "12345.json")), false);
  assert.equal(fs.existsSync(path.join(current, "Loki.blockers", "pending", "ask.md")), true);

  fs.writeFileSync(path.join(current, "Loki.md"), "status: working\ndone: current\n");
  fs.writeFileSync(path.join(legacy, "Loki.md"), "status: ready\ndone: overwritten legacy\n");
  migrateLegacyHandoffs(root);
  assert.match(fs.readFileSync(path.join(current, "Loki.md"), "utf8"), /done: current/);
  assert.equal(sessionFilePath("Loki"), path.join(current, "Loki.md"));

  const legacyFile = path.join(legacy, "Loki.md");
  const currentFile = path.join(current, "Loki.md");
  const now = Date.now();
  fs.utimesSync(currentFile, new Date(now - 2_000), new Date(now - 2_000));
  fs.utimesSync(legacyFile, new Date(now), new Date(now));
  assert.equal(resolveSessionFile("loki"), legacyFile);
  fs.utimesSync(currentFile, new Date(now + 2_000), new Date(now + 2_000));
  assert.equal(resolveSessionFile("LOKI"), currentFile);

  // A watcher seeds migrated files after migration, so their preserved mtimes
  // remain historical rather than looking like fresh completion events.
  assert.ok(Math.abs(fs.statSync(currentFile).mtimeMs - (now + 2_000)) < 1);

  console.log("session paths: ok");
} finally {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousOverride === undefined) delete process.env.APP_SESSIONS_DIR;
  else process.env.APP_SESSIONS_DIR = previousOverride;
  fs.rmSync(root, { recursive: true, force: true });
}
