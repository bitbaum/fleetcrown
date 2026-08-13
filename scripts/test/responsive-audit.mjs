/**
 * Responsive audit — the automated check behind "every page works at 320px+".
 * Run: npm run audit:responsive            (all pages, default viewports)
 *      npm run audit:responsive -- /loki   (one page)
 *
 * WHY THIS EXISTS
 *
 * CLAUDE.md states the rule — "All pages must work at 320px+ without horizontal
 * scroll" — and nothing enforced it for AUTHENTICATED pages. Every existing
 * check either runs unauthenticated (smoke) or at a single desktop width
 * (dogfood). So the rule was a promise, and layout regressions on the pages the
 * operator actually uses could ship green.
 *
 * It surfaced concretely: a Loki layout change could not be verified across
 * viewports at all, because `resize_window` in the interactive browser does not
 * take effect under a tiling window manager (outerWidth stays put), and the
 * repo's headless tooling needs a session token that needs the database.
 * Reasoning about breakpoints from CSS is not verification.
 *
 * WHAT IT CHECKS, per page per viewport:
 *   1. No horizontal overflow — scrollWidth must not exceed the viewport. This
 *      is the stated rule, and the one that makes a phone unusable.
 *   2. Which element overflowed, when one does. A bare "320 fails" costs an
 *      hour of bisecting; the offender's tag + classes costs nothing to report.
 *   3. Touch targets >= 44px on coarse-pointer widths. Also a stated rule, and
 *      invisible in a screenshot.
 *   4. A screenshot per page/viewport under .tmp/responsive-audit/ for eyeballs.
 *
 * AUTH
 *
 * Needs a session. Resolution order:
 *   FLEETCROWN_SESSION_TOKEN  — set it and nothing else is needed
 *   AUDIT_DATABASE_URL        — mints a JWT itself (see scripts/db-tunnel.sh
 *                               for reaching a firewalled Postgres over SSH)
 * Deliberately NOT reusing print-session-token.ts: that resolves a DIRECT box
 * connection from .env.hetzner.local, which is exactly what is unreachable from
 * a sandboxed or CI runner. Taking the URL explicitly is what makes this
 * runnable from somewhere other than the founder's laptop.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const BASE = (process.env.AUDIT_BASE ?? "https://fleetcrown.orangecat.ch").replace(/\/$/, "");
const OUT = ".tmp/responsive-audit";

/**
 * Widths that represent real failure classes, not a sweep.
 * 320 is the narrowest phone still in use and the stated floor; 390 is a modern
 * iPhone; 768 is the tablet/sidebar boundary; 1440 is the laptop most of this
 * gets designed on. Each is a breakpoint where THIS app changes behaviour.
 */
const VIEWPORTS = [
  { name: "320", width: 320, height: 720, touch: true },
  { name: "390", width: 390, height: 844, touch: true },
  { name: "768", width: 768, height: 1024, touch: true },
  { name: "1440", width: 1440, height: 900, touch: false },
];

/**
 * Every authenticated surface reachable from the nav, plus the sub-routes that
 * carry their own layout. Auditing five pages proved the harness; auditing the
 * whole app is what actually protects it — a rule enforced on a sample is a rule
 * with holes exactly where nobody looked.
 *
 * Public/marketing routes are excluded: they render for signed-out visitors and
 * belong to `npm run smoke`, which already covers them at no session cost.
 */
const PAGES = [
  "/today", "/loki", "/control", "/projects", "/approvals",
  "/terminal", "/prompts", "/activity", "/system", "/agents",
  "/atlas", "/thoughts", "/settings", "/frontier", "/digests",
  "/decisions", "/history", "/integrations/orangecat/build",
  "/control/import", "/control/new-from-scratch",
];

const MIN_TOUCH_PX = 44;

