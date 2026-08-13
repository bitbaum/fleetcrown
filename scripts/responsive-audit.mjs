/**
 * Comprehensive page-surface audit.
 *
 * Page patterns come from the App Router filesystem through
 * page-route-catalog.mjs. The audit renders every resolvable pattern at two
 * phone widths (including the 320px supported minimum) and desktop, then
 * reports overflow, unafforded horizontal
 * scrollers, clipped/obscured controls, touch targets, headings, accessible
 * names, contrast, route failures, and redirects.
 *
 * Run: BASE=http://localhost:3100 node scripts/responsive-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { chromium } from "playwright";
import { discoverPageRoutes } from "./page-route-catalog.mjs";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "responsive-audit");
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

const base = (process.env.BASE ?? "http://localhost:3100").replace(/\/$/, "");
const ownerPassword = process.env.LOCAL_AUTH_PASSWORD;
const dogfoodEmail = process.env.DOGFOOD_EMAIL;
const dogfoodPassword = process.env.DOGFOOD_PASSWORD;
const settleMs = Number(process.env.AUDIT_SETTLE_MS ?? 500);
const isLocal = base.includes("localhost") || base.includes("127.0.0.1");
const createTemporaryFixtures = process.env.AUDIT_CREATE_TEMP_FIXTURES === "1";
const allowUnresolvedFixtures = process.env.AUDIT_ALLOW_UNRESOLVED_FIXTURES === "1";
const smokePrivatePin = process.env.SMOKE_PRIVATE_PIN?.trim();
const routeFilter = process.env.AUDIT_ROUTE_FILTER
  ? new RegExp(process.env.AUDIT_ROUTE_FILTER)
  : null;
const viewportFilter = process.env.AUDIT_VIEWPORT_FILTER
  ? new RegExp(process.env.AUDIT_VIEWPORT_FILTER)
  : null;
const routeCatalog = discoverPageRoutes().filter((route) => !routeFilter || routeFilter.test(route.pattern));
const viewports = [
  { name: "mobile-320", width: 320, height: 720, isMobile: true },
  { name: "mobile-375", width: 375, height: 812, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "desktop-1440", width: 1440, height: 1000, isMobile: false },
].filter((viewport) => !viewportFilter || viewportFilter.test(viewport.name));
if (!routeCatalog.length) throw new Error("AUDIT_ROUTE_FILTER matched no page patterns");
if (!viewports.length) throw new Error("AUDIT_VIEWPORT_FILTER matched no viewports");
const fullPageCapturePatterns = new Set([
  "/", "/control", "/control/new-from-scratch", "/control/workspace", "/loki",
  "/projects", "/settings", "/terminal", "/thoughts", "/today",
]);

function slug(pattern) {
  return pattern.replace(/^\//, "").replace(/[\[\]/]/g, "-").replace(/-+/g, "-") || "home";
}

async function login(page) {
  await page.goto(`${base}/sign-in?callbackUrl=/today`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (isLocal) {
    const ownerTab = page.getByRole("button", { name: /owner key/i });
    if (await ownerTab.count()) await ownerTab.click();
    if (!ownerPassword) throw new Error("LOCAL_AUTH_PASSWORD is not configured");
    const ownerInput = page.locator("#owner-password");
    await ownerInput.waitFor({ state: "visible", timeout: 10_000 });
    await ownerInput.fill(ownerPassword);
    await page.getByRole("button", { name: /sign in as owner/i }).click();
  } else {
    if (!dogfoodEmail || !dogfoodPassword) throw new Error("DOGFOOD_EMAIL/DOGFOOD_PASSWORD required for production audit");
    await page.locator('input[type="email"]').first().fill(dogfoodEmail);
    await page.locator('input[type="password"]').first().fill(dogfoodPassword);
    await page.getByRole("button", { name: /^sign in/i }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });
}

async function jsonOrNull(response) {
  if (!response.ok()) return null;
  return response.json().catch(() => null);
}

/** Resolve data-owned dynamic routes without creating or changing fixtures. */
async function resolveRuntimeFixtures(page) {
  const fixtures = {};
  let temporaryShareProjectId = null;
  const projects = await jsonOrNull(await page.request.get(`${base}/api/user-projects`));
  const project = Array.isArray(projects)
    ? projects.find((item) => item?.entityProjectId)
    : null;
  if (project?.entityProjectId) {
    fixtures["/projects/[id]"] = `/projects/${project.entityProjectId}`;
    const share = await jsonOrNull(await page.request.get(`${base}/api/projects/${project.entityProjectId}/share`));
    if (share?.share?.token) {
      fixtures["/share/project/[token]"] = `/share/project/${share.share.token}`;
    } else if (createTemporaryFixtures && isLocal) {
      const created = await jsonOrNull(await page.request.post(`${base}/api/projects/${project.entityProjectId}/share`, {
        data: {
          audience: "advisor",
          includeRoadmap: true,
          includeChangelog: true,
          includeResources: true,
          includeRepo: false,
          includeLiveUrl: true,
        },
      }));
      if (created?.share?.token) {
        fixtures["/share/project/[token]"] = `/share/project/${created.share.token}`;
        temporaryShareProjectId = project.entityProjectId;
      }
    }
  }

  const me = await jsonOrNull(await page.request.get(`${base}/api/me`));
  if (me?.username) fixtures["/u/[username]"] = `/u/${encodeURIComponent(me.username)}`;
  return { fixtures, temporaryShareProjectId };
}

/**
 * Establish private-zone coverage before the authenticated storage state is
 * cloned across viewports. A configured-but-locked zone must never make six
 * private routes look covered when they all rendered the same PIN gate.
 */
function appSlug() {
  const brandSource = fs.readFileSync(path.join(root, "src/config/brand.ts"), "utf8");
  const match = brandSource.match(/export const APP_SLUG\s*=\s*["']([^"']+)["']/);
  if (!match) throw new Error("could not resolve APP_SLUG for the private-zone audit cookie");
  return match[1];
}

