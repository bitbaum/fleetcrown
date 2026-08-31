/**
 * Loki → dispatch → Terminal (Cloud) dogfood on prod.
 *
 * Reuses the operator's Brave profile (same logged-in session as the browser)
 * so OAuth on fleetcrown.orangecat.ch is not automated. Headed by default.
 *
 * Usage:
 *   node scripts/loki-dogfood.mjs
 *   BASE=https://fleetcrown.orangecat.ch PROJECT=fleetcrown node scripts/loki-dogfood.mjs
 *   HEADLESS=1 node scripts/loki-dogfood.mjs
 *
 * Optional: `FLEETCROWN_SESSION_TOKEN=<authjs token>` skips profile copy (`COCKPIT_SESSION_TOKEN` legacy).
 */
import fs, { cpSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "loki-dogfood");
fs.mkdirSync(outDir, { recursive: true });

const base = (process.env.BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");
const projectNeedle = (process.env.PROJECT ?? "fleetcrown").toLowerCase();
const headless = process.env.HEADLESS === "1";
const sessionToken = (
  process.env.FLEETCROWN_SESSION_TOKEN ?? process.env.COCKPIT_SESSION_TOKEN
)?.trim();
const sessionCookieName = base.startsWith("https://")
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

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

function copyBraveProfile() {
  const dest = mkdtempSync(path.join(tmpdir(), "fc-loki-dogfood-"));
  cpSync(BRAVE_PROFILE, dest, {
    recursive: true,
    filter: (src) => !src.endsWith("SingletonLock") && !src.endsWith("lockfile"),
  });
  return dest;
}

async function waitForAuthenticated(page, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes("/sign-in") && !url.includes("/sign-up")) {
      const composer = page.locator(".ui-loki-composer-input");
      if (await composer.count()) return;
      if (url.includes("/loki") || url.includes("/control") || url.includes("/today")) return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("Timed out waiting for sign-in — complete OAuth in the browser window.");
}

async function collectAudit(page) {
  return page.evaluate(() => {
    const dispatchCard = document.querySelector(".ui-loki-dispatch-card");
    const statusText =
      dispatchCard
        ?.querySelector(".ui-loki-dispatch-status span:nth-of-type(2)")
        ?.textContent?.trim() ?? "";
    const links = dispatchCard
      ? [...dispatchCard.querySelectorAll("a")].map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: a.getAttribute("href") ?? "",
        }))
      : [];
    const kind = document.querySelector(".ui-loki-kind")?.textContent?.trim() ?? null;
    const assistant =
      document
        .querySelector(".ui-loki-bubble-assistant:last-of-type")
        ?.textContent?.trim()
        .slice(0, 240) ?? "";
    return {
      url: location.href,
      title: document.title,
      kind,
      assistantPreview: assistant,
      dispatchLinks: links,
      dispatchStatus: statusText,
      scopePills: [...document.querySelectorAll(".ui-loki-scope-pill")].map(
        (el) => el.textContent?.trim() ?? "",
      ),
    };
  });
}

const report = {
  base,
  projectNeedle,
  startedAt: new Date().toISOString(),
  steps: [],
  ok: false,
};

let profileDir = null;
let context;