function cookieName() {
  return BASE.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/** Mint a session JWT from an explicitly-supplied Postgres URL. */
async function mintToken() {
  const fromEnv = process.env.FLEETCROWN_SESSION_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const dbUrl = process.env.AUDIT_DATABASE_URL?.trim();
  const secret = process.env.AUTH_SECRET?.trim();
  if (!dbUrl || !secret) return null;

  const postgres = (await import("postgres")).default;
  const sql = postgres(dbUrl, { max: 1, ssl: false });
  try {
    const rows = await sql`
      SELECT id, email, name, username, onboarded_at
      FROM users
      WHERE is_default = true OR email IS NOT NULL
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `;
    const u = rows[0];
    if (!u?.id) return null;
    const { encode } = await import("@auth/core/jwt");
    return await encode({
      token: {
        id: u.id, email: u.email, name: u.name, username: u.username,
        onboardedAt: u.onboarded_at,
        onboardingComplete: Boolean(u.username && u.onboarded_at),
        sub: u.id,
      },
      secret,
      salt: cookieName(),
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

/**
 * Measure one rendered page. Runs in the browser: reports overflow with the
 * culprit, and undersized touch targets.
 *
 * `scrollWidth > clientWidth + 1` — the 1px slack absorbs sub-pixel rounding at
 * fractional device ratios, which otherwise reports a phantom overflow on every
 * page and trains everyone to ignore the check.
 *
 * A real function, not a string: Playwright does not bind arguments to a string
 * pageFunction, so the string form silently received `undefined` for minTouch
 * and returned nothing at all.
 */
function measurePage(minTouch) {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const offenders = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden') return false;
      return r.right > vw + 1;
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 80),
      right: Math.round(el.getBoundingClientRect().right),
      width: Math.round(el.getBoundingClientRect().width),
    }))
    .sort((a, b) => b.right - a.right)
    .slice(0, 5);

  const small = [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (getComputedStyle(el).visibility === 'hidden') return false;
      return r.height < minTouch - 0.5;
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28),
      h: Math.round(el.getBoundingClientRect().height),
    }))
    .slice(0, 6);

  // Text clipped by a fixed-height box: content the operator simply cannot
  // read, and invisible to an overflow check because the container itself fits.
  const clipped = [...document.querySelectorAll('body *')]
    .filter((el) => {
      if (el.children.length > 0) return false;
      const t = (el.textContent || '').trim();
      if (t.length < 12) return false;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'visible' || cs.visibility === 'hidden') return false;
      // Ellipsis is a deliberate design choice; genuine vertical clipping is not.
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) return false;
      return el.scrollHeight > el.clientHeight + 2;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 30), hidden: el.scrollHeight - el.clientHeight }))
    .slice(0, 5);

  // Content trapped under fixed chrome (mobile bottom nav). Reachable only if
  // the page scrolls far enough; on a short page it is permanently covered.
  const bars = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.position === 'fixed' && r.height > 24 && r.width > vw * 0.6 && r.bottom >= de.clientHeight - 2;
  });
  const barTop = bars.length ? Math.min(...bars.map((b) => b.getBoundingClientRect().top)) : Infinity;
  const buried = bars.length === 0 ? [] : [...document.querySelectorAll('button, a[href], input, select')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || getComputedStyle(el).position === 'fixed') return false;
      // Intersects the bar AND the page cannot scroll further to free it.
      return r.bottom > barTop && r.top < de.clientHeight && de.scrollHeight <= de.clientHeight + 2;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) }))
    .slice(0, 4);

  const brokenImages = [...document.querySelectorAll('img')]
    .filter((img) => img.complete && img.naturalWidth === 0 && (img.getAttribute('src') || '').length > 0)
    .map((img) => (img.getAttribute('src') || '').slice(0, 60))
    .slice(0, 4);

  return { vw, scrollWidth: de.scrollWidth, overflow: de.scrollWidth > vw + 1, offenders, small, clipped, buried, brokenImages };
}

