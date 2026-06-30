import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();

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

const base = process.env.BASE ?? "http://localhost:3000";
const ownerPassword = process.env.LOCAL_AUTH_PASSWORD;
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const outDir = path.join(root, ".tmp", "activity-ssot-check");
fs.mkdirSync(outDir, { recursive: true });

async function login(page, callbackUrl = "/control") {
  await page.goto(`${base}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`, { waitUntil: "networkidle" });
  if (page.url().includes("/sign-in")) {
    const ownerTab = page.getByRole("button", { name: /owner key/i });
    if (await ownerTab.count()) await ownerTab.click();
    if (!ownerPassword) throw new Error("LOCAL_AUTH_PASSWORD is not configured");
    await page.locator('input[type="password"]').first().fill(ownerPassword);
    await page.getByRole("button", { name: /sign in|continue|unlock/i }).last().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 15000 });
  }
}

async function fetchJson(page, url, options) {
  return page.evaluate(async ({ url, options }) => {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* caller gets raw text */ }
    return { ok: res.ok, status: res.status, json, text };
  }, { url, options });
}

async function waitForControlPrompt(page, projectTab, token) {
  const deadline = Date.now() + 15000;
  let last = null;
  while (Date.now() < deadline) {
    const res = await fetchJson(page, "/api/control");
    if (!res.ok) throw new Error(`/api/control failed: ${res.status} ${res.text.slice(0, 300)}`);
    last = res.json;
    const recent = last.recentActivity ?? [];
    const project = (last.projects ?? []).find((p) => p.tab === projectTab);
    const inRecent = recent.some((item) => item.displayText?.includes(token));
    const inProject = project?.recentActivity?.some(
      (item) => item.title?.includes(token) || item.detail?.includes(token),
    );
    if (inRecent && inProject) return { control: last, project };
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for prompt ${token} in /api/control; last payload keys=${Object.keys(last ?? {}).join(",")}`);
}

async function clickVisibleActivityToggles(page) {
  const labels = [/recent activity/i, /^activity/i];
  for (const label of labels) {
    const buttons = page.getByRole("button", { name: label });
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => {});
        await page.waitForTimeout(100);
      }
    }
  }
}

async function assertBodyContains(page, token, context) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    token,
    { timeout: 15000 },
  ).catch(async () => {
    await page.screenshot({ path: path.join(outDir, `${context}.png`), fullPage: true });
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    throw new Error(`${context} did not render ${token}. Body sample: ${body.slice(0, 500)}`);
  });
}

const browser = await chromium.launch({ headless: true, executablePath: chromePath });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await login(page);

  const controlRes = await fetchJson(page, "/api/control");
  if (!controlRes.ok) throw new Error(`/api/control initial failed: ${controlRes.status} ${controlRes.text.slice(0, 300)}`);
  const projects = controlRes.json.projects ?? [];
  const project = projects.find((p) => p.tab && p.dir && !p.readonly) ?? projects.find((p) => p.tab && p.dir);
  if (!project) throw new Error("No project with tab+dir found in /api/control");

  const token = `ssot-check-${Date.now()}`;
  const prompt = `Activity SSOT browser regression ${token}: verify Recent Activity, Sent Prompts, and Activity page share one prompt display model.`;
  const captureRes = await fetchJson(page, "/api/activity/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, cwd: project.dir, projectKey: project.tab }),
  });
  if (!captureRes.ok) throw new Error(`/api/activity/capture failed: ${captureRes.status} ${captureRes.text.slice(0, 300)}`);

  await waitForControlPrompt(page, project.tab, token);

  await page.goto(`${base}/control`, { waitUntil: "load" });
  await clickVisibleActivityToggles(page);
  await assertBodyContains(page, token, "control");
  await page.screenshot({ path: path.join(outDir, "control.png"), fullPage: false });

  await page.goto(`${base}/activity?window=hour&density=detailed`, { waitUntil: "load" });
  await assertBodyContains(page, token, "activity-hour");
  await page.screenshot({ path: path.join(outDir, "activity-hour.png"), fullPage: false });

  const mobile = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/activity?window=hour&density=detailed`, { waitUntil: "load" });
  await assertBodyContains(mobilePage, token, "activity-mobile");
  await mobilePage.screenshot({ path: path.join(outDir, "activity-mobile.png"), fullPage: false });
  await mobile.close();

  console.log(`activity SSOT browser check passed for ${project.tab}: ${token}`);
} finally {
  await browser.close();
}
