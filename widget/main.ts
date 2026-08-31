/**
 * FleetCrown Feedback Widget — self-contained embed for customer sites.
 *
 * Usage (docs/architecture/feedback-widget.md):
 *   <script src="https://<fleetcrown-host>/widget.js" data-fc-project="fcw_..." async></script>
 *
 * Constraints that shape this file:
 * - Zero dependencies, one bundle: it must mount on ANY site (static HTML,
 *   WordPress, Next, ...) — no React, no shared chunks.
 * - All UI lives in a Shadow DOM so host CSS and widget CSS can't bleed
 *   into each other. The ONE exception: element-picking highlights must
 *   style host-page elements, so a tiny fcw-* stylesheet is injected into
 *   document.head (removed classes on cleanup).
 * - The token is write-only by design; the API base is derived from this
 *   script's own src, so one snippet works on every deployment.
 */

import { buildSuggestion, formatDiagnostics, type ReportDiagnostics } from "./report-payload";

type Scope = "element" | "page" | "site";
type SelectedEl = { elementType: string; elementText: string; selector: string };

const ACCENT = "#e0680f";
const MAX_LEN = 2000;
const MAX_ELEMENTS = 10;

interface ReportInput {
  /** Pre-filled first line so the visitor never faces an empty box. */
  message?: string;
  diagnostics?: ReportDiagnostics;
}

interface FleetCrownApi {
  /**
   * True once the panel can actually be opened — i.e. the boot gate said
   * active AND mount() has run.
   *
   * A host needs this to decide what its own "Report" control should be. The
   * stub below is published synchronously and therefore exists even when the
   * widget will never render (token paused, boot unreachable); a host that
   * treats "report is a function" as "clicking will do something" ships a
   * button that silently no-ops. Read `ready` and fall back to a real link.
   */
  ready: boolean;
  report(input?: ReportInput): void;
}

