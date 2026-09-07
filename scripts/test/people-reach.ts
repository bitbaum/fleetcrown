import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lastTalkLabel, reachChannels, whatsappHref, mailtoHref } from "../../src/lib/people-reach";
import { ACTION_COPY } from "../../src/config/action-copy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

assert.deepEqual(reachChannels({}), []);
assert.deepEqual(reachChannels({ "channel:email": "derek@x.test", profession: "builder" }), [
  { label: "Email", value: "derek@x.test", href: "mailto:derek@x.test" },
]);
assert.equal(reachChannels({ "channel:phone": "e164:+41790000000" })[0]?.value, "+41790000000");

assert.equal(lastTalkLabel(null), ACTION_COPY.checkin.never);
assert.match(ACTION_COPY.checkin.groupWhy, /does not message/i);
assert.match(ACTION_COPY.checkin.remindedAll(3), /3 reminders/);
assert.match(ACTION_COPY.dispatch.sent("fleetcrown"), /fleetcrown/);

assert.equal(
  whatsappHref("+41 78 659 86 13", "Hi Manu"),
  "https://wa.me/41786598613?text=Hi%20Manu",
);

// ── Every channel gets the right link, or honestly gets none ─────────────────
// The Today check-in row printed these as inert text you had to select and
// copy, on a row whose entire purpose is reaching the person. mailtoHref had
// no caller at all.
const href = (key: string, value: string) => reachChannels({ [key]: value })[0]?.href;

assert.equal(href("channel:phone", "e164:+41790000000"), "tel:+41790000000");
assert.equal(href("channel:whatsapp", "+41 78 659 86 13"), "https://wa.me/41786598613");
assert.equal(href("channel:telegram", "@catomean"), "https://t.me/catomean");
assert.equal(href("channel:telegram", "catomean"), "https://t.me/catomean");
assert.equal(href("channel:email", "a@b.test"), "mailto:a@b.test");

// No link beats a wrong link.
assert.equal(href("channel:in-person", "Zurich"), null, "in person opens nothing");
assert.equal(href("channel:other", "carrier pigeon"), null, "unknown channel opens nothing");
assert.equal(href("channel:phone", "123"), null, "too short to be a number");
assert.equal(href("channel:email", "not-an-email"), null, "no @ means no mailto");
assert.equal(
  href("channel:telegram", "+41790000000"),
  null,
  "a phone in the telegram field is an invite link, not a handle — do not guess",
);

// ── The href is BUILT, never passed through ─────────────────────────────────
// A person attribute is user-entered text. Dropping it into an href unfiltered
// is how `javascript:` ends up one click from the operator.
for (const hostile of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "  javascript:alert(1)  ",
]) {
  for (const key of ["channel:phone", "channel:telegram", "channel:whatsapp", "channel:email"]) {
    const built = href(key, hostile);
    assert.ok(
      built === null || /^(tel:\+|https:\/\/(wa\.me|t\.me)\/|mailto:)/.test(built),
      `${key} built a non-allowlisted scheme from ${JSON.stringify(hostile)}: ${built}`,
    );
  }
}
// mailto is the one that can carry a colon-bearing local part; prove it still
// cannot produce a javascript: URL.
assert.equal(mailtoHref("javascript:alert(1)"), null, "no @ means no mailto, hostile or not");

// ── EVERY surface that renders a contact value must link it ─────────────────
// Returning an href that nothing uses is the state this change fixed. The
// first attempt fixed only Today's row and left the People detail panel
// printing inert text — an instance, not the class. Both are asserted here, so
// a third surface has a list to join rather than a habit to rediscover.
const REACH_SURFACES = [
  ["src/components/today/CheckinPersonRow.tsx", /href=\{c\.href\}/],
  ["src/components/people/PersonChannelsSection.tsx", /href=\{href\}/],
] as const;

for (const [rel, pattern] of REACH_SURFACES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert.match(src, pattern, `${rel} renders the channel href`);
  assert.match(src, /rel="noopener noreferrer"/, `${rel} carries rel=noopener on reach links`);
  assert.match(
    src,
    /from "@\/lib\/people-reach"/,
    `${rel} gets its href from the shared builder, not its own`,
  );
}

console.log("✓ people-reach / action-copy tests passed");