async function unlockPrivateZoneForAudit(page, context) {
  const statusResponse = await page.request.get(`${base}/api/auth/pin`);
  if (!statusResponse.ok()) {
    throw new Error(`private-zone status failed (${statusResponse.status()})`);
  }
  const status = await statusResponse.json();
  if (!status.configured || status.unlocked) {
    return { configured: Boolean(status.configured), unlocked: true, mode: status.configured ? "existing-cookie" : "not-configured" };
  }
  let mode = "pin";
  if (smokePrivatePin) {
    const unlockResponse = await page.request.post(`${base}/api/auth/pin`, { data: { pin: smokePrivatePin } });
    if (!unlockResponse.ok()) throw new Error(`private-zone unlock failed (${unlockResponse.status()})`);
  } else if (isLocal) {
    // The visual audit needs both locked and unlocked render states but must
    // never reset or guess the operator's PIN. Locally, create the same signed
    // short-lived cookie the verified endpoint would create. This is an auth
    // state fixture only: it writes no application or user data.
    const secret = process.env.AUTH_SECRET?.trim();
    const meResponse = await page.request.get(`${base}/api/me`);
    const me = meResponse.ok() ? await meResponse.json() : null;
    if (!secret || !me?.id) throw new Error("SMOKE_PRIVATE_PIN is required: local signed unlock fixture lacks AUTH_SECRET or user id");
    const expiresAt = Date.now() + 30 * 60_000;
    const payload = `${me.id}:${expiresAt}`;
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    await context.addCookies([{
      name: `${appSlug()}-pz`,
      value: `${payload}:${signature}`,
      url: base,
      httpOnly: true,
      secure: base.startsWith("https://"),
      sameSite: "Lax",
      expires: Math.floor(expiresAt / 1000),
    }]);
    mode = "local-signed-cookie";
  } else {
    throw new Error("private zone is locked; set SMOKE_PRIVATE_PIN so private page interiors can be audited");
  }
  const verified = await page.request.get(`${base}/api/auth/pin`);
  const verifiedStatus = verified.ok() ? await verified.json() : null;
  if (!verifiedStatus?.unlocked) throw new Error("private-zone unlock cookie was not retained");
  return { configured: true, unlocked: true, mode };
}

function routeUsesAuthenticatedContext(route) {
  return route.access === "authenticated";
}

