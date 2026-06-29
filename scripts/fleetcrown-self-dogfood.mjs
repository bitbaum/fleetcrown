/**
 * Self-dogfood: use FleetCrown to drive work on the fleetcrown project.
 * Headed browser, screenshots at each step, weakness report.
 *
 *   npm run dogfood:self
 *   BASE=http://localhost:3000 npm run dogfood:self
 */
import fs, { cpSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(root, ".tmp", "self-dogfood", runId);
fs.mkdirSync(outDir, { recursive: true });

const base = (process.env.BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");
const isLocal = base.includes("localhost") || base.includes("127.0.0.1");
const project = process.env.PROJECT ?? "fleetcrown";
const headless = process.env.HEADLESS === "1";
const slowMo = Number(process.env.SLOW_MO ?? 120);

const BRAVE_PROFILE =
  process.env.BRAVE_PROFILE ??
  path.join(process.env.HOME ?? "", ".config/BraveSoftware/Brave-Browser/Default");
const BRAVE_BIN = process.env.BRAVE_BIN ?? "/opt/brave.com/brave/brave";

function readLocalEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

readLocalEnv();

const weaknesses = [];

function note(id, severity, observation, suggestion) {
  weaknesses.push({ id, severity, observation, suggestion });
}

async function shot(page, name, caption) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, timeout: 60_000, animations: "disabled" });
  return { name, caption, file };
}

async function loginLocal(page) {
  const pw = process.env.LOCAL_AUTH_PASSWORD;
  if (!pw) throw new Error("LOCAL_AUTH_PASSWORD required for localhost dogfood");
  await page.goto(`${base}/sign-in?callbackUrl=/loki`, { waitUntil: "networkidle" });
  const ownerTab = page.getByRole("button", { name: /owner key/i });
  if (await ownerTab.count()) await ownerTab.click();
  await page.locator('input[type="password"]').first().fill(pw);
  await page.getByRole("button", { name: /sign in|continue|unlock/i }).last().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });
}

function copyBraveProfile() {
  const dest = mkdtempSync(path.join(tmpdir(), "fc-self-dogfood-"));
  cpSync(BRAVE_PROFILE, dest, {
    recursive: true,
    filter: (src) => !src.endsWith("SingletonLock") && !src.endsWith("lockfile"),
  });
  return dest;
}

async function waitForApp(page) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (!page.url().includes("/sign-in") && !page.url().includes("/sign-up")) {
      if (await page.locator(".app-page, .ui-loki-composer-input").count()) return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("Sign-in required — log in in the browser window.");
}

const report = { base, project, startedAt: new Date().toISOString(), shots: [], steps: [] };
let profileDir = null;
let context;

