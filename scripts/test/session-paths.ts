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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleetcrown-session-paths-"));
const previousHome = process.env.HOME;
const previousOverride = process.env.APP_SESSIONS_DIR;

try {
  delete process.env.APP_SESSIONS_DIR;
  process.env.HOME = root;
  const legacy = legacyClaudeSessionsDir(root);
  const current = fleetSessionsDir(root);
  fs.mkdirSync(path.join(legacy, "FleetCrown.blockers", "pending"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "FleetCrown.md"), "status: ready\ndone: legacy\n");
  fs.writeFileSync(path.join(legacy, "12345.json"), '{"status":"idle"}');
  fs.writeFileSync(path.join(legacy, "FleetCrown.blockers", "pending", "ask.md"), "Need input");

  assert.equal(migrateLegacyHandoffs(root), current);
  assert.equal(fs.readFileSync(path.join(current, "FleetCrown.md"), "utf8"), "status: ready\ndone: legacy\n");
  assert.equal(fs.existsSync(path.join(current, "12345.json")), false);
  assert.equal(fs.existsSync(path.join(current, "FleetCrown.blockers", "pending", "ask.md")), true);

  fs.writeFileSync(path.join(current, "FleetCrown.md"), "status: working\ndone: current\n");
  fs.writeFileSync(path.join(legacy, "FleetCrown.md"), "status: ready\ndone: overwritten legacy\n");
  migrateLegacyHandoffs(root);
  assert.match(fs.readFileSync(path.join(current, "FleetCrown.md"), "utf8"), /done: current/);
  assert.equal(sessionFilePath("FleetCrown"), path.join(current, "FleetCrown.md"));

  const legacyFile = path.join(legacy, "FleetCrown.md");
  const currentFile = path.join(current, "FleetCrown.md");
  const now = Date.now();
  fs.utimesSync(currentFile, new Date(now - 2_000), new Date(now - 2_000));
  fs.utimesSync(legacyFile, new Date(now), new Date(now));
  assert.equal(resolveSessionFile("fleetcrown"), legacyFile);
  fs.utimesSync(currentFile, new Date(now + 2_000), new Date(now + 2_000));
  assert.equal(resolveSessionFile("FLEETCROWN"), currentFile);

  console.log("session paths: ok");
} finally {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousOverride === undefined) delete process.env.APP_SESSIONS_DIR;
  else process.env.APP_SESSIONS_DIR = previousOverride;
  fs.rmSync(root, { recursive: true, force: true });
}
