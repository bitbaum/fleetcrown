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

const base = process.env.BASE ?? "http://127.0.0.1:3001";
const ownerPassword = process.env.LOCAL_AUTH_PASSWORD;
const dogfoodEmail = process.env.DOGFOOD_EMAIL;
const dogfoodPassword = process.env.DOGFOOD_PASSWORD;
const isLocal = base.includes("localhost") || base.includes("127.0.0.1");

const allViewports = [
  { tag: "mobile-320", width: 320, height: 700, isMobile: true },
  { tag: "mobile-390", width: 390, height: 844, isMobile: true },
  { tag: "tablet", width: 768, height: 1024, isMobile: false },
  { tag: "desktop", width: 1440, height: 1000, isMobile: false },
];
const requestedViewports = new Set((process.env.VIEWPORTS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const viewports = requestedViewports.size
  ? allViewports.filter((viewport) => requestedViewports.has(viewport.tag))
  : allViewports;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(page) {
  await page.goto(`${base}/sign-in?callbackUrl=/projects`, { waitUntil: "domcontentloaded" });
  if (isLocal) {
    const ownerTab = page.getByRole("button", { name: /owner key/i });
    await ownerTab.waitFor({ state: "visible", timeout: 30_000 });
    for (let attempt = 0; attempt < 4; attempt++) {
      await ownerTab.click();
      if (await page.locator("#owner-password").isVisible()) break;
      await page.waitForTimeout(500);
    }
    if (!ownerPassword) throw new Error("LOCAL_AUTH_PASSWORD is not configured");
    await page.locator("#owner-password").fill(ownerPassword);
    await page.getByRole("button", { name: /sign in as owner/i }).click();
  } else {
    if (!dogfoodEmail || !dogfoodPassword) {
      throw new Error("DOGFOOD_EMAIL and DOGFOOD_PASSWORD are required for a production tour");
    }
    await page.locator('input[type="email"]').first().fill(dogfoodEmail);
    await page.locator('input[type="password"]').first().fill(dogfoodPassword);
    await page.getByRole("button", { name: /^sign in/i }).last().click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

async function auditLayout(page, viewport) {
  return page.evaluate(({ width, isMobile }) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const elements = [...document.querySelectorAll("body *")];
    const overflow = elements
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          cls: typeof el.className === "string" ? el.className.slice(0, 100) : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter((item) => item.left < -2 || item.right > width + 2)
      .slice(0, 20);
    const smallTargets = isMobile
      ? elements
          .filter((el) => el.matches("a,button,input,select,textarea,[role='button']") && visible(el))
          .map((el) => {
            const target = el.matches('input[type="checkbox"], input[type="radio"]') && el.closest("label")
              ? el.closest("label")
              : el;
            const rect = target.getBoundingClientRect();
            return {
              text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "")
                .trim().replace(/\s+/g, " ").slice(0, 80),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((item) => item.width < 36 || item.height < 36)
          .slice(0, 30)
      : [];
    const tinyText = elements
      .filter(visible)
      .map((el) => ({
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((item) => item.text && item.size > 0 && item.size < (isMobile ? 12 : 11))
      .slice(0, 30);

    return {
      path: location.pathname,
      query: location.search,
      title: document.title,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      overflow,
      smallTargets,
      tinyText,
    };
  }, viewport);
}

async function waitForCatalog(page) {
  await page.waitForSelector('a[href^="/projects/"]', { timeout: 30_000 });
}

async function auditCatalog(page, viewport) {
  const layout = await auditLayout(page, viewport);
  const content = await page.evaluate(() => ({
    subtitle: document.querySelector(".ui-page-subtitle")?.textContent?.trim() ?? "",
    projectLinks: document.querySelectorAll('a[href^="/projects/"]').length,
    attentionCards: document.querySelectorAll("article.ui-projects-card").length,
    listRows: document.querySelectorAll(".ui-projects-row").length,
    filters: [...document.querySelectorAll(".ui-projects-filter-chip")].map((el) =>
      (el.textContent || "").trim().replace(/\s+/g, " "),
    ),
    drawerCount: document.querySelectorAll('[role="dialog"], [data-drawer]').length,
  }));
  check(layout.scrollWidth <= layout.clientWidth + 2, `${viewport.tag}: catalog has horizontal overflow`);
  check(content.projectLinks > 0, `${viewport.tag}: catalog has no canonical project links`);
  check(content.drawerCount === 0, `${viewport.tag}: retired project drawer is still mounted`);
  return { ...layout, ...content };
}

async function auditProfile(page, viewport, expectedId) {
  await page.waitForSelector("#project-context-title", { timeout: 30_000 });
  const layout = await auditLayout(page, viewport);
  const content = await page.evaluate(() => ({
    name: document.querySelector(".app-page h1")?.textContent?.trim() ?? "",
    sectionLinks: [...document.querySelectorAll('nav[aria-label="Project profile sections"] a')].map((el) =>
      (el.textContent || "").trim(),
    ),
    workspaceLinks: [...document.querySelectorAll('nav[aria-label="Project workspace views"] a')].map((el) => ({
      label: (el.textContent || "").trim(),
      href: el.getAttribute("href"),
    })),
    sectionIds: ["overview", "context", "plan", "activity"].filter((id) => document.getElementById(id)),
    contextSummary: document.querySelector("#project-context-title")?.parentElement?.parentElement?.textContent
      ?.trim().replace(/\s+/g, " ").slice(0, 180) ?? "",
  }));
  check(locationPath(page) === `/projects/${expectedId}`, `${viewport.tag}: profile is not canonical`);
  check(layout.scrollWidth <= layout.clientWidth + 2, `${viewport.tag}: profile has horizontal overflow`);
  check(content.sectionIds.length === 4, `${viewport.tag}: profile is missing anchored sections`);
  check(content.workspaceLinks.length === 4, `${viewport.tag}: workspace switcher does not have four views`);
  check(content.name.length > 0, `${viewport.tag}: project profile has no name`);
  return { ...layout, ...content };
}

function locationPath(page) {
  return new URL(page.url()).pathname;
}

async function verifyWorkspaceLinks(page, projectName, projectId) {
  const nav = page.getByRole("navigation", { name: "Project workspace views" });

  await nav.getByRole("link", { name: "Chat" }).click();
  await page.waitForURL((url) => url.pathname === "/loki" && url.searchParams.get("project") === projectName, { timeout: 30_000 });
  await page.waitForTimeout(500);

  await page.getByRole("navigation", { name: "Project workspace views" }).getByRole("link", { name: "Control" }).click();
  await page.waitForURL((url) => url.pathname === "/control" && url.searchParams.get("focus") === projectName, { timeout: 30_000 });
  await page.waitForTimeout(500);

  await page.getByRole("navigation", { name: "Project workspace views" }).getByRole("link", { name: "Terminal" }).click();
  await page.waitForURL((url) => url.pathname === "/terminal" && url.searchParams.get("tab") === projectName, { timeout: 30_000 });
  await page.waitForTimeout(500);

  await page.getByRole("navigation", { name: "Project workspace views" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL((url) => url.pathname === `/projects/${projectId}`, { timeout: 30_000 });
}

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "0",
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
});

const report = { base, viewports: [], consoleErrors: [] };

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors.push({ viewport: viewport.tag, text: message.text() });
    });
    page.on("pageerror", (error) => report.consoleErrors.push({ viewport: viewport.tag, text: error.message }));

    await login(page);
    await page.goto(`${base}/projects`, { waitUntil: "load", timeout: 60_000 });
    await waitForCatalog(page);
    await page.waitForTimeout(500);

    const catalog = await auditCatalog(page, viewport);
    await page.screenshot({ path: path.join(outDir, `${viewport.tag}-catalog.png`), fullPage: true });

    const firstProject = page.locator('a[href^="/projects/"]').first();
    const href = await firstProject.getAttribute("href");
    const projectId = href?.split("/").filter(Boolean).at(-1);
    check(Boolean(projectId), `${viewport.tag}: could not resolve first project id`);

    await firstProject.click();
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}`, { timeout: 30_000 });
    const profile = await auditProfile(page, viewport, projectId);
    const projectName = profile.name;
    await page.screenshot({ path: path.join(outDir, `${viewport.tag}-profile.png`), fullPage: true });

    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/projects");
    await waitForCatalog(page);

    await page.goto(`${base}/projects?open=${projectId}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForURL((url) => url.pathname === `/projects/${projectId}`, { timeout: 30_000 });

    if (viewport.tag === "mobile-390" || viewport.tag === "desktop") {
      await verifyWorkspaceLinks(page, projectName, projectId);
    }

    report.viewports.push({
      viewport: viewport.tag,
      projectId,
      projectName,
      catalog,
      profile,
      browserBack: "pass",
      legacyRedirect: "pass",
      connectedWorkspace: viewport.tag === "mobile-390" || viewport.tag === "desktop" ? "pass" : "not repeated",
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const ignoredConsoleErrors = report.consoleErrors.filter(({ text }) =>
  !/favicon|Failed to load resource.*404|ResizeObserver loop/i.test(text) &&
  // ClientFetchError minifies to a bare class name in production builds, so
  // match the stable authjs error URL rather than the constructor name.
  !(isLocal && /bridge\.orangecat\.ch\/sse|Failed to fetch.*authjs\.dev#autherror|net::ERR_FAILED/i.test(text)),
);

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
check(ignoredConsoleErrors.length === 0, `Browser console errors: ${JSON.stringify(ignoredConsoleErrors)}`);
console.log(JSON.stringify({
  base,
  viewports: report.viewports.map((item) => ({
    viewport: item.viewport,
    project: item.projectName,
    catalogOverflow: item.catalog.overflow.length,
    profileOverflow: item.profile.overflow.length,
    catalogTinyText: item.catalog.tinyText.length,
    profileTinyText: item.profile.tinyText.length,
    catalogSmallTargets: item.catalog.smallTargets.length,
    profileSmallTargets: item.profile.smallTargets.length,
    browserBack: item.browserBack,
    legacyRedirect: item.legacyRedirect,
    connectedWorkspace: item.connectedWorkspace,
  })),
  consoleErrors: ignoredConsoleErrors,
}, null, 2));
console.log(`screenshots and report: ${outDir}`);
