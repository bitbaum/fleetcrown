/**
 * Fleet Runner / This computer dogfood — X05 full path when local builder is online.
 *
 * Skips cleanly (exit 0) when no desktop Fleet Runner is connected.
 *
 * Usage:
 *   node scripts/machine-dogfood.mjs
 *   SMOKE_PRIVATE_PIN=<pin> FLEETCROWN_SESSION_TOKEN=… HEADLESS=1 node scripts/machine-dogfood.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "machine-dogfood");
fs.mkdirSync(outDir, { recursive: true });

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

const base = (process.env.BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");
const headless = process.env.HEADLESS !== "0";
const sessionToken = (
  process.env.FLEETCROWN_SESSION_TOKEN ?? process.env.COCKPIT_SESSION_TOKEN
)?.trim();
const smokePin = process.env.SMOKE_PRIVATE_PIN?.trim();
const force = process.env.DOGFOOD_MACHINE_FORCE === "1";

const report = {
  base,
  startedAt: new Date().toISOString(),
  skipped: null,
  steps: [],
  ok: false,
};

function cookieHeader() {
  return `__Secure-authjs.session-token=${sessionToken}`;
}

async function unlockPin(request) {
  if (!smokePin) return false;
  const res = await request.post(`${base}/api/auth/pin`, { data: { pin: smokePin } });
  return res.ok();
}

async function main() {
  if (!sessionToken) {
    throw new Error("FLEETCROWN_SESSION_TOKEN required for machine dogfood");
  }

  const context = await chromium.launchPersistentContext(path.join(outDir, "profile"), {
    headless,
    viewport: { width: 1280, height: 900 },
  });

  try {
    await context.addCookies([
      {
        name: "__Secure-authjs.session-token",
        value: sessionToken,
        url: base,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const request = context.request;
    await unlockPin(request);

    const presenceRes = await request.get(`${base}/api/builder/presence`, {
      headers: { Cookie: cookieHeader() },
    });
    const presence = presenceRes.ok() ? await presenceRes.json() : null;
    const localOnline = Boolean(presence?.builderPresence?.local);
    report.steps.push({ step: "builder-presence", audit: presence });

    if (!localOnline) {
      report.skipped = "no local Fleet Runner connected";
      report.ok = !force;
      console.log(JSON.stringify(report, null, 2));
      if (force) process.exitCode = 1;
      return;
    }

    const tabsRes = await request.get(`${base}/api/control/open-tabs?channel=local`, {
      headers: { Cookie: cookieHeader() },
    });
    const tabsBody = tabsRes.ok() ? await tabsRes.json() : { tabs: [] };
    const tabs = Array.isArray(tabsBody.tabs) ? tabsBody.tabs : [];
    report.steps.push({
      step: "open-tabs-local",
      audit: { status: tabsRes.status(), tabs, unavailable: tabsBody.unavailable ?? null },
    });

    if (tabs.length > 0) {
      const tab = tabs[0];
      try {
        const peekRes = await fetch(
          `${base}/api/control/peek-stream?tab=${encodeURIComponent(tab)}&channel=local`,
          {
            headers: { Cookie: cookieHeader() },
            signal: AbortSignal.timeout(4000),
          },
        );
        report.steps.push({
          step: "peek-stream-local",
          audit: { status: peekRes.status, tab, ok: [200, 403].includes(peekRes.status) },
        });
        await peekRes.body?.cancel();
      } catch {
        report.steps.push({
          step: "peek-stream-local",
          audit: { status: 0, tab, ok: true, note: "SSE timeout ok" },
        });
      }
    }

    const page = context.pages()[0] ?? (await context.newPage());
    const tab = tabs[0] ?? "fleetcrown";
    await page.goto(`${base}/terminal?source=machine&tab=${encodeURIComponent(tab)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);

    const terminalAudit = await page.evaluate(() => {
      const toggles = [...document.querySelectorAll(".ui-chip-toggle, .ui-chip-toggle-active")];
      const machineActive = toggles.some(
        (el) =>
          el.textContent?.includes("This computer") &&
          el.classList.contains("ui-chip-toggle-active"),
      );
      const visiblePane = [...document.querySelectorAll(".absolute.inset-0")].find(
        (el) => !el.classList.contains("hidden"),
      );
      const tabButtons = visiblePane
        ? [...visiblePane.querySelectorAll("button")]
            .map((b) => b.textContent?.trim() ?? "")
            .filter(Boolean)
        : [];
      return {
        url: location.href,
        machineActive,
        hasXterm: Boolean(visiblePane?.querySelector(".xterm")),
        hasPane: Boolean(visiblePane?.querySelector(".ui-term-pane-active")),
        tabButtons: tabButtons.slice(0, 8),
        hasErrorBoundary: document.body.textContent?.includes("Something went wrong") ?? false,
      };
    });
    report.steps.push({ step: "terminal-machine-ui", audit: terminalAudit });
    await page.screenshot({ path: path.join(outDir, "terminal-machine.png"), fullPage: false });

    report.ok =
      terminalAudit.machineActive &&
      !terminalAudit.hasErrorBoundary &&
      (terminalAudit.hasXterm || terminalAudit.hasPane || tabs.length > 0);
    report.finishedAt = new Date().toISOString();

    console.log(JSON.stringify(report, null, 2));
    console.log(`screenshots → ${outDir}`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
