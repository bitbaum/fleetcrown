import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "projects-tour");
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

const base = process.env.BASE ?? "http://localhost:3001";
const ownerPassword = process.env.LOCAL_AUTH_PASSWORD;

async function login(page) {
  await page.goto(`${base}/sign-in?callbackUrl=/projects`, { waitUntil: "networkidle" });
  const ownerTab = page.getByRole("button", { name: /owner key/i });
  if (await ownerTab.count()) await ownerTab.click();
  if (!ownerPassword) throw new Error("LOCAL_AUTH_PASSWORD is not configured");
  await page.locator('input[type="password"]').first().fill(ownerPassword);
  await page.getByRole("button", { name: /sign in|continue|unlock/i }).last().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20000 });
}

async function collectPageAudit(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const headings = [...document.querySelectorAll("h1,h2,h3")].map((el) => ({
      level: el.tagName,
      text: el.textContent?.trim().slice(0, 80) ?? "",
    }));
    const filterChips = [...document.querySelectorAll(".ui-projects-filter-chip")].map((el) => ({
      text: el.textContent?.trim().replace(/\s+/g, " ") ?? "",
      pressed: el.getAttribute("aria-pressed") === "true",
    }));
    const listRows = document.querySelectorAll(".ui-projects-row").length;
    const attentionCards = document.querySelectorAll("article.ui-projects-card").length;
    const sections = [...document.querySelectorAll(".ui-projects-section-label")].map((el) => el.textContent?.trim() ?? "");
    const cards = [...document.querySelectorAll("article.ui-projects-card")].slice(0, 5).map((el) => ({
      name: el.querySelector("h3")?.textContent?.trim() ?? "",
      hasNextStep: Boolean(el.querySelector(".ui-projects-next-step")),
      actions: [...el.querySelectorAll(".ui-projects-card-action")].map((a) => a.textContent?.trim()).filter(Boolean),
      attention: el.classList.contains("ui-projects-card-attention"),
    }));
    const statCards = [...document.querySelectorAll(".ui-stat-card, [class*='StatCard']")].map((el) => ({
      label: el.querySelector("[class*='label'], .text-text-tertiary")?.textContent?.trim().slice(0, 40) ?? "",
      value: el.querySelector("[class*='value'], .text-2xl, .text-xl")?.textContent?.trim() ?? "",
    }));
    const ciPanel = document.querySelector(".ui-projects-ci-panel");
    const searchInput = document.querySelector('input[aria-label="Search projects"]');
    const scrollWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
    const overflow = scrollWidth > vw + 2;

    return {
      title: document.title,
      url: location.pathname,
      subtitle: document.querySelector(".ui-page-subtitle")?.textContent?.trim() ?? "",
      headings,
      statCards,
        filterChips,
        sections,
        listRows,
        attentionCards,
        flatCardCount: attentionCards,
      cardsSample: cards,
      ciPanel: {
        present: Boolean(ciPanel),
        open: ciPanel?.open ?? false,
        summary: ciPanel?.querySelector(".ui-projects-ci-summary")?.textContent?.trim().replace(/\s+/g, " ") ?? "",
      },
      search: {
        present: Boolean(searchInput),
        placeholder: searchInput?.getAttribute("placeholder") ?? "",
        countBadge: searchInput?.closest(".relative")?.querySelector(".ui-badge")?.textContent?.trim() ?? "",
      },
      footerHint: document.querySelector("p.text-center.text-xs")?.textContent?.trim().replace(/\s+/g, " ") ?? "",
      overflow,
      scrollWidth,
      clientWidth: vw,
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
});

const report = { base, steps: [] };

try {
  for (const vp of [
    { tag: "desktop", width: 1440, height: 900, isMobile: false },
    { tag: "mobile", width: 390, height: 844, isMobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(`${base}/projects`, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector("article.ui-projects-card, .ui-empty-page", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const initial = await collectPageAudit(page);
    await page.screenshot({ path: path.join(outDir, `${vp.tag}-01-initial.png`), fullPage: false });
    await page.screenshot({ path: path.join(outDir, `${vp.tag}-01-initial-full.png`), fullPage: true });
    report.steps.push({ viewport: vp.tag, step: "initial", audit: initial });

    // Filter: Need attention
    const attentionChip = page.getByRole("button", { name: /^Attention/i });
    if (await attentionChip.count()) {
      await attentionChip.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${vp.tag}-02-attention-filter.png`), fullPage: false });
      report.steps.push({
        viewport: vp.tag,
        step: "attention-filter",
        audit: await collectPageAudit(page),
      });
      await attentionChip.click();
    }

    // Search
    const search = page.locator('input[aria-label="Search projects"]');
    await search.fill("fleet");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${vp.tag}-03-search-fleet.png`), fullPage: false });
    report.steps.push({
      viewport: vp.tag,
      step: "search-fleet",
      audit: await collectPageAudit(page),
    });
    await search.fill("");
    await page.waitForTimeout(300);

    // Open first card drawer
    const firstRow = page.locator(".ui-projects-row, article.ui-projects-card").first();
    if (await firstRow.count()) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      const drawerOpen = await page.locator('[role="dialog"], [data-drawer]').count();
      await page.screenshot({ path: path.join(outDir, `${vp.tag}-04-drawer.png`), fullPage: false });
      report.steps.push({
        viewport: vp.tag,
        step: "drawer",
        drawerOpen,
        projectName: await firstRow.locator(".truncate, h3").first().textContent(),
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // Expand CI panel
    const ciSummary = page.locator(".ui-projects-ci-panel summary");
    if (await ciSummary.count()) {
      await ciSummary.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${vp.tag}-05-ci-open.png`), fullPage: false });
      report.steps.push({
        viewport: vp.tag,
        step: "ci-open",
        audit: await collectPageAudit(page),
      });
    }

    await ctx.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`screenshots → ${outDir}`);