try {
  if (sessionToken) {
    context = await chromium.launchPersistentContext(path.join(outDir, "ephemeral-profile"), {
      headless,
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies([
      {
        name: sessionCookieName,
        value: sessionToken,
        url: base,
        secure: base.startsWith("https://"),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  } else {
    profileDir = copyBraveProfile();
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      executablePath: fs.existsSync(BRAVE_BIN) ? BRAVE_BIN : undefined,
      channel: fs.existsSync(BRAVE_BIN) ? undefined : "chrome",
      viewport: { width: 1440, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
  }

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${base}/loki?project=${encodeURIComponent(projectNeedle)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await waitForAuthenticated(page);
  report.steps.push({ step: "authenticated", url: page.url() });

  const smokePin = process.env.SMOKE_PRIVATE_PIN?.trim();
  if (smokePin) {
    const pinRes = await page.request.post(`${base}/api/auth/pin`, {
      data: { pin: smokePin },
    });
    if (pinRes.ok()) {
      report.steps.push({ step: "pin-unlocked" });
    }
  }

  await page.waitForSelector(".ui-loki-composer-input, .ui-empty-page", { timeout: 60_000 });
  await page.waitForTimeout(1500);

  await page.waitForFunction(
    (name) =>
      document
        .querySelector(".ui-loki-scope-pill")
        ?.textContent?.trim()
        .toLowerCase()
        .includes(name),
    projectNeedle,
    { timeout: 30_000 },
  );

  const dispatchResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /\/api\/conversations\/[^/]+\/messages$/.test(new URL(res.url()).pathname),
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Move forward", exact: true }).click();
  const messageResponse = await dispatchResponse;
  if (!messageResponse.ok()) {
    throw new Error(
      `Loki dispatch failed: ${messageResponse.status()} ${messageResponse.statusText()}`,
    );
  }

  await page.waitForSelector(".ui-loki-dispatch-card, .ui-loki-kind", { timeout: 120_000 });
  await page.waitForTimeout(2000);

  const afterDispatch = await collectAudit(page);
  report.steps.push({ step: "after-dispatch", audit: afterDispatch });
  await page.screenshot({ path: path.join(outDir, "01-loki-dispatch.png"), fullPage: false });

  const cloudLink = page.getByRole("link", { name: /Cloud terminal/i });
  if (!(await cloudLink.count())) {
    throw new Error("Dispatch bubble missing “Cloud terminal” link");
  }

  await cloudLink.first().click();
  await page.waitForURL(/\/terminal/, { timeout: 30_000 });
  await page.waitForTimeout(2000);

  const terminalAudit = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    cloudActive: Boolean(
      document.querySelector(".ui-chip-toggle-active")?.textContent?.includes("Cloud"),
    ),
    subtitle: document.querySelector(".ui-page-subtitle")?.textContent?.trim() ?? "",
  }));
  report.steps.push({ step: "terminal-cloud", audit: terminalAudit });
  await page.screenshot({ path: path.join(outDir, "02-terminal-cloud.png"), fullPage: false });

  await page.getByRole("button", { name: "This computer", exact: true }).click();
  await page.waitForTimeout(2000);

  const machineAudit = await page.evaluate(() => {
    const toggles = [...document.querySelectorAll(".ui-chip-toggle, .ui-chip-toggle-active")];
    const machineActive = toggles.some(
      (el) =>
        el.textContent?.includes("This computer") && el.classList.contains("ui-chip-toggle-active"),
    );
    const visiblePane = [...document.querySelectorAll(".absolute.inset-0")].find(
      (el) => !el.classList.contains("hidden"),
    );
    // The empty state renders in normal flow (not inside the absolute pane),
    // and a machine tab with no live agent shows a bracket notice inside the
    // terminal view — accept evidence from either place.
    const emptyText = document.querySelector(".ui-empty-page")?.textContent?.trim() ?? "";
    const bodyText = (document.body.innerText || "").slice(0, 8000);
    const hasNoAgentNotice = bodyText.includes("no live agent in");
    const hasPane = Boolean(
      (visiblePane ?? document).querySelector(".ui-term-pane-active, .xterm"),
    );
    return {
      url: location.href,
      machineActive,
      emptyText: emptyText.slice(0, 200),
      hasPane,
      hasNoAgentNotice,
      hasErrorBoundary: document.body.textContent?.includes("Something went wrong") ?? false,
    };
  });
  report.steps.push({ step: "terminal-machine", audit: machineAudit });
  await page.screenshot({ path: path.join(outDir, "03-terminal-machine.png"), fullPage: false });

  const controlProbe = await page.evaluate(async () => {
    const res = await fetch("/api/control");
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return {
      ok: true,
      runnerConnected: data.runnerConnected,
      runnerVersion: data.runnerVersion ?? null,
      queueDepth: Array.isArray(data.queue) ? data.queue.length : null,
    };
  });
  report.steps.push({ step: "control-api", audit: controlProbe });

  const machineShellOk =
    machineAudit.machineActive &&
    !machineAudit.hasErrorBoundary &&
    (machineAudit.hasPane ||
      machineAudit.hasNoAgentNotice ||
      machineAudit.emptyText.includes("No agents on this computer") ||
      machineAudit.emptyText.includes("Fleet Runner"));

  report.ok =
    afterDispatch.kind === "Dispatched" &&
    afterDispatch.dispatchLinks.some((l) => l.href.includes("source=server")) &&
    afterDispatch.dispatchLinks.some((l) => l.href.includes("source=machine")) &&
    !/(failed|error|unconfirmed|not sent)/i.test(afterDispatch.dispatchStatus ?? "") &&
    !afterDispatch.dispatchStatus?.includes("runs when the builder is online") &&
    terminalAudit.url.includes("source=server") &&
    machineShellOk;

  console.log(JSON.stringify(report, null, 2));
  console.log(`screenshots → ${outDir}`);
  if (!report.ok) process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
}
