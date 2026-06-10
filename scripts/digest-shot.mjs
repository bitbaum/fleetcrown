import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const envLines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const pw = process.env.LOCAL_AUTH_PASSWORD;
const outDir = ".tmp/activity-tour";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/sign-in?callbackUrl=/activity?window=month", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /owner key/i }).click();
await page.waitForTimeout(600);
await page.locator('input[type="password"]').first().fill(pw);
await page.getByRole("button", { name: /sign in as owner/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 15000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /generate report/i }).click();
// Wait for digest to render (Groq call typically <5s)
await page.waitForSelector("text=/Headline|Per project/", { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, "desktop-with-digest.png"), fullPage: false });
await browser.close();
console.log("done");