const SHADOW_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
button { cursor: pointer; border: none; background: none; }
.fab {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  width: 48px; height: 48px; border-radius: 50%;
  /* Accent bg + white ring: must stay visible on light AND dark host sites
     (a dark FAB vanished on dark pages — found dogfooding on FleetCrown). */
  background: ${ACCENT}; color: #fff;
  border: 2px solid rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 12px rgba(0,0,0,.35);
  transition: transform .15s ease, opacity .2s ease;
}
.fab:hover { transform: scale(1.08); }
.fab svg { width: 20px; height: 20px; }
@media (max-width: 480px) {
  /* Narrow viewports: content spans the full width, so a fixed launcher sits
     on whatever scrolls into its corner (observed covering a pricing CTA at
     320px). Shrink it, and get out of the way while the page is scrolling —
     taps during scroll-reading never hit the FAB instead of the page. */
  .fab { width: 40px; height: 40px; right: 12px; bottom: 12px; }
  .fab svg { width: 18px; height: 18px; }
  .fab.scrolling { opacity: .3; pointer-events: none; }
}
.backdrop {
  position: fixed; inset: 0; z-index: 2147483001;
  background: rgba(0,0,0,.25);
}
.panel {
  position: fixed; z-index: 2147483002;
  right: 16px; bottom: 16px; width: 360px; max-width: calc(100vw - 32px);
  max-height: min(85vh, 640px); overflow-y: auto;
  background: #fff; color: #1c1917; border-radius: 14px;
  box-shadow: 0 8px 40px rgba(0,0,0,.3);
  padding: 16px;
}
@media (max-width: 480px) {
  .panel { right: 0; bottom: 0; left: 0; width: 100%; max-width: none; border-radius: 14px 14px 0 0;
           padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
.hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.hdr b { font-size: 14px; }
.hdr .page { font-size: 11px; color: #78716c; margin-top: 2px; max-width: 260px;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { color: #a8a29e; font-size: 18px; line-height: 1; padding: 4px; }
.x:hover { color: #1c1917; }
.chips { display: flex; gap: 6px; margin-bottom: 10px; }
.chip {
  flex: 1; padding: 7px 4px; font-size: 12px; border-radius: 8px;
  border: 1px solid #e7e5e4; color: #57534e; background: #fafaf9; text-align: center;
}
.chip.on { border-color: ${ACCENT}; color: ${ACCENT}; background: #fff7ed; font-weight: 600; }
.hint { font-size: 11px; color: ${ACCENT}; margin: -4px 0 8px; }
textarea, input {
  width: 100%; font-size: 13px; color: #1c1917;
  border: 1px solid #d6d3d1; border-radius: 8px; padding: 8px 10px; background: #fff;
}
textarea { resize: none; min-height: 74px; }
textarea:focus, input:focus { outline: 2px solid ${ACCENT}; outline-offset: -1px; border-color: transparent; }
.cnt { font-size: 10px; color: #a8a29e; text-align: right; margin: 3px 0 8px; }
.diag {
  font-size: 11px; color: #57534e; background: #f5f5f4;
  border: 1px solid #e7e5e4; border-radius: 6px;
  padding: 5px 8px; margin: -4px 0 10px; cursor: help;
}
input { margin-bottom: 10px; }
.attachrow { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.attach { font-size: 12px; color: #57534e; padding: 6px 10px; border: 1px dashed #d6d3d1; border-radius: 8px; }
.attach:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
.shot { position: relative; display: inline-flex; }
.shot img { height: 44px; max-width: 88px; object-fit: cover; border-radius: 6px; border: 1px solid #e7e5e4; }
.shot .rm {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
  border-radius: 50%; background: #1c1917; color: #fff; font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.row { display: flex; gap: 8px; }
.go {
  flex: 1; background: ${ACCENT}; color: #fff; font-size: 13px; font-weight: 600;
  border-radius: 8px; padding: 9px 0;
}
.go:disabled { opacity: .5; cursor: default; }
.ghost { font-size: 13px; color: #57534e; padding: 9px 14px; border: 1px solid #e7e5e4; border-radius: 8px; }
.err { font-size: 12px; color: #dc2626; margin-top: 8px; }
.keys { font-size: 10px; color: #a8a29e; text-align: center; margin-top: 10px; }
.ok { text-align: center; padding: 22px 0 14px; }
.ok .tick { width: 40px; height: 40px; border-radius: 50%; background: #16a34a; color: #fff;
            display: inline-flex; align-items: center; justify-content: center; font-size: 20px; }
.ok p { font-size: 13px; margin-top: 10px; color: #1c1917; }
.pickbar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483002;
  background: #1c1917; color: #fff; border-radius: 10px; padding: 10px 14px;
  display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.35);
  font-size: 12px; max-width: calc(100vw - 24px);
}
.pickbar .go { flex: none; padding: 6px 12px; font-size: 12px; }
.pickbar .ghost { color: #d6d3d1; border-color: #44403c; padding: 6px 12px; font-size: 12px; white-space: nowrap; }
.pickbar span { flex: 1; min-width: 0; }
@media (max-width: 480px) {
  .pickbar { left: 12px; right: 12px; transform: none; max-width: none; }
}
/* Keyboard hints are noise on touch-only devices. */
@media (hover: none) and (pointer: coarse) {
  .keys { display: none; }
}
`;

/** Injected into document.head — the only styling that must reach host elements. */
const DOC_CSS = `
.fcw-hover { outline: 2px dashed ${ACCENT} !important; outline-offset: 2px !important; cursor: crosshair !important; }
.fcw-selected { outline: 2px solid ${ACCENT} !important; outline-offset: 2px !important; }
`;

/** Client-side downscale so a phone photo never ships megabytes: longest edge
 *  ≤1280px, JPEG, quality stepped down until it fits the ingest cap. */
const MAX_SHOT_CHARS = 590_000; // ingest caps the data URL at 600k chars
function downscaleImage(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.6, 0.4]) {
        const out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= MAX_SHOT_CHARS) return resolve(out);
      }
      resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const PENCIL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

/**
 * Prefer the thing the visitor meant (link/button/card) over decorative
 * children (img/svg/path/rect). Empty elementText on bare <img> / <rect> made
 * OrangeCat "make this clickable" reports useless for Dispatch fix.
 */
function resolvePickTarget(el: Element): Element {
  const interactive = el.closest(
    'a, button, [role="button"], [role="link"], summary, label, [tabindex]:not([tabindex="-1"])',
  );
  if (interactive instanceof Element) return interactive;

  let cur: Element | null = el;
  while (cur && /^(path|rect|circle|line|polyline|polygon|g)$/i.test(cur.tagName)) {
    cur = cur.parentElement;
  }
  if (cur && cur.tagName.toLowerCase() === "svg") {
    const wrap = cur.parentElement;
    if (wrap && wrap !== document.body) return wrap;
    return cur;
  }
  if (el.tagName.toLowerCase() === "img") {
    const wrap = el.closest("a, button, figure, [role='button'], article, li");
    if (wrap instanceof Element) return wrap;
  }
  return el;
}

function elementLabel(el: Element): string {
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) return aria.slice(0, 100);
  const alt = el.getAttribute("alt")?.trim();
  if (alt) return alt.slice(0, 100);
  const title = el.getAttribute("title")?.trim();
  if (title) return title.slice(0, 100);
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 100);
  return `<${el.tagName.toLowerCase()}>`;
}

/** id / data-testid first; else tag + up to 2 classes (skip fcw-*). */
function generateSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c && !c.startsWith("fcw-"));
  if (cls.length > 0)
    return `${tag}.${cls
      .slice(0, 2)
      .map((c) => CSS.escape(c))
      .join(".")}`;
  return tag;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  const token = script?.getAttribute("data-fc-project") ?? "";
  if (!token) {
    console.warn("[fleetcrown-widget] missing data-fc-project attribute");
    return;
  }
  const apiBase = script?.src ? new URL(script.src).origin : "";
  // Optional FAB offset (px from the bottom edge) so the launcher can stack
  // above a host site's own floating button instead of covering it.
  const bottomOffset = parseInt(script?.getAttribute("data-fc-bottom") ?? "", 10);
  if (document.getElementById("fleetcrown-feedback-host")) return;

  // Publish the programmatic entry point SYNCHRONOUSLY, before the async boot
  // gate decides whether to render. A host page that calls report() from an
  // error toast must not have to know whether the widget has finished booting,
  // so calls made too early are held (latest wins — a double-click on "Report"
  // means the second click, not two panels) and replayed once mount() runs.
  // If the boot gate says inactive, the held report is simply never shown:
  // the widget is off, and a queued submission could not land anyway.
  let pendingReport: ReportInput | null = null;
  let liveReport: ((input: ReportInput) => void) | null = null;
  const api: FleetCrownApi = {
    ready: false,
    report(input: ReportInput = {}) {
      if (liveReport) liveReport(input);
      else pendingReport = input;
    },
  };
  (window as unknown as { FleetCrown?: FleetCrownApi }).FleetCrown = api;

  const mount = () => {
    // ---- state ----
    let scope: Scope = "page";
    let picking = false;
    let selected: SelectedEl[] = [];
    let selectedNodes: Element[] = [];
    let hoverNode: Element | null = null;
    let submitting = false;

    // ---- shadow scaffold ----
    const host = h("div");
    host.id = "fleetcrown-feedback-host";
    const root = host.attachShadow({ mode: "open" });
    const style = h("style");
    style.textContent = SHADOW_CSS;
    root.appendChild(style);
    document.body.appendChild(host);

    const docStyle = h("style");
    docStyle.textContent = DOC_CSS;

    // ---- FAB ----
    const fab = h("button", "fab");
    if (Number.isFinite(bottomOffset)) fab.style.bottom = `${bottomOffset}px`;
    fab.innerHTML = PENCIL_SVG;
    fab.setAttribute("aria-label", "Give feedback");
    fab.setAttribute("aria-haspopup", "dialog");
    fab.addEventListener("click", openPanel);
    root.appendChild(fab);

    // Scroll-fade companion to the narrow-viewport CSS above: the class is
    // toggled on every viewport, but only the ≤480px media query styles it.
    let scrollSettle = 0;
    window.addEventListener(
      "scroll",
      () => {
        fab.classList.add("scrolling");
        clearTimeout(scrollSettle);
        scrollSettle = window.setTimeout(() => {
          fab.classList.remove("scrolling");
          dodge();
        }, 350);
      },
      { passive: true },
    );

    // Narrow viewports: a fixed corner launcher can land ON an interactive
    // control — measured covering the /auth GitHub sign-in button at 320px,
    // where the max-z FAB steals the tap. `data-fc-bottom` only helps hosts
    // that know their own layout; pages can't predict what scrolls into the
    // corner. So hit-test the stacking context under the FAB and step it
    // upward until nothing tappable sits beneath (capped, so a pathological
    // page can't walk it off-screen).
    const baseBottom = Number.isFinite(bottomOffset) ? bottomOffset : 12;
    const INTERACTIVE = "a,button,input,select,textarea,summary,[role='button']";
    const dodge = () => {
      if (fab.style.display === "none") return; // hidden while panel is open — rect is degenerate
      if (window.innerWidth > 480) {
        fab.style.bottom = Number.isFinite(bottomOffset) ? `${bottomOffset}px` : "";
        return;
      }
      let bottom = baseBottom;
      fab.style.bottom = `${bottom}px`;
      for (let i = 0; i < 12; i++) {
        const r = fab.getBoundingClientRect();
        const pts: Array<[number, number]> = [
          [r.left + 3, r.top + 3],
          [r.right - 3, r.top + 3],
          [r.left + 3, r.bottom - 3],
          [r.right - 3, r.bottom - 3],
          [(r.left + r.right) / 2, (r.top + r.bottom) / 2],
        ];
        const covered = pts.some(([x, y]) =>
          document
            .elementsFromPoint(x, y)
            .some((el) => el !== host && !host.contains(el) && el.closest(INTERACTIVE) !== null),
        );
        if (!covered) return;
        bottom += 16;
        fab.style.bottom = `${bottom}px`;
      }
    };
    dodge();
    // Layout shifts after hydration/fonts move the controls under the corner.
    window.setTimeout(dodge, 800);
    let resizeSettle = 0;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeSettle);
        resizeSettle = window.setTimeout(dodge, 150);
      },
      { passive: true },
    );

    // ---- panel (built once, shown on demand) ----
    const backdrop = h("div", "backdrop");
    backdrop.addEventListener("click", closePanel);

    const panel = h("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Send feedback");

    const hdr = h("div", "hdr");
    const hdrText = h("div");
    hdrText.appendChild(h("b", undefined, "Send feedback"));
    const hdrPage = h("div", "page");
    hdrText.appendChild(hdrPage);
    const closeBtn = h("button", "x", "✕");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closePanel);
    hdr.append(hdrText, closeBtn);

    const chips = h("div", "chips");
    const chipDefs: Array<{ key: Scope; label: string }> = [
      { key: "element", label: "◎ Element" },
      { key: "page", label: "▤ This page" },
      { key: "site", label: "✦ Whole site" },
    ];
    const chipEls = new Map<Scope, HTMLButtonElement>();
    for (const def of chipDefs) {
      const chip = h("button", "chip", def.label);
      chip.addEventListener("click", () => {
        scope = def.key;
        if (def.key === "element") startPicking();
        syncChips();
      });
      chipEls.set(def.key, chip);
      chips.appendChild(chip);
    }
    const hint = h("div", "hint");

    const textarea = h("textarea");
    textarea.maxLength = MAX_LEN;
    textarea.placeholder = "What should be improved?";
    const cnt = h("div", "cnt", `0/${MAX_LEN}`);

    // Diagnostics travel with the submission but stay OUT of the textarea: the
    // visitor should see a clean sentence they can edit, not a wall of context
    // they have to scroll past or delete.
    let diagnostics: ReportDiagnostics | null = null;
    const diagNote = h("div", "diag");
    function syncDiagnostics() {
      const text = diagnostics ? formatDiagnostics(diagnostics) : "";
      diagNote.style.display = text ? "block" : "none";
      diagNote.textContent = text ? "⚙ Technical details attached" : "";
      diagNote.title = text;
    }
    syncDiagnostics();
    textarea.addEventListener("input", () => {
      cnt.textContent = `${textarea.value.length}/${MAX_LEN}`;
      sendBtn.disabled = !textarea.value.trim();
    });

    const contact = h("input");
    contact.type = "text";
    contact.placeholder = "Name / email (optional)";
    contact.autocomplete = "off";

    // ---- image attach (file picker + paste; client-downscaled) ----
    let shot: string | null = null;
    const attachRow = h("div", "attachrow");
    const fileInput = h("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    const attachBtn = h("button", "attach", "Attach image");
    attachBtn.setAttribute("aria-label", "Attach an image (or paste one)");
    attachBtn.addEventListener("click", () => fileInput.click());
    const shotWrap = h("span", "shot");
    shotWrap.style.display = "none";
    const shotImg = h("img");
    shotImg.alt = "Attached image";
    const shotRm = h("button", "rm", "✕");
    shotRm.setAttribute("aria-label", "Remove attached image");
    shotRm.addEventListener("click", () => setShot(null));
    shotWrap.append(shotImg, shotRm);
    attachRow.append(attachBtn, shotWrap, fileInput);

    function setShot(dataUrl: string | null) {
      shot = dataUrl;
      shotWrap.style.display = dataUrl ? "" : "none";
      attachBtn.style.display = dataUrl ? "none" : "";
      if (dataUrl) shotImg.src = dataUrl;
      else shotImg.removeAttribute("src");
    }
    async function attachFile(file: Blob | null | undefined) {
      if (!file || !file.type.startsWith("image/")) return;
      const dataUrl = await downscaleImage(file);
      if (dataUrl) setShot(dataUrl);
      else errEl.textContent = "Could not attach that image — try a smaller one";
    }
    fileInput.addEventListener("change", () => {
      void attachFile(fileInput.files?.[0]);
      fileInput.value = "";
    });
    // Paste a screenshot straight into the panel (desktop muscle memory).
    panel.addEventListener("paste", (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) {
        e.preventDefault();
        void attachFile(item.getAsFile());
      }
    });

    const row = h("div", "row");
    const sendBtn = h("button", "go", "Send");
    sendBtn.disabled = true;
    sendBtn.addEventListener("click", submit);
    const cancelBtn = h("button", "ghost", "Cancel");
    cancelBtn.addEventListener("click", closePanel);
    row.append(sendBtn, cancelBtn);

    const errEl = h("div", "err");
    const keys = h("div", "keys", "Esc closes · Ctrl+Enter sends");

    panel.append(hdr, chips, hint, textarea, cnt, diagNote, contact, attachRow, row, errEl, keys);

    // ---- element-pick bar ----
    const pickbar = h("div", "pickbar");
    const pickMsg = h("span");
    const pickDone = h("button", "go", "Done");
    pickDone.addEventListener("click", stopPicking);
    const pickCancel = h("button", "ghost", "Cancel");
    pickCancel.addEventListener("click", () => {
      clearSelection();
      scope = "page";
      stopPicking();
    });
    pickbar.append(pickMsg, pickDone, pickCancel);

    // ---- behaviors ----
    function syncChips() {
      for (const [key, chip] of chipEls) chip.classList.toggle("on", key === scope);
      hint.textContent =
        scope === "element"
          ? selected.length
            ? `${selected.length} element${selected.length > 1 ? "s" : ""} selected`
            : "Pick the element the feedback is about"
          : "";
      hint.style.display = hint.textContent ? "block" : "none";
    }

    function openPanel() {
      fab.style.display = "none";
      hdrPage.textContent = document.title || location.pathname;
      root.append(backdrop, panel);
      syncChips();
      document.addEventListener("keydown", onKeydown, true);
      textarea.focus();
    }

    function closePanel() {
      if (picking) stopPicking();
      clearSelection();
      backdrop.remove();
      panel.remove();
      document.removeEventListener("keydown", onKeydown, true);
      scope = "page";
      textarea.value = "";
      contact.value = "";
      setShot(null);
      cnt.textContent = `0/${MAX_LEN}`;
      diagnostics = null;
      syncDiagnostics();
      errEl.textContent = "";
      sendBtn.disabled = true;
      submitting = false;
      sendBtn.textContent = "Send";
      fab.style.display = "";
    }

    function onKeydown(e: KeyboardEvent) {
      // The panel is a modal overlay rendered in a shadow root. Host pages bind
      // global hotkeys (⌘K command palette, "/" search, "?" help, digit
      // shortcuts) on window/document. Because the event retargets to the shadow
      // HOST element when it crosses the boundary, the host's own
      // "is the user typing?" guard reads the wrong node and fires anyway —
      // stealing keystrokes while the user types feedback (observed on both
      // orangecat.ch and fleetcrown.orangecat.ch, which embed this same widget).
      // While the panel is open we own the keyboard: stop every keystroke at the
      // shadow boundary so nothing leaks to the host's global shortcuts. This is
      // standard modal keyboard-trap behaviour and is the single fix that covers
      // every embedding host at once.
      e.stopPropagation();
      if (e.key === "Escape") {
        if (picking) stopPicking();
        else closePanel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!sendBtn.disabled) void submit();
      }
    }

    // Full-viewport shield: blocks host navigation/handlers during pick.
    // Target resolution uses elementsFromPoint so we still hit the real DOM
    // under the shield (capture-only listeners on the host page were not
    // enough — some Next Link clicks still navigated mid-pick).
    const pickShield = h("div");
    pickShield.id = "fcw-pick-shield";
    pickShield.setAttribute("aria-hidden", "true");
    Object.assign(pickShield.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147482999",
      cursor: "crosshair",
      background: "transparent",
    } as CSSStyleDeclaration);

    function targetUnderPoint(x: number, y: number): Element | null {
      const stack = document.elementsFromPoint(x, y);
      for (const node of stack) {
        if (node === pickShield || node === host || host.contains(node)) continue;
        if (node instanceof Element) return resolvePickTarget(node);
      }
      return null;
    }

    function onPickMove(e: MouseEvent) {
      const target = targetUnderPoint(e.clientX, e.clientY);
      if (!target) return;
      if (hoverNode && hoverNode !== target) hoverNode.classList.remove("fcw-hover");
      hoverNode = target;
      target.classList.add("fcw-hover");
    }

    function onPickClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const target = targetUnderPoint(e.clientX, e.clientY);
      if (!target) return;
      const selector = generateSelector(target);
      const idx = selected.findIndex((s) => s.selector === selector);
      if (idx > -1) {
        selected.splice(idx, 1);
        selectedNodes[idx]?.classList.remove("fcw-selected");
        selectedNodes.splice(idx, 1);
      } else if (selected.length < MAX_ELEMENTS) {
        selected.push({
          elementType: target.tagName.toLowerCase(),
          elementText: elementLabel(target),
          selector,
        });
        selectedNodes.push(target);
        target.classList.add("fcw-selected");
      }
      syncPickbar();
    }

    function syncPickbar() {
      if (selected.length === 0) {
        pickMsg.textContent = "Click the element your feedback is about";
        pickDone.disabled = true;
        return;
      }
      const last = selected[selected.length - 1];
      const label = last.elementText || last.selector;
      pickMsg.textContent =
        selected.length === 1
          ? `Selected: ${label} — click more or Done`
          : `${selected.length} selected (last: ${label}) — Done when ready`;
      pickDone.disabled = false;
    }

    function startPicking() {
      if (picking) return;
      picking = true;
      document.head.appendChild(docStyle);
      backdrop.remove();
      panel.remove();
      // Shield lives in the shadow root under the pickbar so Done/Cancel stay
      // clickable; fixed positioning still covers the host page viewport.
      root.append(pickShield, pickbar);
      syncPickbar();
      pickShield.addEventListener("mousemove", onPickMove, true);
      pickShield.addEventListener("click", onPickClick, true);
      // Also swallow pointerdown so Next <Link> / button handlers never fire.
      pickShield.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
    }

    function stopPicking() {
      if (!picking) return;
      picking = false;
      pickShield.removeEventListener("mousemove", onPickMove, true);
      pickShield.removeEventListener("click", onPickClick, true);
      pickShield.remove();
      hoverNode?.classList.remove("fcw-hover");
      hoverNode = null;
      pickbar.remove();
      root.append(backdrop, panel);
      if (scope === "element" && selected.length === 0) scope = "page";
      syncChips();
      textarea.focus();
    }

    function clearSelection() {
      for (const node of selectedNodes) node.classList.remove("fcw-selected");
      selected = [];
      selectedNodes = [];
      docStyle.remove();
    }

    function suggestionWithDiagnostics(): string {
      return buildSuggestion(textarea.value, diagnostics, MAX_LEN);
    }

    async function submit() {
      if (submitting || !textarea.value.trim()) return;
      submitting = true;
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending…";
      errEl.textContent = "";
      try {
        const res = await fetch(`${apiBase}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            suggestion: suggestionWithDiagnostics(),
            contact: contact.value.trim() || undefined,
            page: location.pathname,
            url: location.href.slice(0, 1000),
            pageTitle: document.title.slice(0, 300) || undefined,
            scope,
            screenshot: shot ?? undefined,
            selectedElements: selected.length ? selected : undefined,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        showSuccess();
      } catch (err) {
        submitting = false;
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        errEl.textContent = err instanceof Error ? err.message : "Could not send, try again";
      }
    }

    function showSuccess() {
      panel.textContent = "";
      const ok = h("div", "ok");
      const tick = h("div", "tick", "✓");
      ok.append(tick, h("p", undefined, "Thanks! Your feedback was sent."));
      panel.appendChild(ok);
      setTimeout(() => {
        closePanel();
        // Rebuild the form for the next open (success view replaced it).
        panel.textContent = "";
        panel.append(
          hdr,
          chips,
          hint,
          textarea,
          cnt,
          diagNote,
          contact,
          attachRow,
          row,
          errEl,
          keys,
        );
      }, 2200);
    }

    // Programmatic entry point: open prefilled so "report this" is one click.
    // An already-open panel is left alone — the visitor may be mid-sentence,
    // and silently replacing their text would lose it.
    liveReport = (input: ReportInput) => {
      if (panel.isConnected) {
        textarea.focus();
        return;
      }
      openPanel();
      diagnostics = input.diagnostics ?? null;
      syncDiagnostics();
      if (input.message) {
        textarea.value = input.message.slice(0, MAX_LEN);
        cnt.textContent = `${textarea.value.length}/${MAX_LEN}`;
        sendBtn.disabled = !textarea.value.trim();
        // Caret at the end: the visitor adds detail, never clears boilerplate.
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    };
    // Only now can a click actually open something — see FleetCrownApi.ready.
    api.ready = true;
    if (pendingReport) {
      const held = pendingReport;
      pendingReport = null;
      liveReport(held);
    }
  };

  // Boot gate — the server decides whether to render at all. This makes the
  // FleetCrown token row a remote kill switch: pausing/revoking hides the FAB
  // on the customer site within the cache window, no deploy needed. It also
  // doubles as the heartbeat behind the setup UI's "Live" state. Fail closed:
  // if FleetCrown is unreachable, submissions couldn't land anyway — don't
  // render a dead FAB.
  const boot = async () => {
    try {
      const res = await fetch(`${apiBase}/api/widget-boot?token=${encodeURIComponent(token)}`);
      const body = (await res.json()) as { active?: boolean };
      if (body.active !== true) return;
    } catch {
      return;
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  };
  void boot();
})();
