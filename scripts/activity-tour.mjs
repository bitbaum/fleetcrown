import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const envLines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const ownerPassword = process.env.LOCAL_AUTH_PASSWORD;
const base = "http://localhost:3000";
const outDir = path.join(process.cwd(), ".tmp", "activity-tour");
fs.mkdirSync(outDir, { recursive: true });

async function login(page) {
  await page.goto(`${base}/sign-in?callbackUrl=/activity`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /owner key/i }).click();
  await page.waitForTimeout(600);
  await page.locator('input[type="password"]').first().fill(ownerPassword);
  await page.getByRole("button", { name: /sign in as owner/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 15000 });
}

// Tour the populated state: month window has 112 prompts across 6 active projects.
const SHOTS = [
  { name: "1-month-compact",            url: "/activity?window=month" },
  { name: "2-month-detailed",           url: "/activity?window=month&density=detailed" },
  { name: "3-month-revampit-detailed",  url: "/activity?window=month&project=revamp-it&density=detailed" },
  { name: "4-month-orangecat-compact",  url: "/activity?window=month&project=OrangeCat" },
];

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await login(page);
  await ctx.storageState({ path: path.join(outDir, "storage.json") });
  await ctx.close();

  for (const viewport of [
    { tag: "desktop", width: 1440, height: 900, isMobile: false },
    { tag: "mobile",  width: 390,  height: 844, isMobile: true  },
  ]) {
    const c = await browser.newContext({
      storageState: path.join(outDir, "storage.json"),
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      deviceScaleFactor: 1,
    });
    const p = await c.newPage();
    for (const shot of SHOTS) {
      await p.goto(`${base}${shot.url}`, { waitUntil: "load", timeout: 20000 });
      await p.waitForTimeout(1500);
      // Cap height for chat readability — first viewport, not full-page.
      await p.screenshot({ path: path.join(outDir, `${viewport.tag}-${shot.name}.png`), fullPage: false });
    }
    await c.close();
  }
} finally {
  await browser.close();
}
console.log("done");
