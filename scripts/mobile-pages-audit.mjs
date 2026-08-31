/**
 * Mobile viewport audit — horizontal overflow, tiny tap targets, drawer UX.
 * Run: BASE=http://localhost:3001 node scripts/mobile-pages-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "mobile-pages-audit");
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

const ROUTES = [
  "/today",
  "/loki",
  "/control",
  "/projects",
  "/terminal",
  "/prompts",
  "/activity",
  "/system",
  "/settings",
  "/memory",
  "/people",
  "/crew",
  "/goals",
  "/habits",
  "/events",
  "/money",
  "/thoughts",
];

async function login(page) {
  await page.goto(`${base}/sign-in?callbackUrl=/today`, { waitUntil: "networkidle" });
  const ownerTab = page.getByRole("button", { name: /owner key/i });
  if (await ownerTab.count()) await ownerTab.click();
  if (!ownerPassword) throw new Error("LOCAL_AUTH_PASSWORD is not configured");
  await page.locator('input[type="password"]').first().fill(ownerPassword);
  await page
    .getByRole("button", { name: /sign in|continue|unlock/i })
    .last()
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30000 });
}

async function auditPage(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const scrollWidth = Math.max(document.body.scrollWidth, doc.scrollWidth);
    const overflow = scrollWidth > vw + 2;

    const smallTargets = [
      ...document.querySelectorAll("button,a,input,select,textarea,[role='button']"),
    ]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const label = (el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 60);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none";
        return { label, w: Math.round(rect.width), h: Math.round(rect.height), visible };
      })
      .filter((t) => t.visible && (t.w < 36 || t.h < 36))
      .slice(0, 15);

    const drawer = document.querySelector('[role="dialog"]');
    const drawerRect = drawer?.getBoundingClientRect();
    const mobileNav = document.querySelector(".ui-mobile-nav");
    const navRect = mobileNav?.getBoundingClientRect();

    return {
      url: location.pathname + location.search,
      title: document.title,
      overflow,
      scrollWidth,
      clientWidth: vw,
      scrollScreens: Number((doc.scrollHeight / vh).toFixed(2)),
      h1Count: document.querySelectorAll("h1").length,
      drawer: drawer
        ? {
            width: Math.round(drawerRect?.width ?? 0),
            height: Math.round(drawerRect?.height ?? 0),
            coversViewport: drawerRect
              ? drawerRect.width >= vw - 4 && drawerRect.height >= vh - 4
              : false,
            bodyScrollable: Boolean(document.querySelector(".ui-drawer-body")),
          }
        : null,
      navOverlapsDrawer:
        drawer && navRect && !document.body.classList.contains("fc-overlay-open")
          ? navRect.top < vh && drawerRect && drawerRect.bottom > navRect.top
          : false,
      smallTargets,
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
});

const report = { base, pages: [], projectsDrawer: null, failures: [] };

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await login(page);

  for (const route of ROUTES) {
    try {
      await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 45000 });
      await page.waitForTimeout(1500);
      const audit = await auditPage(page);
      await page.screenshot({
        path: path.join(outDir, `${route.replace(/^\//, "") || "home"}.png`),
        fullPage: false,
      });
      report.pages.push(audit);
      const flags = [
        audit.overflow ? "OVERFLOW" : null,
        audit.smallTargets.length ? `small(${audit.smallTargets.length})` : null,
        audit.h1Count > 1 ? `h1×${audit.h1Count}` : null,
      ].filter(Boolean);
      console.log(`${route.padEnd(12)} ${flags.length ? flags.join(" ") : "ok"}`);
    } catch (e) {
      report.failures.push({ route, error: String(e.message ?? e).slice(0, 120) });
      console.log(`${route.padEnd(12)} FAIL`);
    }
  }

  // Projects drawer deep dive
  await page.goto(`${base}/projects`, { waitUntil: "load", timeout: 45000 });
  await page.waitForSelector(".ui-projects-row, article.ui-projects-card", { timeout: 30000 });
  const row = page.locator(".ui-projects-row, article.ui-projects-card").first();
  await row.click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(outDir, "projects-drawer-overview.png"),
    fullPage: false,
  });

  const drawerAudit = await auditPage(page);
  drawerAudit.tab = "overview";

  // Switch tabs
  for (const tab of ["Prompts", "Goals"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${tab}`, "i") });
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(outDir, `projects-drawer-${tab.toLowerCase()}.png`),
        fullPage: false,
      });
    }
  }

  // Terminal expand on mobile
  await page.goto(`${base}/terminal`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1000);
  const expand = page.getByRole("button", { name: /expand terminal/i });
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, "terminal-expanded.png"), fullPage: false });
    report.terminalExpanded = await page.evaluate(() => ({
      fullscreenClass: document.body.classList.contains("fc-terminal-fullscreen"),
      navHidden: !document.querySelector(".ui-mobile-nav")?.offsetParent,
    }));
  }

  report.projectsDrawer = drawerAudit;
  await ctx.close();
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nreport → ${path.join(outDir, "report.json")}`);
console.log(`screenshots → ${outDir}`);

const problems = report.pages.filter((p) => p.overflow || p.smallTargets.length || p.h1Count > 1);
if (problems.length) {
  console.log(`\n${problems.length} page(s) with issues — see report.json`);
  process.exitCode = 0;
}
