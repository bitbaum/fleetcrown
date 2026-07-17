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

type Scope = "element" | "page" | "site";
type SelectedEl = { elementType: string; elementText: string; selector: string };

const ACCENT = "#e0680f";
const MAX_LEN = 2000;
const MAX_ELEMENTS = 10;

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
  transition: transform .15s ease;
}
.fab:hover { transform: scale(1.08); }
.fab svg { width: 20px; height: 20px; }
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
input { margin-bottom: 10px; }
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

const PENCIL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

/** id-first CSS selector for a clicked element (ported from revampit's
 *  element-selector.ts; hardened for SVG where className isn't a string). */
function generateSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const cls = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c && !c.startsWith("fcw-"));
  if (cls.length > 0) return `${el.tagName.toLowerCase()}.${cls.slice(0, 2).join(".")}`;
  return el.tagName.toLowerCase();
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
  if (document.getElementById("fleetcrown-feedback-host")) return;

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
    fab.innerHTML = PENCIL_SVG;
    fab.setAttribute("aria-label", "Give feedback");
    fab.setAttribute("aria-haspopup", "dialog");
    fab.addEventListener("click", openPanel);
    root.appendChild(fab);

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
    textarea.addEventListener("input", () => {
      cnt.textContent = `${textarea.value.length}/${MAX_LEN}`;
      sendBtn.disabled = !textarea.value.trim();
    });

    const contact = h("input");
    contact.type = "text";
    contact.placeholder = "Name / email (optional)";
    contact.autocomplete = "off";

    const row = h("div", "row");
    const sendBtn = h("button", "go", "Send");
    sendBtn.disabled = true;
    sendBtn.addEventListener("click", submit);
    const cancelBtn = h("button", "ghost", "Cancel");
    cancelBtn.addEventListener("click", closePanel);
    row.append(sendBtn, cancelBtn);

    const errEl = h("div", "err");
    const keys = h("div", "keys", "Esc closes · Ctrl+Enter sends");

    panel.append(hdr, chips, hint, textarea, cnt, contact, row, errEl, keys);

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
      cnt.textContent = `0/${MAX_LEN}`;
      errEl.textContent = "";
      sendBtn.disabled = true;
      submitting = false;
      sendBtn.textContent = "Send";
      fab.style.display = "";
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (picking) stopPicking();
        else closePanel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!sendBtn.disabled) void submit();
      }
    }

    // -- element picking: listeners are document-level + capture so the host
    //    page can't swallow them; our own UI is skipped via composedPath.
    function isOwnUi(e: Event): boolean {
      return e.composedPath().includes(host);
    }

    function onPickMove(e: MouseEvent) {
      if (isOwnUi(e)) return;
      const target = e.target as Element;
      if (hoverNode && hoverNode !== target) hoverNode.classList.remove("fcw-hover");
      hoverNode = target;
      target.classList.add("fcw-hover");
    }

    function onPickClick(e: MouseEvent) {
      if (isOwnUi(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as Element;
      const selector = generateSelector(target);
      const idx = selected.findIndex((s) => s.selector === selector);
      if (idx > -1) {
        selected.splice(idx, 1);
        selectedNodes[idx]?.classList.remove("fcw-selected");
        selectedNodes.splice(idx, 1);
      } else if (selected.length < MAX_ELEMENTS) {
        selected.push({
          elementType: target.tagName.toLowerCase(),
          elementText: (target.textContent ?? "").trim().slice(0, 100),
          selector,
        });
        selectedNodes.push(target);
        target.classList.add("fcw-selected");
      }
      syncPickbar();
    }

    function syncPickbar() {
      pickMsg.textContent = selected.length
        ? `${selected.length} selected — click more or Done`
        : "Click the element your feedback is about";
    }

    function startPicking() {
      if (picking) return;
      picking = true;
      document.head.appendChild(docStyle);
      backdrop.remove();
      panel.remove();
      root.appendChild(pickbar);
      syncPickbar();
      document.addEventListener("mousemove", onPickMove, true);
      document.addEventListener("click", onPickClick, true);
    }

    function stopPicking() {
      if (!picking) return;
      picking = false;
      document.removeEventListener("mousemove", onPickMove, true);
      document.removeEventListener("click", onPickClick, true);
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
            suggestion: textarea.value.trim().slice(0, MAX_LEN),
            contact: contact.value.trim() || undefined,
            page: location.pathname,
            url: location.href.slice(0, 1000),
            pageTitle: document.title.slice(0, 300) || undefined,
            scope,
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
        panel.append(hdr, chips, hint, textarea, cnt, contact, row, errEl, keys);
      }, 2200);
    }
  };

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
