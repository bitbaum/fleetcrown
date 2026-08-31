/**
 * Mobile interaction audit — what a layout measurement cannot see.
 *
 * `responsive-audit.mjs` proves no page scrolls sideways and that tap targets
 * are big enough. Both are measurements of a page sitting still at scroll 0.
 * The defects that actually make a phone unusable happen after that:
 *
 *   1. Content stranded UNDER the floating bottom nav at max scroll. The nav is
 *      `position: fixed`, so it covers whatever is beneath it; if the scroll
 *      container does not reserve its height, the last row of every page is
 *      unreachable — and a screenshot at scroll 0 looks perfect.
 *   2. Chrome that opens and cannot be closed, or that opens under something.
 *   3. Pages whose primary action is off-screen on a phone.
 *
 * Runs against PROD by default, with a real touch-capable Chromium.
 *
 *   FLEETCROWN_SESSION_TOKEN=… FLEETCROWN_PRIVATE_ZONE_COOKIE=… \
 *     node scripts/test/mobile-interaction-audit.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const BASE = (process.env.AUDIT_BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");
const OUT = ".tmp/mobile-audit";
const PAGES = [
  "/today",
  "/control",
  "/loki",
  "/projects",
  "/people",
  "/crew",
  "/money",
  "/habits",
  "/events",
  "/goals",
  "/activity",
  "/prompts",
  "/settings",
  "/system",
  "/approvals",
];

function cookieName() {
  return BASE.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}

async function main() {
  const token = process.env.FLEETCROWN_SESSION_TOKEN?.trim();
  if (!token) {
    console.error("✗ FLEETCROWN_SESSION_TOKEN required");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const host = new URL(BASE).hostname;
  const secure = BASE.startsWith("https://");
  const cookies = [
    { name: cookieName(), value: token, domain: host, path: "/", httpOnly: true, secure },
  ];
  const pz = process.env.FLEETCROWN_PRIVATE_ZONE_COOKIE?.trim();
  const pzEq = pz ? pz.indexOf("=") : -1;
  if (pzEq > 0) {
    cookies.push({
      name: pz.slice(0, pzEq),
      value: pz.slice(pzEq + 1),
      domain: host,
      path: "/",
      httpOnly: true,
      secure,
    });
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await ctx.addCookies(cookies);

  const findings = [];
  for (const route of PAGES) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(1200);

      // Scroll the real scroll container (.app-main), not the window — the shell
      // scrolls internally, so window.scrollTo is a no-op and would make every
      // page look fine.
      const scrolled = await page.evaluate(() => {
        const el = document.querySelector(".app-main") ?? document.scrollingElement;
        if (!el) return null;
        el.scrollTop = el.scrollHeight;
        return {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        };
      });
      await page.waitForTimeout(600);

      // At max scroll: does any interactive element sit under the fixed nav?
      const covered = await page.evaluate(() => {
        const nav = document.querySelector(".ui-mobile-nav");
        if (!nav) return { navFound: false, hidden: [] };
        const navBox = nav.getBoundingClientRect();
        const hidden = [];
        const targets = document.querySelectorAll(
          "main a, main button, main input, main textarea, main select",
        );
        for (const el of targets) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Only elements currently in the viewport can be judged.
          if (r.bottom < 0 || r.top > window.innerHeight) continue;
          const overlapsVertically = r.bottom > navBox.top && r.top < navBox.bottom;
          const overlapsHorizontally = r.right > navBox.left && r.left < navBox.right;
          if (!overlapsVertically || !overlapsHorizontally) continue;
          // The nav wins the hit test at the element's centre → unreachable.
          const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
          const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
          const hit = document.elementFromPoint(cx, cy);
          if (hit && !el.contains(hit) && !hit.contains(el) && nav.contains(hit)) {
            hidden.push(
              `${el.tagName.toLowerCase()}"${(el.textContent ?? "").trim().slice(0, 40)}"`,
            );
          }
        }
        return { navFound: true, hidden };
      });

      const slug = route.replace(/\//g, "") || "root";
      await page.screenshot({ path: `${OUT}/${slug}-bottom.png` });

      if (covered.navFound && covered.hidden.length > 0) {
        findings.push({ route, kind: "covered-by-nav", detail: covered.hidden.slice(0, 4) });
        console.log(
          `  ✗ ${route} — ${covered.hidden.length} element(s) unreachable under the bottom nav: ${covered.hidden.slice(0, 3).join(", ")}`,
        );
      } else if (!covered.navFound) {
        console.log(`  · ${route} — no mobile nav on this page`);
      } else {
        console.log(`  ✓ ${route} — bottom reachable (scrollTop ${scrolled?.scrollTop ?? "?"})`);
      }
    } catch (e) {
      findings.push({ route, kind: "error", detail: String(e).slice(0, 140) });
      console.log(`  ✗ ${route} — ${String(e).slice(0, 140)}`);
    } finally {
      await page.close();
    }
  }

  // The Menu sheet is the only route to half the app on a phone, so every way a
  // person might dismiss it has to work. Found in prod with two of the three
  // broken: Escape did nothing, and the page scrolled behind the open sheet.
  const page = await ctx.newPage();
  const sheet = () => page.locator(".ui-mobile-nav-sheet");
  const openSheet = async () => {
    await page.getByRole("button", { name: /menu/i }).first().click();
    await page.waitForTimeout(700);
    return (await sheet().count()) > 0;
  };
  try {
    await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1200);

    if (!(await openSheet())) {
      findings.push({ route: "/today", kind: "menu-sheet", detail: "Menu did not open" });
      console.log("  ✗ menu sheet does not open");
    } else {
      await page.screenshot({ path: `${OUT}/menu-sheet.png` });

      // While open, the page behind must not scroll.
      const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
      if (bodyOverflow !== "hidden") {
        findings.push({
          route: "/today",
          kind: "menu-sheet",
          detail: `page scrolls behind the sheet (body overflow: ${bodyOverflow})`,
        });
        console.log(`  ✗ menu sheet — page scrolls behind it (body overflow: ${bodyOverflow})`);
      } else {
        console.log("  ✓ menu sheet locks the page behind it");
      }

      for (const [name, dismiss] of [
        ["close button", async () => sheet().getByRole("button").first().click()],
        ["backdrop tap", async () => page.mouse.click(195, 40)],
        ["Escape", async () => page.keyboard.press("Escape")],
      ]) {
        if ((await sheet().count()) === 0 && !(await openSheet())) break;
        await dismiss();
        await page.waitForTimeout(700);
        if ((await sheet().count()) === 0) {
          console.log(`  ✓ menu sheet closes on ${name}`);
        } else {
          findings.push({
            route: "/today",
            kind: "menu-sheet",
            detail: `${name} does not close the sheet`,
          });
          console.log(`  ✗ menu sheet does NOT close on ${name}`);
        }
      }
    }
  } catch (e) {
    findings.push({ route: "/today", kind: "menu-sheet", detail: String(e).slice(0, 140) });
    console.log(`  ✗ menu sheet — ${String(e).slice(0, 140)}`);
  } finally {
    await page.close();
  }

  await browser.close();
  console.log(`\nscreenshots → ${OUT}/`);
  if (findings.length) {
    console.log(`✗ ${findings.length} mobile finding(s)`);
    process.exit(1);
  }
  console.log("✓ no mobile interaction findings");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
