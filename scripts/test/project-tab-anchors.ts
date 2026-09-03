// One element per anchor on the project page.
//
// The project page used to be a scroll of sections with `id="feedback"`,
// `id="settings"` and so on, linked from a jump-nav. Those sections became TAB
// PANELS, and the panels took ids of their own — so for a while BOTH existed:
// a panel `panel-feedback` and, inside it, a section still carrying the legacy
// `id="feedback"`.
//
// That is not cosmetic. Every panel stays mounted (they hold unsaved drafts),
// so loading /projects/<id>#feedback handed the browser a real element to
// scroll to that lived inside a HIDDEN panel — native anchor behaviour racing
// the tab logic over the same name. ControlInbox and FeedbackItemRow both link
// that way, so it is the common path, not an edge case.
//
// The rule this pins: a tab id may exist exactly once in the DOM, on the panel.
// No section inside a panel may re-declare it.
// Run: npx tsx scripts/test/project-tab-anchors.ts
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECTS_DIR = join(ROOT, "src/components/projects");

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

const view = readFileSync(join(PROJECTS_DIR, "ProjectWorkspaceView.tsx"), "utf8");
const tabsSrc = readFileSync(join(PROJECTS_DIR, "ProjectTabs.tsx"), "utf8");

// The tab ids are declared in the ProjectTabs call in ProjectWorkspaceView.
const tabIds = [...view.matchAll(/^\s*id:\s*"([a-z-]+)",$/gm)].map((m) => m[1]);
ok(tabIds.length >= 5, `found the tab ids in ProjectWorkspaceView (got ${tabIds.length})`);
ok(tabIds.includes("feedback"), "feedback is a tab — it is what ControlInbox deep-links to");

// The panel must BE the anchor, so the element the browser scrolls to is the
// element that becomes visible.
ok(
  /id=\{tab\.id\}/.test(tabsSrc),
  "the tab panel uses id={tab.id} — the panel owns the hash, not a nested section",
);
ok(
  !/id=\{`panel-\$\{tab\.id\}`\}/.test(tabsSrc),
  "no `panel-` prefix: that is what created a second element for the same concept",
);
ok(/aria-controls=\{tab\.id\}/.test(tabsSrc), "aria-controls points at the panel's real id");

// No component rendered inside a panel may re-declare a tab id.
const files = readdirSync(PROJECTS_DIR).filter(
  (f) => f.endsWith(".tsx") && f !== "ProjectTabs.tsx",
);
for (const id of tabIds) {
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(PROJECTS_DIR, f), "utf8");
    // Match a literal element id, not a string inside a comment or a template.
    if (new RegExp(`\\sid="${id}"`).test(src)) offenders.push(f);
  }
  ok(
    offenders.length === 0,
    `no section re-declares id="${id}"${offenders.length ? ` — found in ${offenders.join(", ")}` : ""}`,
  );
}

// The deep links that make this matter must still exist and still be bare
// hashes, since that is what the tablist reads on mount.
const inbox = readFileSync(join(ROOT, "src/components/control/ControlInbox.tsx"), "utf8");
ok(
  /\/projects\/\$\{[^}]+\}#feedback/.test(inbox),
  "ControlInbox still deep-links to #feedback (the reason this invariant exists)",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
