#!/usr/bin/env node
/**
 * @cockpit/agent — CLI to enroll a local machine with the Cockpit cloud control plane.
 *
 * Usage:
 *   npx @cockpit/agent init
 *   npx @cockpit/agent init --token ck_...
 *   npx @cockpit/agent init --base-url https://cockpitapp.vercel.app
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const DEFAULT_BASE_URL = "https://cockpitapp.vercel.app";
const CONFIG_DIR = path.join(os.homedir(), ".config", "cockpit");
const ENV_FILE = path.join(CONFIG_DIR, "daemon.env");
const DAEMON_DIR = path.join(os.homedir(), ".local", "share", "cockpit");

function parseArgs(argv) {
  const args = { command: argv[2], token: "", baseUrl: DEFAULT_BASE_URL, install: false };
  if (!args.command || args.command === "help" || args.command === "--help") {
    args.command = "help";
    return args;
  }
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--token" && argv[i + 1]) { args.token = argv[++i]; continue; }
    if (a === "--base-url" && argv[i + 1]) { args.baseUrl = argv[++i].replace(/\/$/, ""); continue; }
    if (a === "--install") { args.install = true; continue; }
  }
  return args;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function verifyToken(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/agent/register`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Token verification failed (${res.status})`);
  }
  return res.json();
}

function writeEnvFile(token, baseUrl) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const content = [
    `# Written by @cockpit/agent init`,
    `COCKPIT_DAEMON_TOKEN=${token}`,
    `COCKPIT_BASE_URL=${baseUrl}`,
    `APP_DAEMON_TOKEN=${token}`,
    `APP_BASE_URL=${baseUrl}`,
    "",
  ].join("\n");
  fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
}

/**
 * Download the daemon scripts tarball from the cloud and extract into
 * ~/.local/share/cockpit/. Uses the system `tar` binary (universal on
 * Linux/macOS; on Windows requires WSL/git-bash). Idempotent — overwrites
 * existing files on re-run. Returns the install dir on success, or null
 * on soft failure so init can still complete with just the env file.
 */
async function downloadDaemon(baseUrl) {
  console.log(`Downloading daemon scripts from ${baseUrl}/api/agent/daemon…`);
  const res = await fetch(`${baseUrl}/api/agent/daemon`);
  if (!res.ok) throw new Error(`Daemon download failed (HTTP ${res.status})`);
  const tarball = Buffer.from(await res.arrayBuffer());

  fs.mkdirSync(DAEMON_DIR, { recursive: true });

  const { spawn } = require("child_process");
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xz", "-C", DAEMON_DIR], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    child.stdin.end(tarball);
  });

  // chmod +x the executables so the user can run them directly without
  // having to remember `bash ...`.
  for (const name of ["cockpit-daemon.sh", "agent-hook-bridge.sh"]) {
    try { fs.chmodSync(path.join(DAEMON_DIR, name), 0o755); } catch {}
  }

  return DAEMON_DIR;
}

function printHelp() {
  console.log(`@cockpit/agent — connect your machine to Cockpit

Commands:
  init    Save daemon token and verify connectivity

Options:
  --token <ck_* token>     Agent token from Settings → Agent tokens
  --base-url <url>         Cockpit URL (default: ${DEFAULT_BASE_URL})
  --install                Run systemd install after saving token

Examples:
  npx @cockpit/agent init
  npx @cockpit/agent init --token ck_abc123...

After init, start the daemon:
  source ${ENV_FILE} && cockpit-daemon.sh
  # or from a Cockpit clone:
  APP_DAEMON_TOKEN=<token> ./scripts/cockpit-daemon.sh
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (args.command !== "init") {
    console.error(`Unknown command: ${args.command}`);
    printHelp();
    process.exit(1);
  }

  let token = args.token;
  if (!token) {
    console.log("Mint a token in Cockpit → Settings → Agent tokens");
    token = await prompt("Paste your ck_* agent token: ");
  }
  if (!token.startsWith("ck_")) {
    console.error("Expected a ck_* agent token from Settings → Agent tokens.");
    process.exit(1);
  }

  console.log(`Verifying token against ${args.baseUrl}…`);
  const profile = await verifyToken(args.baseUrl, token);
  writeEnvFile(token, args.baseUrl);

  let daemonInstalledAt = null;
  try {
    daemonInstalledAt = await downloadDaemon(args.baseUrl);
  } catch (err) {
    console.warn(`\n⚠️  Daemon install failed: ${err.message}`);
    console.warn(`   Token is saved (${ENV_FILE}). Re-run this command to retry the daemon download.`);
  }

  console.log(`\n✓ Connected as ${profile.user?.name ?? profile.user?.email ?? profile.user?.id}`);
  console.log(`✓ Config saved to ${ENV_FILE}`);
  if (daemonInstalledAt) {
    console.log(`✓ Daemon scripts installed to ${daemonInstalledAt}`);
  }
  console.log("\nNext steps:");
  console.log("  1. Install Zellij + at least one agent CLI (claude, codex, gemini, or openclaw)");
  console.log("  2. Register projects in Cockpit with local directory paths");
  if (daemonInstalledAt) {
    console.log(`  3. Start the daemon:`);
    console.log(`     set -a && source ${ENV_FILE} && ${daemonInstalledAt}/cockpit-daemon.sh`);
  } else {
    console.log(`  3. Re-run \`npx @cockpit/agent init\` once you're online to install the daemon scripts.`);
  }

  if (args.install) {
    const { spawnSync } = require("child_process");
    const repoScripts = path.join(process.cwd(), "scripts", "install-daemon.sh");
    if (fs.existsSync(repoScripts)) {
      console.log("\nRunning install-daemon.sh…");
      const r = spawnSync("bash", [repoScripts], { stdio: "inherit", env: { ...process.env, COCKPIT_DAEMON_TOKEN: token, COCKPIT_BASE_URL: args.baseUrl } });
      process.exit(r.status ?? 1);
    } else {
      console.warn("\n--install skipped: scripts/install-daemon.sh not found (run from Cockpit repo clone).");
    }
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