async function analyzeCurrentViewport(page, viewport) {
  return page.evaluate(({ viewportName, isMobile }) => {
    const doc = document.documentElement;
    const body = document.body;
    const vw = doc.clientWidth;
    const vh = window.innerHeight;
    const all = [...document.querySelectorAll("*")];
    const interactiveSelector = "button,a,input,select,textarea,[role='button'],[role='link']";

    const visible = (el, rect = el.getBoundingClientRect()) => {
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    const normalize = (value) => (value || "").trim().replace(/\s+/g, " ");
    const accessibleName = (el) => {
      const labelledBy = normalize((el.getAttribute("aria-labelledby") || "")
        .split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "));
      const labels = normalize([...(("labels" in el && el.labels) || [])]
        .map((label) => label.textContent || "").join(" "));
      const ownText = el.matches("button,a,[role='button'],[role='link']") ? normalize(el.textContent || "") : "";
      return normalize(el.getAttribute("aria-label") || labelledBy || labels || el.getAttribute("title") || ownText);
    };
    const labelFor = (el) => normalize(accessibleName(el) || el.getAttribute("placeholder") || el.textContent || "").slice(0, 90);
    const descriptor = (el) => ({
      tag: el.tagName.toLowerCase(),
      label: labelFor(el),
      cls: typeof el.className === "string" ? el.className.slice(0, 120) : "",
    });
    const scrollAncestor = (el) => {
      let current = el.parentElement;
      while (current && current !== body) {
        const style = getComputedStyle(current);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && current.scrollWidth > current.clientWidth + 2) return current;
        current = current.parentElement;
      }
      return null;
    };

    const horizontalScrollers = all
      .filter((el) => {
        const style = getComputedStyle(el);
        return visible(el) && (style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2;
      })
      .map((el) => ({
        ...descriptor(el),
        clientWidth: Math.round(el.clientWidth),
        scrollWidth: Math.round(el.scrollWidth),
        interactive: Boolean(el.matches(interactiveSelector) || el.querySelector(interactiveSelector)),
        hasAffordance: el.classList.contains("ui-scroll-fade-right") || Boolean(el.closest("[data-scroll-affordance]")),
      }));

    const clippedControls = [...document.querySelectorAll(interactiveSelector)]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const scroller = scrollAncestor(el);
        const clipped = rect.left < -2 || rect.right > vw + 2;
        return {
          ...descriptor(el),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          scrollable: Boolean(scroller),
          hasAffordance: Boolean(scroller?.classList.contains("ui-scroll-fade-right") || scroller?.closest("[data-scroll-affordance]")),
          include: visible(el, rect) && rect.bottom > 0 && rect.top < vh && clipped,
        };
      })
      .filter((item) => item.include)
      .map(({ include, ...item }) => item)
      .slice(0, 30);

    const controlAccess = [...document.querySelectorAll(interactiveSelector)]
      .map((el) => {
        if (el.matches(":disabled,[aria-disabled='true']")) return null;
        const rect = el.getBoundingClientRect();
        const eligible = visible(el, rect)
          && rect.top >= 1 && rect.bottom <= vh - 1 && rect.left >= 1 && rect.right <= vw - 1;
        if (!eligible) return null;
        // Inline anchors can span several line boxes. Their bounding rectangle
        // includes the empty space between those fragments, so probing only
        // that rectangle can incorrectly claim that a perfectly usable link
        // is covered by its parent. Probe each painted fragment instead.
        const hitRects = [...el.getClientRects()]
          .filter((item) => item.width > 0 && item.height > 0)
          .filter((item) => item.bottom > 0 && item.top < vh && item.right > 0 && item.left < vw);
        const points = (hitRects.length ? hitRects : [rect]).flatMap((item) => {
          const insetX = Math.min(6, Math.max(1, item.width / 4));
          const insetY = Math.min(6, Math.max(1, item.height / 4));
          return [
            [item.left + item.width / 2, item.top + item.height / 2],
            [item.left + insetX, item.top + insetY],
            [item.right - insetX, item.bottom - insetY],
          ];
        });
        let coveredBy = null;
        const accessible = points.some(([x, y]) => {
          const hit = document.elementsFromPoint(x, y).find((item) => !item.closest("nextjs-portal"));
          if (hit && !coveredBy) coveredBy = descriptor(hit);
          const hitInteractive = hit?.closest(interactiveSelector);
          return Boolean(hit && (
            hit === el
            || el.contains(hit)
            || hitInteractive === el
            || (hitInteractive && el.contains(hitInteractive))
          ));
        });
        return { ...descriptor(el), accessible, coveredBy: accessible ? null : coveredBy };
      })
      .filter(Boolean);

    const smallTargets = isMobile
      ? [...document.querySelectorAll(interactiveSelector)]
        .map((el) => {
          const ownRect = el.getBoundingClientRect();
          const label = ("labels" in el && el.labels?.[0]) || el.closest("label");
          // Only count a wrapper when browser semantics (a label) or an
          // explicit application contract makes the whole region clickable.
          // A generic flex/grid parent is visual chrome, not a hit target.
          const semanticWrapper = el.closest("label,[data-touch-target]");
          const wrapperRect = semanticWrapper?.getBoundingClientRect();
          const labelRect = label?.contains(el) ? label.getBoundingClientRect() : null;
          const rect = wrapperRect && visible(semanticWrapper, wrapperRect)
            ? wrapperRect
            : labelRect && visible(label, labelRect) ? labelRect : ownRect;
          const tag = el.tagName.toLowerCase();
          const inlineTextLink = tag === "a"
            && getComputedStyle(el).display === "inline"
            && Boolean(el.closest("p,li"));
          return {
            ...descriptor(el),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            include: visible(el, ownRect) && !inlineTextLink && Math.min(rect.width, rect.height) < 44,
          };
        })
        .filter((item) => item.include)
        .map(({ include, ...item }) => item)
        .slice(0, 40)
      : [];

    const unnamedControls = [...document.querySelectorAll("button,input,select,textarea,[role='button']")]
      .filter((el) => visible(el) && el.getAttribute("type") !== "hidden" && !accessibleName(el))
      .map(descriptor)
      .slice(0, 30);

    const imagesWithoutAlt = [...document.querySelectorAll("img")]
      .filter((el) => visible(el) && el.getAttribute("alt") === null)
      .map(descriptor)
      .slice(0, 20);

    function parseColor(raw) {
      if (!raw || raw === "transparent") return null;
      const toLinear = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      const toSrgb = (value) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
      const rgb = raw.match(/rgba?\(([^)]+)\)/);
      if (rgb) {
        const values = rgb[1].replaceAll(",", " ").replace("/", " ").split(/\s+/).filter(Boolean).map(Number);
        const [r, g, b, alpha = 1] = values;
        const srgb = [r, g, b].map((v) => v / 255);
        return { rgb: srgb.map(toLinear), srgb, alpha };
      }
      // Anchor this matcher so it cannot consume the "lab(" suffix inside
      // an `oklab(...)` value (which would turn OKLab white into near-black).
      const lab = raw.match(/^lab\(([-.\d]+)(%)?\s+([-\.\d]+)(%)?\s+([-\.\d]+)(%)?(?:\s*\/\s*([-\.\d]+)(%)?)?\)$/);
      if (lab) {
        // CSS Lab uses a D50 white point. A numeric L is on the same 0..100
        // scale as a percentage; percentage a/b values map ±100% to ±125.
        const L = Number(lab[1]);
        const a = Number(lab[3]) * (lab[4] ? 1.25 : 1);
        const b = Number(lab[5]) * (lab[6] ? 1.25 : 1);
        const f1 = (L + 16) / 116;
        const f0 = a / 500 + f1;
        const f2 = f1 - b / 200;
        const epsilon = 216 / 24389;
        const kappa = 24389 / 27;
        const fInverse = (value) => value ** 3 > epsilon ? value ** 3 : (116 * value - 16) / kappa;
        const x50 = 0.96422 * fInverse(f0);
        const y50 = fInverse(f1);
        const z50 = 0.82521 * fInverse(f2);
        // Bradford-adapt D50 XYZ to D65, then convert to linear sRGB.
        const x65 = 0.9555766 * x50 - 0.0230393 * y50 + 0.0631636 * z50;
        const y65 = -0.0282895 * x50 + 1.0099416 * y50 + 0.0210077 * z50;
        const z65 = 0.0122982 * x50 - 0.020483 * y50 + 1.3299098 * z50;
        const linear = [
          3.2404542 * x65 - 1.5371385 * y65 - 0.4985314 * z65,
          -0.969266 * x65 + 1.8760108 * y65 + 0.041556 * z65,
          0.0556434 * x65 - 0.2040259 * y65 + 1.0572252 * z65,
        ].map((value) => Math.max(0, Math.min(1, value)));
        const srgb = linear.map((value) => Math.max(0, Math.min(1, toSrgb(value))));
        const alphaRaw = lab[7];
        const alpha = alphaRaw ? Number(alphaRaw) / (lab[8] ? 100 : 1) : 1;
        return { rgb: linear, srgb, alpha };
      }
      const oklab = raw.match(/oklab\(([-.\d]+)(%)?\s+([-.\d]+)(%)?\s+([-.\d]+)(%)?(?:\s*\/\s*([-.\d]+)(%)?)?\)/);
      if (oklab) {
        const L = Number(oklab[1]) / (oklab[2] ? 100 : 1);
        // CSS percentages for a/b map 100% to ±0.4 in OKLab.
        const a = Number(oklab[3]) * (oklab[4] ? 0.004 : 1);
        const b = Number(oklab[5]) * (oklab[6] ? 0.004 : 1);
        const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
        const linear = [
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ].map((value) => Math.max(0, Math.min(1, value)));
        const srgb = linear.map((value) => Math.max(0, Math.min(1, toSrgb(value))));
        const alphaRaw = oklab[7];
        const alpha = alphaRaw ? Number(alphaRaw) / (oklab[8] ? 100 : 1) : 1;
        return { rgb: linear, srgb, alpha };
      }
      const oklch = raw.match(/oklch\(([-.\d]+)(%)?\s+([-.\d]+)\s+([-.\d]+)(?:\s*\/\s*([-.\d]+)(%)?)?\)/);
      if (!oklch) return null;
      const L = Number(oklch[1]) / (oklch[2] ? 100 : 1);
      const C = Number(oklch[3]);
      const h = Number(oklch[4]) * Math.PI / 180;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      const linear = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ].map((value) => Math.max(0, Math.min(1, value)));
      const srgb = linear.map((value) => Math.max(0, Math.min(1, toSrgb(value))));
      const alphaRaw = oklch[5];
      const alpha = alphaRaw ? Number(alphaRaw) / (oklch[6] ? 100 : 1) : 1;
      return { rgb: linear, srgb, alpha };
    }
    const luminance = (color) => 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
    const contrast = (a, b) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const composite = (foreground, background) => foreground.srgb
      .map((channel, index) => channel * foreground.alpha + background.srgb[index] * (1 - foreground.alpha))
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const blend = (foreground, background) => {
      const srgb = foreground.srgb.map((channel, index) => (
        channel * foreground.alpha + background.srgb[index] * (1 - foreground.alpha)
      ));
      return { srgb, rgb: srgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), alpha: 1 };
    };
    const effectiveBackground = (el) => {
      const layers = [];
      let current = el;
      while (current) {
        const parsed = parseColor(getComputedStyle(current).backgroundColor);
        if (parsed && parsed.alpha > 0) {
          layers.push(parsed);
          if (parsed.alpha >= 0.999) break;
        }
        current = current.parentElement;
      }
      let background = { rgb: [1, 1, 1], srgb: [1, 1, 1], alpha: 1 };
      for (const layer of layers.reverse()) background = blend(layer, background);
      return background;
    };
    const textWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textParents = new Set();
    while (textWalker.nextNode()) {
      const node = textWalker.currentNode;
      const parent = node.parentElement;
      if (node.textContent?.trim() && parent && !parent.matches("script,style,noscript") && visible(parent)) textParents.add(parent);
    }
    const lowContrastText = [...textParents]
      .filter((el) => !el.closest(":disabled,[aria-disabled='true']"))
      .map((el) => {
        const style = getComputedStyle(el);
        const fg = parseColor(style.color);
        const bg = effectiveBackground(el);
        if (!fg) return null;
        const ratio = contrast(composite(fg, bg), bg.rgb);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        return { ...descriptor(el), ratio: Number(ratio.toFixed(2)), fontSize, include: ratio < (large ? 3 : 4.5) };
      })
      .filter((item) => item?.include)
      .map(({ include, ...item }) => item)
      .slice(0, 30);

    const lowContrastPlaceholders = [...document.querySelectorAll("input[placeholder],textarea[placeholder]")]
      .filter((el) => visible(el) && !el.disabled && !el.value)
      .map((el) => {
        const style = getComputedStyle(el, "::placeholder");
        const fg = parseColor(style.color);
        const bg = effectiveBackground(el);
        if (!fg) return null;
        const opacity = Number.parseFloat(style.opacity);
        if (Number.isFinite(opacity)) fg.alpha *= opacity;
        const ratio = contrast(composite(fg, bg), bg.rgb);
        return { ...descriptor(el), ratio: Number(ratio.toFixed(2)), include: ratio < 4.5 };
      })
      .filter((item) => item?.include)
      .map(({ include, ...item }) => item)
      .slice(0, 30);

    const h1s = [...document.querySelectorAll("h1")];
    const mains = [...document.querySelectorAll("main,[role='main']")];
    const routeLoadingSelector = "main > .app-page.animate-pulse,[aria-busy='true'][aria-label*='Loading live fleet state'],.ui-control-loading-grid,[data-route-loading='true']";
    const bodyText = body.innerText.replace(/\s+/g, " ");
    const notFound = /page not found|this page could not be found/i.test(`${document.title} ${bodyText}`);
    return {
      viewport: viewportName,
      title: document.title,
      finalUrl: location.pathname + location.search,
      scrollHeight: Math.round(doc.scrollHeight),
      viewportHeight: vh,
      scrollScreens: Number((doc.scrollHeight / vh).toFixed(2)),
      clientWidth: vw,
      scrollWidth: Math.max(body.scrollWidth, doc.scrollWidth),
      h1Count: h1s.length,
      h1Labels: h1s.map((el) => (el.textContent || "").trim().slice(0, 90)),
      mainCount: mains.length,
      errorBoundary: body.innerText.includes("Something went wrong"),
      notFound,
      unresolvedLoading: Boolean(document.querySelector(routeLoadingSelector)),
      horizontalScrollers,
      unaffordedScrollers: horizontalScrollers.filter((item) => item.interactive && !item.hasAffordance),
      clippedControls,
      unaffordedClippedControls: clippedControls.filter((item) => !item.hasAffordance),
      controlAccess,
      smallTargets,
      unnamedControls,
      imagesWithoutAlt,
      lowContrastText,
      lowContrastPlaceholders,
      internalLinks: [...document.querySelectorAll("a[href]")]
        // Browser resolution preserves the current document for fragment-only
        // hrefs (`#habits` on /today) and normalizes relative destinations.
        .map((a) => a.href)
        .filter((href) => href && href.startsWith(location.origin)),
    };
  }, { viewportName: viewport.name, isMobile: viewport.isMobile });
}

