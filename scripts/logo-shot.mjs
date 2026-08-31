import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const envLines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const pw = process.env.LOCAL_AUTH_PASSWORD;
const outDir = ".tmp/logo";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/sign-in?callbackUrl=/activity", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /owner key/i }).click();
await page.waitForTimeout(500);
await page.locator('input[type="password"]').first().fill(pw);
await page.getByRole("button", { name: /sign in as owner/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 15000 });
await page.waitForTimeout(1000);
// Crop to the sidebar logo area
await page.screenshot({ path: path.join(outDir, "full.png"), fullPage: false });
// Also a tight crop of the brand mark
const mark = await page.locator(".ui-brand-mark").first();
await mark.screenshot({ path: path.join(outDir, "mark.png") });
await browser.close();
console.log("done");