try {
  if (isLocal) {
    context = await chromium.launch({
      headless,
      slowMo,
      executablePath: fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined,
    });
    const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
    await loginLocal(page);
    report.steps.push({ step: "login", mode: "owner-key", url: page.url() });

    // ── 1. Control — fleet status + fleetcrown card ──
    await page.goto(`${base}/control`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const controlAudit = await page.evaluate(() => ({
      builderLabel: document.querySelector(".ui-control-fleet-status, [class*='FleetStatus']")?.textContent?.trim().slice(0, 80) ?? null,
      fleetcrownCard: [...document.querySelectorAll("article, [data-project]")].find((el) =>
        el.textContent?.toLowerCase().includes("fleetcrown"),
      )?.textContent?.trim().slice(0, 120) ?? null,
    }));
    report.steps.push({ step: "control", audit: controlAudit });
    report.shots.push(await shot(page, "01-control", "Control — fleet + fleetcrown card"));

    // ── 2. Loki — dispatch move forward ──
    await page.goto(`${base}/loki`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ui-loki-composer-input", { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const projBtn = page.locator(".ui-loki-project").filter({
      has: page.locator(".truncate", { hasText: new RegExp(project, "i") }),
    });
    if (await projBtn.count()) await projBtn.first().click();
    report.shots.push(await shot(page, "02-loki-scoped", "Loki — fleetcrown selected"));

    await page.getByRole("button", { name: "Move forward", exact: true }).click();
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForSelector(".ui-loki-dispatch-foot, .ui-loki-kind", { timeout: 90_000 });
    await page.waitForTimeout(1500);

    const lokiAudit = await page.evaluate(() => {
      const foot = document.querySelector(".ui-loki-dispatch-foot");
      return {
        kind: document.querySelector(".ui-loki-kind")?.textContent?.trim(),
        status: foot?.querySelector("span:nth-of-type(2)")?.textContent?.trim(),
        links: foot ? [...foot.querySelectorAll("a")].map((a) => a.textContent?.trim()) : [],
        bubble: document.querySelector(".ui-loki-bubble-assistant:last-of-type")?.textContent?.trim().slice(0, 200),
      };
    });
    report.steps.push({ step: "loki-dispatch", audit: lokiAudit });
    report.shots.push(await shot(page, "03-loki-dispatch", "Loki — after Move forward dispatch"));

    if (lokiAudit.status?.includes("runs when the builder is online")) {
      note("presence", "high", "Dispatch footer still says builder offline on localhost", "Local dev has no box-runner; copy should say cloud-only or link to prod");
    }

    // ── 3. Terminal Cloud ──
    const cloud = page.getByRole("link", { name: /Watch in Cloud/i });
    if (await cloud.count()) {
      await cloud.first().click();
      await page.waitForURL(/\/terminal/, { timeout: 20_000 });
      await page.waitForTimeout(2000);
      const termAudit = await page.evaluate(() => ({
        url: location.href,
        tabLabel: document.querySelector(".ui-terminal-tab-active, [class*='tab']")?.textContent?.trim().slice(0, 40),
        hasAgentOutput: Boolean(document.querySelector(".xterm-rows, .xterm-screen")),
        bodyPreview: document.body.innerText.slice(0, 300),
      }));
      report.steps.push({ step: "terminal", audit: termAudit });
      report.shots.push(await shot(page, "04-terminal-cloud", "Terminal → Cloud"));
      if (!termAudit.url.includes(project) && !termAudit.bodyPreview?.toLowerCase().includes(project)) {
        note("terminal-tab", "high", "Terminal Cloud did not focus fleetcrown agent session", "Deep-link tab= should open box-runner PTY for that project, not generic bash");
      }
    }

    // ── 4. Projects — fleetcrown profile ──
    await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const fleetRow = page.locator(".ui-projects-row, article.ui-projects-card").filter({ hasText: new RegExp(project, "i") }).first();
    if (await fleetRow.count()) await fleetRow.click();
    await page.waitForTimeout(1000);
    report.shots.push(await shot(page, "05-projects-fleetcrown", "Projects — fleetcrown detail"));

    await context.close();
  } else {
    profileDir = copyBraveProfile();
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      slowMo,
      executablePath: fs.existsSync(BRAVE_BIN) ? BRAVE_BIN : undefined,
      channel: fs.existsSync(BRAVE_BIN) ? undefined : "chrome",
      viewport: { width: 1440, height: 900 },
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${base}/control`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    report.shots.push(await shot(page, "01-control-prod", "Prod Control"));
    report.steps.push({ step: "control", url: page.url() });

    await page.goto(`${base}/loki`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ui-loki-composer-input", { timeout: 60_000 });
    const projBtn = page.locator(".ui-loki-project").filter({
      has: page.locator(".truncate", { hasText: new RegExp(project, "i") }),
    });
    if (await projBtn.count()) await projBtn.first().click();
    report.shots.push(await shot(page, "02-loki-prod", "Prod Loki scoped"));
    await page.getByRole("button", { name: "Move forward", exact: true }).click();
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForSelector(".ui-loki-dispatch-foot", { timeout: 120_000 });
    await page.waitForTimeout(2000);
    const lokiAudit = await page.evaluate(() => ({
      status: document.querySelector(".ui-loki-dispatch-foot span:nth-of-type(2)")?.textContent?.trim(),
      bubble: document.querySelector(".ui-loki-bubble-assistant:last-of-type")?.textContent?.trim().slice(0, 200),
    }));
    report.steps.push({ step: "loki-dispatch", audit: lokiAudit });
    report.shots.push(await shot(page, "03-loki-dispatch-prod", "Prod dispatch"));

    const cloud = page.getByRole("link", { name: /Watch in Cloud/i });
    if (await cloud.count()) {
      await cloud.click();
      await page.waitForTimeout(2500);
      report.shots.push(await shot(page, "04-terminal-prod", "Prod Terminal Cloud"));
    }

    const api = await page.evaluate(async () => {
      const r = await fetch("/api/control");
      const d = r.ok ? await r.json() : {};
      const fc = (d.projects ?? []).find((p) => p.tab?.toLowerCase() === "fleetcrown");
      return {
        runnerConnected: d.runnerConnected,
        runnerVersion: d.runnerVersion,
        fleetcrownState: fc?.stateKey ?? fc?.status ?? null,
      };
    });
    report.steps.push({ step: "control-api", audit: api });
    if (!api.runnerConnected) note("presence", "high", "Control API reports runnerConnected=false while box-runner may be up", "Check bridge SSE + userId on runner_presence");
    if (lokiAudit.status?.includes("runs when the builder is online")) {
      note("dispatch-copy", "medium", "Still showing offline copy on prod after f755b4f", "Verify runnerConnected passed in inject response");
    }
    await context.close();
  }

  report.weaknesses = weaknesses;
  report.shotDir = outDir;
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, shotDir: outDir, weaknesses, steps: report.steps.map((s) => s.step) }, null, 2));
} finally {
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