function uniqueObjects(items) {
  return [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];
}

/**
 * Inspect every vertical viewport segment. A control is only reported as
 * obscured when it enters the viewport during the sweep and is never
 * reachable at its center or an inset corner. This avoids treating normal
 * fixed chrome as a blocker while still catching permanently covered UI.
 */
async function analyze(page, viewport) {
  const scroll = await page.evaluate(() => {
    const appMain = document.querySelector(".app-main");
    const root = appMain && appMain.scrollHeight > appMain.clientHeight + 2
      ? appMain
      : document.scrollingElement;
    if (!root) throw new Error("Audit instrumentation could not resolve a scrolling root");
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const step = Math.max(240, Math.floor(root.clientHeight * 0.72));
    const positions = [];
    for (let top = 0; top < max; top += step) positions.push(top);
    positions.push(max);
    return {
      kind: root === appMain ? "app-main" : "document",
      max,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      positions: [...new Set(positions)].slice(0, 48),
      scanTruncated: positions.length > 48,
    };
  });

  const snapshots = [];
  for (const top of scroll.positions) {
    await page.evaluate(({ kind, top }) => {
      const root = kind === "app-main" ? document.querySelector(".app-main") : document.scrollingElement;
      if (!root) throw new Error("Audit scrolling root disappeared during the segmented scan");
      root.scrollTo({ top, behavior: "instant" });
    }, { kind: scroll.kind, top });
    await page.waitForTimeout(35);
    snapshots.push(await analyzeCurrentViewport(page, viewport));
  }

  await page.evaluate((kind) => {
    const root = kind === "app-main" ? document.querySelector(".app-main") : document.scrollingElement;
    root?.scrollTo({ top: 0, behavior: "instant" });
  }, scroll.kind);

  if (!snapshots.length) throw new Error("Audit instrumentation produced no viewport snapshots");
  const result = { ...snapshots[0] };
  const arrayFields = [
    "horizontalScrollers", "unaffordedScrollers", "clippedControls",
    "unaffordedClippedControls", "smallTargets", "unnamedControls",
    "imagesWithoutAlt", "lowContrastText", "lowContrastPlaceholders", "internalLinks",
  ];
  for (const field of arrayFields) result[field] = uniqueObjects(snapshots.flatMap((item) => item[field]));

  const access = new Map();
  for (const snapshot of snapshots) {
    for (const control of snapshot.controlAccess) {
      // DOM-list indexes are not stable across lazy sections or responsive
      // client updates. Match the same semantic control across scan segments
      // so a fixed header/footer overlap at one position is cleared when that
      // control is reachable at another position.
      const key = `${control.tag}:${control.label}:${control.cls}`;
      const existing = access.get(key) ?? { ...control, accessible: false };
      existing.accessible ||= control.accessible;
      if (!control.accessible) existing.coveredBy = control.coveredBy;
      access.set(key, existing);
    }
  }
  result.obscuredControls = [...access.values()]
    .filter((control) => !control.accessible)
    .map(({ accessible, ...control }) => control);
  delete result.controlAccess;
  result.errorBoundary = snapshots.some((item) => item.errorBoundary);
  result.notFound = snapshots.some((item) => item.notFound);
  result.unresolvedLoading = snapshots.some((item) => item.unresolvedLoading);
  result.scrollRoot = scroll.kind;
  result.scrollHeight = Math.round(scroll.scrollHeight);
  result.viewportHeight = Math.round(scroll.clientHeight);
  result.scrollScreens = Number((scroll.scrollHeight / Math.max(1, scroll.clientHeight)).toFixed(2));
  result.scanSegments = snapshots.length;
  result.scanTruncated = scroll.scanTruncated;
  return result;
}

