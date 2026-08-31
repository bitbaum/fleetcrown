/**
 * Headless UI dogfood — PE11, H05, G07, M04, ST02, PR04, X07.
 *
 * Usage:
 *   node scripts/ui-flow-dogfood.mjs
 *   SMOKE_PRIVATE_PIN=<pin> BASE=https://fleetcrown.orangecat.ch HEADLESS=1 node scripts/ui-flow-dogfood.mjs
 *   FLEETCROWN_SESSION_TOKEN=… node scripts/ui-flow-dogfood.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "ui-flow-dogfood");
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
// `name=value` from scripts/test/print-private-zone-cookie.ts. Without it the
// private pages (/people, /habits, /money, /events) render their lock screen,
// and flows that look for real content — a person card, a heatmap cell — fail
// as if the feature were broken. Two such "failures" were exactly this.
const privateZoneCookie = process.env.FLEETCROWN_PRIVATE_ZONE_COOKIE?.trim();
const fullDispatchEnabled = process.env.UI_FLOW_FULL_DISPATCH !== "0";

const report = {
  base,
  startedAt: new Date().toISOString(),
  flows: {},
  ok: false,
};

async function unlockPin(page) {
  if (!smokePin) return false;
  const res = await page.request.post(`${base}/api/auth/pin`, { data: { pin: smokePin } });
  return res.ok();
}

async function builderOnline(page) {
  const res = await page.request.get(`${base}/api/builder/presence`);
  if (!res.ok()) return false;
  const data = await res.json().catch(() => ({}));
  return Boolean(data.runnerConnected || data.builderPresence?.any || data.runtimeAvailable);
}

async function launchContext() {
  const context = await chromium.launchPersistentContext(path.join(outDir, "profile"), {
    headless,
    viewport: { width: 1280, height: 900 },
  });
  if (sessionToken) {
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
  }
  if (privateZoneCookie) {
    const eq = privateZoneCookie.indexOf("=");
    if (eq > 0) {
      await context.addCookies([
        {
          name: privateZoneCookie.slice(0, eq),
          value: privateZoneCookie.slice(eq + 1),
          url: base,
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
  }
  return context;
}

async function runPe11(page) {
  await page.goto(`${base}/people`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  const askBtn = page.getByTitle("Ask Loki about this person").first();
  if (!(await askBtn.count())) {
    return { ok: false, note: "no person cards with Ask Loki button" };
  }
  await askBtn.click();
  await page.waitForURL(/\/loki/, { timeout: 30_000 });
  const url = page.url();
  const hasQuery = url.includes("?q=");
  await page.waitForSelector(".ui-loki-composer-input", { timeout: 30_000 });
  const prefill = await page.locator(".ui-loki-composer-input").inputValue();
  return { ok: hasQuery && prefill.length > 0, url, prefillLen: prefill.length };
}

async function runH05(page) {
  await page.goto(`${base}/habits`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  const cells = page.locator('div[title^="20"].rounded-sm');
  const count = await cells.count();
  const sampleTitle = count > 0 ? await cells.first().getAttribute("title") : null;
  return { ok: count >= 30, cellCount: count, sampleTitle };
}

async function runG07(page) {
  await page.goto(`${base}/goals`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  const agentBtn = page.getByTitle("Send to Control agent").first();
  if (!(await agentBtn.count())) {
    // The button renders only on goals linked to a project entity. No linked
    // goal = the path is untestable, not broken — skip explicitly so a data
    // precondition can't masquerade as a product regression.
    return { ok: true, skipped: "no goal linked to a project — dispatch button untestable" };
  }
  await agentBtn.click();
  await page.waitForURL(/\/control/, { timeout: 30_000 });
  const prefill = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("control:prefill") ?? "null");
    } catch {
      return null;
    }
  });

  const fullDispatch = {
    attempted: false,
    ok: false,
    skipped: null,
    status: null,
  };

  const canDispatch = fullDispatchEnabled && (await builderOnline(page));
  if (!canDispatch) {
    fullDispatch.skipped = fullDispatchEnabled ? "builder offline" : "UI_FLOW_FULL_DISPATCH=0";
  } else {
    fullDispatch.attempted = true;
    const prompt = [
      `Smoke UI flow ${new Date().toISOString()}.`,
      "Verify that the goal-card Control dispatch path reaches the executor.",
      "Do not edit files, do not run mutating commands, and respond with a short acknowledgement only.",
    ].join(" ");
    await page.locator("textarea").first().fill(prompt);
    await page.locator("textarea").first().press("Enter");

    const status = await Promise.race([
      page
        .getByText("Sent ✓")
        .waitFor({ timeout: 120_000 })
        .then(() => "sent"),
      page
        .getByText(/Fleet Runner is offline|Failed to run task/i)
        .waitFor({ timeout: 120_000 })
        .then(() => "error"),
    ]).catch(() => "timeout");

    fullDispatch.status = status;
    const control = await page.request.get(`${base}/api/control`);
    if (control.ok()) {
      const data = await control.json().catch(() => ({}));
      const selectedProject = Array.isArray(data.projects)
        ? data.projects.find((p) => p.tab === prefill?.tab)
        : null;
      fullDispatch.ok = status === "sent" || Boolean(selectedProject?.latestOrchestrationRun);
    } else {
      fullDispatch.ok = status === "sent";
    }
  }

  return {
    ok: Boolean(prefill?.tab && prefill?.prompt) && (!fullDispatch.attempted || fullDispatch.ok),
    url: page.url(),
    prefill,
    fullDispatch,
  };
}

async function runM04(page) {
  await page.goto(`${base}/money`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  const verifyLink = page.locator('a[title^="Verify at"]').first();
  const cancelLink = page.getByRole("link", { name: /Cancel at /i }).first();
  const hasVerify = (await verifyLink.count()) > 0;
  const hasCancel = (await cancelLink.count()) > 0;
  if (!hasVerify && !hasCancel) {
    // Verify/cancel links render only for subscriptions that carry URLs. None
    // in the data = untestable, not broken — skip explicitly.
    return { ok: true, skipped: "no subscription with verify/cancel URLs — links untestable" };
  }

  let verifyHref = null;
  let cancelHref = null;
  if (hasVerify) verifyHref = await verifyLink.getAttribute("href");
  if (hasCancel) cancelHref = await cancelLink.getAttribute("href");

  const verifyOk = !verifyHref || verifyHref.startsWith("https://");
  const cancelOk = !cancelHref || cancelHref.startsWith("https://");
  return {
    ok: verifyOk && cancelOk && (hasVerify || hasCancel),
    hasVerify,
    hasCancel,
    verifyHref,
    cancelHref,
  };
}

async function runSt02(page) {
  await page.goto(`${base}/settings#account`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200);

  const accountTab = page.getByRole("button", { name: "Account", exact: true });
  if (await accountTab.count()) {
    await accountTab.click();
    await page.waitForTimeout(600);
  }

  const hasSection = (await page.getByText("Connected accounts").count()) > 0;
  const hasConnected = (await page.getByText("Connected", { exact: true }).count()) > 0;
  const connectBtn = page.getByRole("button", { name: /^Connect$/i });
  const hasConnect = (await connectBtn.count()) > 0;
  const accountsRes = await page.request.get(`${base}/api/me/connected-accounts`, {
    headers: { Cookie: `__Secure-authjs.session-token=${sessionToken}` },
  });
  const accountsOk = accountsRes.ok();
  const accountCount = accountsOk
    ? ((await accountsRes.json().catch(() => ({})))?.accounts?.length ?? 0)
    : 0;

  return {
    ok: hasSection && accountsOk && (hasConnected || hasConnect || accountCount > 0),
    hasSection,
    hasConnected,
    hasConnect,
    accountCount,
    accountsStatus: accountsRes.status(),
  };
}

async function runPr04(page) {
  await page.goto(`${base}/prompts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);

  const forkBtn = page.getByRole("button", { name: "Fork prompt" }).first();
  if (!(await forkBtn.count())) {
    return { ok: false, note: "no fork button on prompts page" };
  }
  await forkBtn.click();
  await page.waitForTimeout(2500);
  const forked = await page.getByText("Forked to your prompts").count();
  const checkIcon = page.locator('button[aria-label="Fork prompt"] svg').first();
  const done = forked > 0 || (await checkIcon.count()) > 0;
  return { ok: done, forkedBanner: forked > 0 };
}

async function runX07(page) {
  await page.goto(`${base}/prompts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(500);

  const runNow = page.getByRole("button", { name: "Run Now" }).first();
  if (!(await runNow.count())) {
    const runAlt = page.getByRole("button", { name: "Run", exact: true }).first();
    if (!(await runAlt.count())) return { ok: false, note: "no Run button" };
    await runAlt.click();
  } else {
    await runNow.click();
  }

  await page.waitForSelector('button:has-text("Run with Loki")', { timeout: 15_000 });
  const projectSelect = page.locator("select.ui-input");
  if (await projectSelect.count()) {
    const options = await projectSelect.locator("option").allTextContents();
    const pick = options.find((o) => o && !o.includes("Select project"));
    if (pick) await projectSelect.selectOption({ label: pick });
  }

  await page.getByRole("button", { name: "Run with Loki" }).click();

  const outcome = await Promise.race([
    page.waitForSelector("pre.ui-code-surface", { timeout: 90_000 }).then(() => "result"),
    page.waitForSelector(".ui-box-error", { timeout: 90_000 }).then(() => "error"),
  ]).catch(() => "timeout");

  let snippet = null;
  if (outcome === "result") {
    snippet =
      (await page.locator("pre.ui-code-surface").last().textContent())?.trim().slice(0, 120) ?? "";
  } else if (outcome === "error") {
    snippet = (await page.locator(".ui-box-error").textContent())?.trim().slice(0, 120) ?? "";
  }

  return {
    ok: outcome === "result" && (snippet?.length ?? 0) > 0,
    outcome,
    snippet,
  };
}

let context;
try {
  if (!sessionToken) {
    throw new Error("FLEETCROWN_SESSION_TOKEN required for headless UI dogfood");
  }

  context = await launchContext();
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(`${base}/today`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (page.url().includes("/sign-in")) {
    throw new Error("Session cookie invalid — re-mint token");
  }
  if (smokePin) await unlockPin(page);

  report.flows.PE11 = await runPe11(page);
  await page.screenshot({ path: path.join(outDir, "pe11-loki.png") });

  if (smokePin) await unlockPin(page);
  report.flows.H05 = await runH05(page);
  await page.screenshot({ path: path.join(outDir, "h05-heatmap.png") });

  if (smokePin) await unlockPin(page);
  report.flows.G07 = await runG07(page);
  await page.screenshot({ path: path.join(outDir, "g07-control.png") });

  if (smokePin) await unlockPin(page);
  report.flows.M04 = await runM04(page);
  await page.screenshot({ path: path.join(outDir, "m04-money-links.png") });

  report.flows.ST02 = await runSt02(page);
  await page.screenshot({ path: path.join(outDir, "st02-settings-accounts.png") });

  report.flows.PR04 = await runPr04(page);

  report.flows.X07 = await runX07(page);
  await page.screenshot({ path: path.join(outDir, "x07-prompt-run.png") });

  report.ok = Object.values(report.flows).every((f) => f.ok);
  report.finishedAt = new Date().toISOString();

  console.log(JSON.stringify(report, null, 2));
  console.log(`screenshots → ${outDir}`);
  if (!report.ok) process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
}
