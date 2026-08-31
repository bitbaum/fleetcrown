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
  if (await ownerTab.count()) await ownerTab.click({ force: true, timeout: 10_000 });
  await page.locator('input[type="password"]').first().fill(pw);
  await page
    .getByRole("button", { name: /sign in|continue|unlock/i })
    .last()
    .click();
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 }),
    page
      .locator(".ui-error")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(async () => {
        const error = await page.locator(".ui-error").first().textContent();
        throw new Error(`Owner-key sign-in failed: ${error?.trim() || "unknown error"}`);
      }),
  ]);
}

function copyBraveProfile() {
  const dest = mkdtempSync(path.join(tmpdir(), "fc-self-dogfood-"));
  cpSync(BRAVE_PROFILE, dest, {
    recursive: true,
    filter: (src) => !src.endsWith("SingletonLock") && !src.endsWith("lockfile"),
  });
  return dest;
}

async function waitForApp(page, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!page.url().includes("/sign-in") && !page.url().includes("/sign-up")) {
      if (await page.locator(".app-page, .ui-loki-composer-input").count()) return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("Sign-in required — log in in the browser window.");
}

async function loginEmailPasswordIfConfigured(page, callbackUrl = "/control") {
  const email = process.env.DOGFOOD_EMAIL;
  const password = process.env.DOGFOOD_PASSWORD;
  if (!email || !password) return false;
  logStep("login email/password");
  await gotoPage(page, `${base}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .getByRole("button", { name: /sign in/i })
    .last()
    .click();
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 }),
    page
      .locator(".ui-error")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(async () => {
        const error = await page.locator(".ui-error").first().textContent();
        throw new Error(`Email/password sign-in failed: ${error?.trim() || "unknown error"}`);
      }),
  ]);
  return true;
}

const report = { base, project, startedAt: new Date().toISOString(), shots: [], steps: [] };
let profileDir = null;
let context;
let activePage = null;

function logStep(step) {
  console.log(`[dogfood] ${step}`);
}

async function gotoPage(page, url, waitUntil = "domcontentloaded", timeout = 60_000) {
  logStep(`goto ${url}`);
  await Promise.race([
    page.goto(url, { waitUntil, timeout }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Navigation timed out after ${timeout}ms: ${url}`)),
        timeout,
      ),
    ),
  ]);
}