async function frameworkErrorOverlay(page) {
  return page.evaluate(() => {
    const readTree = (root) => {
      let text = root.textContent || "";
      for (const element of root.querySelectorAll?.("*") || []) {
        if (element.shadowRoot) text += ` ${readTree(element.shadowRoot)}`;
      }
      return text;
    };
    const portals = [...document.querySelectorAll("nextjs-portal")];
    const text = portals.map(readTree).join(" ").replace(/\s+/g, " ").trim();
    const hasErrorLanguage = /(Unhandled Runtime Error|Build Error|Application error|TypeError:|ReferenceError:|Hydration failed)/i.test(text);
    return hasErrorLanguage ? text.slice(0, 500) : null;
  });
}

function pathAndSearchOf(value) {
  const url = new URL(value, base);
  return `${url.pathname.replace(/\/$/, "") || "/"}${url.search}`;
}

function redactedUrl(value) {
  try {
    const url = new URL(value, base);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
    return url.toString();
  } catch {
    return String(value).replace(/(token|ticket|secret|key|code|password)=([^&\s]+)/gi, "$1=[REDACTED]");
  }
}

function redactSecrets(value) {
  return redactedUrl(String(value))
    .replace(/\bck_[A-Za-z0-9_-]{20,}\b/g, "ck_[REDACTED]")
    .slice(0, 500);
}

function expectedFinalPaths(route) {
  if (!route.expectedFinalPaths) return [pathAndSearchOf(route.auditPath)];
  const requestedUrl = new URL(route.auditPath, base);
  return route.expectedFinalPaths.map((expected) => {
    if (route.pattern !== "/digests" || !requestedUrl.search) return expected;
    const expectedUrl = new URL(expected, base);
    expectedUrl.search = requestedUrl.search;
    return pathAndSearchOf(expectedUrl);
  });
}

async function captureFullPage(page, viewport, pattern) {
  const style = await page.addStyleTag({ content: `
    html, body, .app-shell-frame, .app-main-column { height: auto !important; min-height: 0 !important; overflow: visible !important; }
    .app-main { height: auto !important; overflow: visible !important; }
  ` });
  await page.screenshot({
    path: path.join(outDir, `full-${viewport.name}-${slug(pattern)}.png`),
    fullPage: true,
  });
  await style.evaluate((element) => element.remove());
}