async function main() {
  const only = process.argv.slice(2).filter((a) => a.startsWith("/"));
  const pages = only.length > 0 ? only : PAGES;

  const token = await mintToken();
  if (!token) {
    console.error(
      "✗ no session. Set FLEETCROWN_SESSION_TOKEN, or AUDIT_DATABASE_URL + AUTH_SECRET.\n" +
        "  For a firewalled Postgres: bash scripts/db-tunnel.sh   (prints the URL to use)",
    );
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  let checks = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      deviceScaleFactor: 1,
    });
    await ctx.addCookies([
      { name: cookieName(), value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true, secure: BASE.startsWith("https://") },
    ]);

    for (const route of pages) {
      const page = await ctx.newPage();
      // Console + network failures are free to collect while the page is open
      // and are the cheapest signal that a surface is quietly broken — an audit
      // that only measures boxes will pass a page whose data never loaded.
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });
      page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${String(e.message).slice(0, 120)}`));
      const httpFailures = [];
      page.on("response", (r) => { if (r.status() >= 500) httpFailures.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 70)}`); });
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        // Let late layout (fonts, async panes) settle before measuring — a
        // measurement taken mid-hydration reports overflow that never reaches a
        // human eye, and a flaky gate is a disabled gate.
        await page.waitForTimeout(1200);

        const r = await page.evaluate(measurePage, MIN_TOUCH_PX);
        checks++;
        const shot = path.join(OUT, `${route.replace(/\//g, "") || "root"}-${vp.name}.png`);
        await page.screenshot({ path: shot, fullPage: false });

        // HARD failures: the page is broken, not merely imperfect.
        if (r.overflow) {
          failures.push(
            `${route} @${vp.name}: horizontal overflow ${r.scrollWidth}px > ${r.vw}px\n` +
              r.offenders.map((o) => `      ${o.tag}.${o.cls} (right=${o.right}, w=${o.width})`).join("\n"),
          );
          console.log(`  ✗ ${route} @${vp.name}px — overflow ${r.scrollWidth} > ${r.vw}`);
        } else if (httpFailures.length > 0) {
          failures.push(`${route} @${vp.name}: server error(s) — ${httpFailures.slice(0, 3).join("; ")}`);
          console.log(`  ✗ ${route} @${vp.name}px — ${httpFailures[0]}`);
        } else if (r.buried.length > 0) {
          failures.push(`${route} @${vp.name}: control(s) trapped under fixed chrome on an unscrollable page — ${r.buried.map((b) => `${b.tag}"${b.label}"`).join(", ")}`);
          console.log(`  ✗ ${route} @${vp.name}px — ${r.buried.length} control(s) buried under the bottom bar`);
        } else if (vp.touch && r.small.length > 0) {
          // Reported, not failed: the 44px rule has legitimate exceptions
          // (inline text links), and failing on it would bury the overflow
          // signal that actually breaks a page.
          console.log(`  ⚠ ${route} @${vp.name}px — ${r.small.length} target(s) under ${MIN_TOUCH_PX}px: ${r.small.map((s) => `${s.tag}"${s.label}"=${s.h}px`).join(", ")}`);
        } else {
          console.log(`  ✓ ${route} @${vp.name}px`);
        }
        // Soft signals, always reported alongside the verdict above.
        if (r.clipped.length > 0) console.log(`     ⚠ clipped text: ${r.clipped.map((c) => `"${c.text}" (-${c.hidden}px)`).join(", ")}`);
        if (r.brokenImages.length > 0) console.log(`     ⚠ broken image(s): ${r.brokenImages.join(", ")}`);
        if (consoleErrors.length > 0) console.log(`     ⚠ console: ${[...new Set(consoleErrors)].slice(0, 2).join(" | ")}`);
      } catch (e) {
        failures.push(`${route} @${vp.name}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        console.log(`  ✗ ${route} @${vp.name}px — ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      } finally {
        await page.close();
      }
    }
    await ctx.close();
  }
  await browser.close();

  console.log(`\n${checks} check(s) across ${VIEWPORTS.length} viewports · screenshots in ${OUT}/`);
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} responsive failure(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("✓ no horizontal overflow at any tested width");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
