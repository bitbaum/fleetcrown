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
const sessionToken = (process.env.FLEETCROWN_SESSION_TOKEN ?? process.env.COCKPIT_SESSION_TOKEN)?.trim();

const BRAVE_PROFILE =
  process.env.BRAVE_PROFILE ??
  path.join(process.env.HOME ?? "", ".config/BraveSoftware/Brave-Browser/Default");
const BRAVE_BIN =
  process.env.BRAVE_BIN ?? "/opt/brave.com/brave/brave";

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
      dispatchCard?.querySelector(".ui-loki-dispatch-status span:nth-of-type(2)")?.textContent?.trim() ?? "";
    const links = dispatchCard
      ? [...dispatchCard.querySelectorAll("a")].map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: a.getAttribute("href") ?? "",
        }))
      : [];
    const kind = document.querySelector(".ui-loki-kind")?.textContent?.trim() ?? null;
    const assistant = document.querySelector(".ui-loki-bubble-assistant:last-of-type")?.textContent?.trim().slice(0, 240) ?? "";
    return {
      url: location.href,
      title: document.title,
      kind,
      assistantPreview: assistant,
      dispatchLinks: links,
      dispatchStatus: statusText,
      scopePills: [...document.querySelectorAll(".ui-loki-scope-pill")].map((el) => el.textContent?.trim() ?? ""),
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
        name: "__Secure-authjs.session-token",
        value: sessionToken,
        domain: "fleetcrown.orangecat.ch",
        path: "/",
        secure: true,
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
  await page.goto(`${base}/loki`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAuthenticated(page);
  report.steps.push({ step: "authenticated", url: page.url() });

  await page.waitForSelector(".ui-loki-composer-input, .ui-empty-page", { timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Scope to target project (right pane on lg+).
  const projectBtn = page.locator(".ui-loki-project").filter({
    has: page.locator(".truncate", { hasText: new RegExp(projectNeedle, "i") }),
  });
  if (await projectBtn.count()) {
    await projectBtn.first().click();
    await page.waitForTimeout(400);
  } else {
    report.steps.push({ step: "project-not-found", needle: projectNeedle });
  }

  await page.getByRole("button", { name: "Move forward", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Send" }).click();

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
    cloudActive: Boolean(document.querySelector(".ui-chip-toggle-active")?.textContent?.includes("Cloud")),
    subtitle: document.querySelector(".ui-page-subtitle")?.textContent?.trim() ?? "",
  }));
  report.steps.push({ step: "terminal-cloud", audit: terminalAudit });
  await page.screenshot({ path: path.join(outDir, "02-terminal-cloud.png"), fullPage: false });

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

  report.ok =
    afterDispatch.kind === "Dispatched" &&
    afterDispatch.dispatchLinks.some((l) => l.href.includes("source=server")) &&
    !afterDispatch.dispatchStatus?.includes("runs when the builder is online") &&
    terminalAudit.url.includes("source=server");

  console.log(JSON.stringify(report, null, 2));
  console.log(`screenshots → ${outDir}`);
  if (!report.ok) process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
}