function attachRuntimeCapture(page, route) {
  const state = { pageErrors: [], consoleErrors: [], httpErrors: [], requestFailures: [], successfulRequests: new Set() };
  page.on("pageerror", (error) => state.pageErrors.push(redactSecrets(error?.message ?? error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // URL-aware response/request gates below own generic network diagnostics.
    if (/Failed to load resource: the server responded with a status of (400|401|403|404)/.test(text)) return;
    if (/Failed to load resource: net::ERR_/i.test(text)) return;
    state.consoleErrors.push(redactSecrets(text));
  });
  page.on("response", (response) => {
    if (response.status() < 400) {
      state.successfulRequests.add(`${response.request().method()} ${response.url()}`);
      return;
    }
    const url = new URL(response.url());
    const expectedInvalidInvite = route.pattern === "/invite/[token]"
      && response.request().method() === "GET"
      && url.origin === new URL(base).origin
      && url.pathname === "/api/invitations/fleetcrown-audit-invalid-token"
      && response.status() === 404;
    if (!expectedInvalidInvite) state.httpErrors.push({
      method: response.request().method(),
      url: redactedUrl(response.url()),
      status: response.status(),
    });
  });
  page.on("requestfailed", (request) => state.requestFailures.push({
    method: request.method(),
    url: redactedUrl(request.url()),
    error: redactSecrets(request.failure()?.errorText ?? "request failed"),
  }));
  return state;
}

function routeForPath(routes, pathname) {
  const candidates = routes.map((route) => {
    const expression = route.pattern === "/"
      ? /^\/$/
      : new RegExp(`^${route.pattern.split("/").map((segment) => (
        segment.startsWith("[") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      )).join("/")}/?$`);
    return expression.test(pathname) ? route : null;
  }).filter(Boolean);
  return candidates.sort((a, b) => Number(a.dynamic) - Number(b.dynamic))[0] ?? null;
}

async function validateInternalLink(context, source, href, routes) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (url.origin !== new URL(base).origin) return null;
  // Visible API-backed anchors (for example feedback screenshot downloads)
  // are user-facing links too. GET them in the source page's auth context;
  // API images/resources requested by the page itself remain covered by the
  // response/error capture above.
  if (url.pathname.startsWith("/api/")) {
    const response = await context.request.get(url.toString(), { maxRedirects: 0, timeout: 30_000 }).catch(() => null);
    if (!response) return { source: source.pattern, sourceAccess: source.access, href: pathAndSearchOf(url), reason: "API-backed link request failed" };
    const contentType = response.headers()["content-type"] ?? "";
    const validImageDownload = response.status() === 200 && contentType.startsWith("image/");
    return !validImageDownload ? {
      source: source.pattern,
      sourceAccess: source.access,
      href: pathAndSearchOf(url),
      status: response.status(),
      contentType,
      reason: "API-backed link did not return a 200 image download",
    } : null;
  }
  const target = routeForPath(routes, url.pathname);
  const requested = pathAndSearchOf(url);
  if (!target) return { source: source.pattern, sourceAccess: source.access, href: requested + url.hash, reason: "uncataloged internal page" };

  const response = await context.request.get(url.toString(), { maxRedirects: 8, timeout: 30_000 }).catch(() => null);
  if (!response) return { source: source.pattern, sourceAccess: source.access, href: requested + url.hash, reason: "request failed" };
  const status = response.status();
  const finalPath = pathAndSearchOf(response.url());
  const expected = source.access === "public" && target.access === "authenticated"
    ? [`/sign-in?callbackUrl=${encodeURIComponent(requested)}`]
    : (target.auditMode === "isolated-action" ? [requested, ...(target.expectedFinalPaths ?? [])] : (target.expectedFinalPaths ?? [requested]));
  const body = await response.text().catch(() => "");
  const semanticFailure = status >= 400
    || /Something went wrong/i.test(body)
    || !expected.map(pathAndSearchOf).includes(finalPath);
  return semanticFailure ? {
    source: source.pattern,
    sourceAccess: source.access,
    href: requested + url.hash,
    status,
    finalPath,
    expected,
  } : null;
}

async function validateFragment(context, source, href) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (url.origin !== new URL(base).origin || !url.hash) return null;
  const fragment = decodeURIComponent(url.hash.slice(1)).toLowerCase();
  if (!fragment) return null;

  const page = await context.newPage();
  try {
    await loadRoute(page, url.toString());
    if (url.pathname === "/settings") {
      const aliases = { tokens: "agent", "agent-token": "agent", "agent-tokens": "agent" };
      const expectedLabel = (aliases[fragment] ?? fragment).replace(/^./, (letter) => letter.toUpperCase());
      const active = await page.locator(".ui-tab-active,.ui-settings-navitem-active").allTextContents();
      return active.some((value) => value.trim() === expectedLabel) ? null : {
        source: source.pattern,
        href: pathAndSearchOf(url) + url.hash,
        reason: `settings fragment did not activate ${expectedLabel}`,
        active,
      };
    }
    const exists = await page.evaluate((id) => Boolean(
      document.getElementById(id)
      || [...document.querySelectorAll("[name]")].some((element) => element.getAttribute("name") === id),
    ), decodeURIComponent(url.hash.slice(1)));
    return exists ? null : {
      source: source.pattern,
      href: pathAndSearchOf(url) + url.hash,
      reason: "fragment target is missing",
    };
  } finally {
    await page.close();
  }
}

async function loadRoute(page, url, expectedDestinations = null) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (expectedDestinations) {
        await page.waitForURL((current) => expectedDestinations.includes(pathAndSearchOf(current)), { timeout: 12_000 }).catch(() => {});
      }
      await page.waitForTimeout(settleMs);
      await page.waitForFunction(() => !document.querySelector(
      "main > .app-page.animate-pulse,[aria-busy='true'][aria-label*='Loading live fleet state'],.ui-control-loading-grid,[data-route-loading='true']",
      ), undefined, { timeout: 12_000 }).catch(() => {});
      await page.waitForFunction(() => (
        document.querySelectorAll("h1").length === 1
        && document.querySelectorAll("main,[role='main']").length === 1
      ), undefined, { timeout: 5_000 }).catch(() => {});
      let priorUrl = "";
      for (let stable = 0; stable < 3; stable += 1) {
        const currentUrl = page.url();
        if (currentUrl === priorUrl) break;
        priorUrl = currentUrl;
        await page.waitForTimeout(250);
      }
      return response;
    } catch (error) {
      const message = String(error?.message ?? error);
      const retryable = /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|Target page, context or browser has been closed/i.test(message);
      if (!retryable || attempt === 3) throw error;
      await page.waitForTimeout(500 * attempt);
    }
  }
  return null;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
});