async function closeContext() {
  if (!context) return;
  await Promise.race([
    context.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

try {
  if (isLocal) {
    context = await chromium.launch({
      headless,
      slowMo,
      executablePath: fs.existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined,
    });
    const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
    activePage = page;
    await loginLocal(page);
    report.steps.push({ step: "login", mode: "owner-key", url: page.url() });

    // ── 1. Control — fleet status + fleetcrown card ──
    await page.goto(`${base}/control`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const controlAudit = await page.evaluate(() => ({
      builderLabel:
        document
          .querySelector(".ui-control-fleet-status, [class*='FleetStatus']")
          ?.textContent?.trim()
          .slice(0, 80) ?? null,
      fleetcrownCard:
        [...document.querySelectorAll("article, [data-project]")]
          .find((el) => el.textContent?.toLowerCase().includes("fleetcrown"))
          ?.textContent?.trim()
          .slice(0, 120) ?? null,
    }));
    report.steps.push({ step: "control", audit: controlAudit });
    report.shots.push(await shot(page, "01-control", "Control — fleet + fleetcrown card"));

    // ── 2. Loki — dispatch move forward ──
    await page.goto(`${base}/loki?project=${encodeURIComponent(project)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector(".ui-loki-composer-input", { timeout: 60_000 });
    await page.waitForFunction(
      (name) => {
        const pill = document.querySelector(".ui-loki-scope-pill")?.textContent?.trim();
        return Boolean(pill?.toLowerCase().includes(name));
      },
      project.toLowerCase(),
      { timeout: 30_000 },
    );

    const sendResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/conversations\/[^/]+\/messages$/.test(new URL(res.url()).pathname),
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: "Move forward", exact: true }).click();
    const messageResponse = await sendResponse.catch(() => null);
    const gotDispatch =
      Boolean(messageResponse?.ok()) &&
      (await page
        .waitForSelector(".ui-loki-dispatch-card, .ui-loki-kind", { timeout: 30_000 })
        .then(() => true)
        .catch(() => false));
    await page.waitForTimeout(1500);
    let lokiAudit = { kind: null, status: null, links: [], bubble: null };
    if (!gotDispatch) {
      note(
        "loki-send",
        "high",
        "Loki Send did not produce dispatch footer within 120s",
        "Check GROQ_API_KEY, network, or composer disabled state",
      );
      report.shots.push(await shot(page, "03-loki-timeout", "Loki — send hung or failed"));
    } else {
      lokiAudit = await page.evaluate(() => {
        const foot = document.querySelector(".ui-loki-dispatch-card");
        return {
          kind: document.querySelector(".ui-loki-kind")?.textContent?.trim(),
          status: foot
            ?.querySelector(".ui-loki-dispatch-status span:nth-of-type(2)")
            ?.textContent?.trim(),
          links: foot ? [...foot.querySelectorAll("a")].map((a) => a.textContent?.trim()) : [],
          bubble: document
            .querySelector(".ui-loki-bubble-assistant:last-of-type")
            ?.textContent?.trim()
            .slice(0, 200),
        };
      });
      report.shots.push(await shot(page, "03-loki-dispatch", "Loki — after Move forward dispatch"));
    }
    report.steps.push({ step: "loki-dispatch", audit: lokiAudit });
    if (gotDispatch && /failed|error|unconfirmed|not sent/i.test(lokiAudit.status ?? "")) {
      note(
        "loki-dispatch-outcome",
        "high",
        `Loki reported ${lokiAudit.status}`,
        "Pick an open project session or fix the dispatch path before calling dogfood successful",
      );
    }

    if (lokiAudit.status?.includes("runs when the builder is online")) {
      note(
        "presence",
        "high",
        "Dispatch footer still says builder offline on localhost",
        "Local dev has no box-runner; copy should say cloud-only or link to prod",
      );
    }

    // ── 3. Terminal Cloud ──
    const cloud = page.getByRole("link", { name: /Cloud terminal/i });
    if (await cloud.count()) {
      await cloud.first().click();
      await page.waitForURL(/\/terminal/, { timeout: 20_000 });
      await page.waitForTimeout(2000);
      const termAudit = await page.evaluate(() => ({
        url: location.href,
        tabLabel: document
          .querySelector(".ui-terminal-tab-active, [class*='tab']")
          ?.textContent?.trim()
          .slice(0, 40),
        hasAgentOutput: Boolean(document.querySelector(".xterm-rows, .xterm-screen")),
        bodyPreview: document.body.innerText.slice(0, 300),
      }));
      report.steps.push({ step: "terminal", audit: termAudit });
      report.shots.push(await shot(page, "04-terminal-cloud", "Terminal → Cloud"));
      if (
        !termAudit.url.includes(project) &&
        !termAudit.bodyPreview?.toLowerCase().includes(project)
      ) {
        note(
          "terminal-tab",
          "high",
          "Terminal Cloud did not focus fleetcrown agent session",
          "Deep-link tab= should open box-runner PTY for that project, not generic bash",
        );
      }
    }

    // ── 4. Projects — fleetcrown profile ──
    await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const fleetRow = page
      .locator(".ui-projects-row, article.ui-projects-card")
      .filter({ hasText: new RegExp(project, "i") })
      .first();
    if (await fleetRow.count()) await fleetRow.click();
    await page.waitForTimeout(1000);
    report.shots.push(await shot(page, "05-projects-fleetcrown", "Projects — fleetcrown detail"));
  } else {
    const hasDogfoodCredentials = Boolean(
      process.env.DOGFOOD_EMAIL && process.env.DOGFOOD_PASSWORD,
    );
    if (hasDogfoodCredentials) {
      context = await chromium.launch({
        headless,
        slowMo,
        executablePath: fs.existsSync("/usr/bin/google-chrome")
          ? "/usr/bin/google-chrome"
          : undefined,
      });
    } else {
      profileDir = copyBraveProfile();
      context = await chromium.launchPersistentContext(profileDir, {
        headless,
        slowMo,
        executablePath: fs.existsSync(BRAVE_BIN) ? BRAVE_BIN : undefined,
        channel: fs.existsSync(BRAVE_BIN) ? undefined : "chrome",
        viewport: { width: 1440, height: 900 },
      });
    }
    const page =
      "newPage" in context
        ? await context.newPage({ viewport: { width: 1440, height: 900 } })
        : (context.pages()[0] ?? (await context.newPage()));
    activePage = page;
    if (hasDogfoodCredentials) {
      await loginEmailPasswordIfConfigured(page, "/control");
      await waitForApp(page, 30_000);
    } else {
      await gotoPage(page, `${base}/control`);
      await waitForApp(page);
    }
    report.shots.push(await shot(page, "01-control-prod", "Prod Control"));
    report.steps.push({ step: "control", url: page.url() });

    await gotoPage(page, `${base}/loki?project=${encodeURIComponent(project)}`);
    await page.waitForSelector(".ui-loki-composer-input", { timeout: 60_000 });
    await page.waitForFunction(
      (name) =>
        document
          .querySelector(".ui-loki-scope-pill")
          ?.textContent?.trim()
          .toLowerCase()
          .includes(name),
      project.toLowerCase(),
      { timeout: 30_000 },
    );
    report.shots.push(await shot(page, "02-loki-prod", "Prod Loki scoped"));
    const sendResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/conversations\/[^/]+\/messages$/.test(new URL(res.url()).pathname),
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: "Move forward", exact: true }).click();
    const messageResponse = await sendResponse.catch(() => null);
    const gotDispatch =
      Boolean(messageResponse?.ok()) &&
      (await page
        .waitForSelector(".ui-loki-dispatch-card, .ui-loki-kind, .ui-error", { timeout: 30_000 })
        .then(() => true)
        .catch(() => false));
    await page.waitForTimeout(2000);
    let lokiAudit = { status: null, bubble: null };
    if (!gotDispatch) {
      const status = messageResponse
        ? `${messageResponse.status()} ${messageResponse.statusText()}`
        : "no response";
      note(
        "loki-send",
        "high",
        `Prod Loki send did not return a successful dispatch footer (${status})`,
        "Check /api/conversations messages route and dispatch resolver logs",
      );
      report.shots.push(await shot(page, "03-loki-timeout-prod", "Prod Loki timeout"));
    } else {
      lokiAudit = await page.evaluate(() => ({
        status: document
          .querySelector(".ui-loki-dispatch-card .ui-loki-dispatch-status span:nth-of-type(2)")
          ?.textContent?.trim(),
        bubble: document
          .querySelector(".ui-loki-bubble-assistant:last-of-type")
          ?.textContent?.trim()
          .slice(0, 200),
      }));
      report.shots.push(await shot(page, "03-loki-dispatch-prod", "Prod dispatch"));
    }
    report.steps.push({ step: "loki-dispatch", audit: lokiAudit });
    if (gotDispatch && /failed|error|unconfirmed|not sent/i.test(lokiAudit.status ?? "")) {
      note(
        "loki-dispatch-outcome",
        "high",
        `Prod Loki reported ${lokiAudit.status}`,
        "Fix the live dispatch path before calling dogfood successful",
      );
    }

    const cloud = page.getByRole("link", { name: /Cloud terminal/i });
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
        runnerConnected: d.runnerConnected ?? d.builderPresence?.any ?? null,
        builderPresence: d.builderPresence ?? null,
        runnerVersion: d.runnerVersion,
        fleetcrownState: fc?.stateKey ?? fc?.status ?? null,
      };
    });
    report.steps.push({ step: "control-api", audit: api });
    if (!api.runnerConnected)
      note(
        "presence",
        "high",
        "Control API reports no connected builder while box-runner may be up",
        "Check bridge SSE + userId on runner_presence",
      );
    if (lokiAudit.status?.includes("runs when the builder is online")) {
      note(
        "dispatch-copy",
        "medium",
        "Still showing offline copy on prod after f755b4f",
        "Verify runnerConnected passed in inject response",
      );
    }
  }

  report.weaknesses = weaknesses;
  report.shotDir = outDir;
  const dispatchStep = report.steps.find((step) => step.step === "loki-dispatch");
  const dispatchStatus = dispatchStep?.audit?.status ?? "";
  report.ok =
    Boolean(dispatchStep) &&
    !/(failed|error|unconfirmed|not sent)/i.test(dispatchStatus) &&
    !weaknesses.some((weakness) => weakness.severity === "high");
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { ok: report.ok, shotDir: outDir, weaknesses, steps: report.steps.map((s) => s.step) },
      null,
      2,
    ),
  );
  if (!report.ok) process.exitCode = 1;
} catch (err) {
  report.error = String(err?.stack ?? err);
  report.weaknesses = weaknesses;
  report.shotDir = outDir;
  try {
    if (activePage) report.shots.push(await shot(activePage, "99-failure", "Failure state"));
  } catch {}
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await closeContext();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