const report = {
  base,
  generatedAt: new Date().toISOString(),
  catalogPatterns: routeCatalog.length,
  viewports,
  runtimeFixtures: {},
  unresolvedPatterns: [],
  pages: [],
  failures: [],
  internalLinkFailures: [],
  temporaryFixtures: [],
  instrumentationFailures: [],
};

let cleanupShare = null;
let authStatePath = null;
let lockedAuthStatePath = null;
try {
  const bootstrap = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bootstrapPage = await bootstrap.newPage();
  await login(bootstrapPage);
  lockedAuthStatePath = path.join(outDir, "auth-storage-locked.json");
  await bootstrap.storageState({ path: lockedAuthStatePath });
  report.privateZone = await unlockPrivateZoneForAudit(bootstrapPage, bootstrap);
  const runtime = await resolveRuntimeFixtures(bootstrapPage);
  report.runtimeFixtures = runtime.fixtures;
  if (runtime.temporaryShareProjectId) {
    cleanupShare = {
      context: bootstrap,
      projectId: runtime.temporaryShareProjectId,
    };
    report.temporaryFixtures.push({ type: "project-share", projectId: runtime.temporaryShareProjectId });
  }
  authStatePath = path.join(outDir, "auth-storage.json");
  await bootstrap.storageState({ path: authStatePath });
  if (!cleanupShare) await bootstrap.close();

  const resolvedRoutes = routeCatalog.map((route) => ({
    ...route,
    auditPath: route.auditPath ?? report.runtimeFixtures[route.pattern] ?? null,
  }));
  report.unresolvedPatterns = resolvedRoutes
    .filter((route) => !route.auditPath)
    .map(({ pattern, fixtureRequirement }) => ({ pattern, fixtureRequirement }));

  for (const viewport of viewports) {
    const contextOptions = {
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      deviceScaleFactor: 1,
    };
    const publicContext = await browser.newContext(contextOptions);
    const authContext = await browser.newContext({ ...contextOptions, storageState: authStatePath });
    const lockedAuthContext = await browser.newContext({ ...contextOptions, storageState: lockedAuthStatePath });
    const links = [];

    for (const route of resolvedRoutes) {
      if (!route.auditPath) continue;
      const isolated = route.auditMode === "isolated-action";
      const baseContext = route.pattern === "/unlock"
        ? lockedAuthContext
        : routeUsesAuthenticatedContext(route) ? authContext : publicContext;
      const context = isolated
        ? await browser.newContext({
          ...contextOptions,
          ...(routeUsesAuthenticatedContext(route) ? { storageState: authStatePath } : {}),
        })
        : baseContext;
      const page = await context.newPage();
      const runtimeCapture = attachRuntimeCapture(page, route);
      try {
        const routeExpectedFinals = expectedFinalPaths(route);
        const response = await loadRoute(page, `${base}${route.auditPath}`, routeExpectedFinals);
        const result = await analyze(page, viewport);
        result.pattern = route.pattern;
        result.requestedPath = route.auditPath;
        result.surface = route.surface;
        result.access = route.access;
        result.auditMode = route.auditMode;
        result.status = response?.status() ?? null;
        result.statusError = result.status !== null && result.status >= 400;
        result.expectedFinalPaths = routeExpectedFinals;
        result.finalPath = pathAndSearchOf(page.url());
        result.redirected = result.finalPath !== pathAndSearchOf(route.auditPath);
        result.redirectMismatch = !result.expectedFinalPaths.map(pathAndSearchOf).includes(result.finalPath);
        result.privateZoneGate = route.surface === "private" && result.h1Labels.some((label) => /^Enter PIN$/i.test(label));
        result.pageErrors = uniqueObjects(runtimeCapture.pageErrors);
        result.consoleErrors = uniqueObjects(runtimeCapture.consoleErrors);
        result.httpErrors = uniqueObjects(runtimeCapture.httpErrors);
        // React's development Strict Mode can abort an effect's first fetch
        // during its mount/cleanup probe and immediately repeat it. Keep a
        // failure only when the same method+URL never recovered successfully.
        result.requestFailures = uniqueObjects(runtimeCapture.requestFailures.filter((item) => (
          !runtimeCapture.successfulRequests.has(`${item.method} ${item.url}`)
        )));
        result.errorOverlay = await frameworkErrorOverlay(page);
        report.pages.push(result);
        if (viewport.name === "mobile-390") {
          result.internalLinks.forEach((href) => links.push({ source: route, href }));
        }
        await page.screenshot({
          path: path.join(outDir, `${viewport.name}-${slug(route.pattern)}.png`),
          fullPage: false,
        });
        if (fullPageCapturePatterns.has(route.pattern)) await captureFullPage(page, viewport, route.pattern);

        const flags = [
          result.scrollWidth > result.clientWidth + 2 ? "overflow" : null,
          result.unaffordedScrollers.length ? `scroller×${result.unaffordedScrollers.length}` : null,
          result.unaffordedClippedControls.length ? `clipped×${result.unaffordedClippedControls.length}` : null,
          result.obscuredControls.length ? `obscured×${result.obscuredControls.length}` : null,
          result.h1Count !== 1 ? `h1×${result.h1Count}` : null,
          result.mainCount !== 1 ? `main×${result.mainCount}` : null,
          result.statusError ? `status-${result.status}` : null,
          result.errorBoundary ? "error-boundary" : null,
          result.notFound ? "not-found" : null,
          result.unresolvedLoading ? "unresolved-loading" : null,
          result.lowContrastText.length ? `contrast×${result.lowContrastText.length}` : null,
          result.lowContrastPlaceholders.length ? `placeholder×${result.lowContrastPlaceholders.length}` : null,
          result.smallTargets.length ? `target×${result.smallTargets.length}` : null,
          result.unnamedControls.length ? `unnamed×${result.unnamedControls.length}` : null,
          result.imagesWithoutAlt.length ? `alt×${result.imagesWithoutAlt.length}` : null,
          result.redirectMismatch ? `redirect→${result.finalPath}` : null,
          result.pageErrors.length ? `pageerror×${result.pageErrors.length}` : null,
          result.consoleErrors.length ? `console×${result.consoleErrors.length}` : null,
          result.httpErrors.length ? `http×${result.httpErrors.length}` : null,
          result.requestFailures.length ? `request×${result.requestFailures.length}` : null,
          result.errorOverlay ? "error-overlay" : null,
          result.privateZoneGate ? "private-zone-gate" : null,
          result.scanTruncated ? "scan-truncated" : null,
        ].filter(Boolean);
        console.log(`${viewport.name.padEnd(12)} ${route.pattern.padEnd(34)} ${flags.join(" ") || "ok"}`);
      } catch (error) {
        const failure = { viewport: viewport.name, pattern: route.pattern, path: route.auditPath, error: String(error?.message ?? error).split("\n")[0] };
        report.failures.push(failure);
        if (/instrumentation|document|execution context|evaluate/i.test(failure.error)) report.instrumentationFailures.push(failure);
        console.log(`${viewport.name.padEnd(12)} ${route.pattern.padEnd(34)} FAIL`);
      } finally {
        await page.close().catch(() => {});
        if (isolated) await context.close().catch(() => {});
      }
    }

    if (viewport.name === "mobile-390") {
      const uniqueLinks = [...new Map(links.map((item) => [`${item.source.access}:${item.href}`, item])).values()];
      for (const item of uniqueLinks) {
        const context = item.source.pattern === "/unlock"
          ? lockedAuthContext
          : item.source.access === "authenticated" ? authContext : publicContext;
        const failure = await validateInternalLink(context, item.source, item.href, resolvedRoutes);
        if (failure) report.internalLinkFailures.push(failure);
        const fragmentFailure = await validateFragment(context, item.source, item.href);
        if (fragmentFailure) report.internalLinkFailures.push(fragmentFailure);
      }
    }

    await publicContext.close();
    await authContext.close();
    await lockedAuthContext.close();
  }
} finally {
  if (cleanupShare) {
    const response = await cleanupShare.context.request.delete(`${base}/api/projects/${cleanupShare.projectId}/share`).catch(() => null);
    report.temporaryFixtures[0].cleanedUp = response?.ok() ?? false;
    await cleanupShare.context.close().catch(() => {});
  }
  await browser.close();
}

const uniqueLinkFailures = [...new Map(report.internalLinkFailures.map((item) => [item.href, item])).values()];
report.internalLinkFailures = uniqueLinkFailures;
report.renderedPatterns = new Set(report.pages.map((page) => page.pattern)).size;
report.expectedRenders = (report.catalogPatterns - report.unresolvedPatterns.length) * viewports.length;
report.issueSummary = {
  failures: report.failures.length,
  unresolvedFixtures: allowUnresolvedFixtures ? 0 : report.unresolvedPatterns.length,
  instrumentationFailures: report.instrumentationFailures.length,
  statusErrors: report.pages.filter((page) => page.statusError).length,
  errorBoundaries: report.pages.filter((page) => page.errorBoundary).length,
  notFoundPages: report.pages.filter((page) => page.notFound).length,
  unresolvedLoading: report.pages.filter((page) => page.unresolvedLoading).length,
  pageOverflows: report.pages.filter((page) => page.scrollWidth > page.clientWidth + 2).length,
  unaffordedScrollers: report.pages.reduce((sum, page) => sum + page.unaffordedScrollers.length, 0),
  unaffordedClippedControls: report.pages.reduce((sum, page) => sum + page.unaffordedClippedControls.length, 0),
  obscuredControls: report.pages.reduce((sum, page) => sum + page.obscuredControls.length, 0),
  smallTargets: report.pages.reduce((sum, page) => sum + page.smallTargets.length, 0),
  unnamedControls: report.pages.reduce((sum, page) => sum + page.unnamedControls.length, 0),
  imagesWithoutAlt: report.pages.reduce((sum, page) => sum + page.imagesWithoutAlt.length, 0),
  headingFailures: report.pages.filter((page) => page.h1Count !== 1).length,
  mainLandmarkFailures: report.pages.filter((page) => page.mainCount !== 1).length,
  lowContrastText: report.pages.reduce((sum, page) => sum + page.lowContrastText.length, 0),
  lowContrastPlaceholders: report.pages.reduce((sum, page) => sum + page.lowContrastPlaceholders.length, 0),
  redirectMismatches: report.pages.filter((page) => page.redirectMismatch).length,
  pageErrors: report.pages.reduce((sum, page) => sum + page.pageErrors.length, 0),
  consoleErrors: report.pages.reduce((sum, page) => sum + page.consoleErrors.length, 0),
  httpErrors: report.pages.reduce((sum, page) => sum + page.httpErrors.length, 0),
  requestFailures: report.pages.reduce((sum, page) => sum + page.requestFailures.length, 0),
  errorOverlays: report.pages.filter((page) => page.errorOverlay).length,
  privateZoneGatePages: report.pages.filter((page) => page.privateZoneGate).length,
  truncatedScans: report.pages.filter((page) => page.scanTruncated).length,
  internalLinkFailures: report.internalLinkFailures.length,
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.pages.length}/${report.expectedRenders} expected route/viewport renders completed`);
console.log(`${report.renderedPatterns}/${report.catalogPatterns} page patterns rendered; ${report.unresolvedPatterns.length} require runtime fixtures`);
console.log(`report ${path.join(outDir, "report.json")}`);

if (Object.values(report.issueSummary).some((count) => count > 0)) {
  process.exitCode = 1;
}
