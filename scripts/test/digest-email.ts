/**
 * The digest email has to survive an inbox.
 *
 * It used to ship the subject "FleetCrown daily digest" — byte-identical every
 * day — over a body that opened with the generic line "What your fleet did in
 * the last 24 hours". An inbox shows a subject and maybe a preview; a recurring
 * email whose subject never changes trains you to archive it unread however
 * good the body is.
 *
 * These cases pin the two things that fixes it: a subject that reflects the
 * actual state worst-first, and a body whose first numbers match the ones the
 * Activity page leads with.
 *
 * Run: npx tsx scripts/test/digest-email.ts (or npm run test:unit)
 */
import assert from "node:assert/strict";

// lib/email.ts reaches the DB for send logging (logDebug), and this suite must
// run with no DATABASE_URL like every other unit test. The pool is lazy — it is
// constructed at import and never connected — so a syntactically valid dummy
// URL is enough to load the module. Set BEFORE the dynamic import below.
process.env.DATABASE_URL ??= "postgres://unit:test@127.0.0.1:5432/unit";

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ${label}`);
};

type DigestEmailTemplate = typeof import("@/lib/email").digestEmailTemplate;

const base = {
  markdown:
    "**Headline:** truthseeker timed out overnight.\n\n## Needs you\n- **truthseeker** — timed out after 1h.",
  cadenceLabel: "daily",
  windowLabel: "the last 24 hours",
  activityUrl: "https://fleetcrown.orangecat.ch/activity",
};

async function main() {
  const { digestEmailTemplate }: { digestEmailTemplate: DigestEmailTemplate } =
    await import("@/lib/email");

  console.log("digestEmailTemplate — the subject line");

  check("carries the real state instead of a fixed string", () => {
    const { subject } = digestEmailTemplate({
      ...base,
      stats: { attention: 1, shipped: 3, running: 0, agentLabel: "4h 12m" },
    });
    assert.ok(subject.includes("1 needs you"), subject);
    assert.ok(subject.includes("3 shipped"), subject);
  });

  check("leads with what is broken, not with what went well", () => {
    const { subject } = digestEmailTemplate({
      ...base,
      stats: { attention: 2, shipped: 9, running: 0, agentLabel: null },
    });
    assert.ok(
      subject.indexOf("2 needs you") < subject.indexOf("9 shipped"),
      `failures must come first in the subject: ${subject}`,
    );
  });

  check("a clean busy window still says something specific", () => {
    const { subject } = digestEmailTemplate({
      ...base,
      stats: { attention: 0, shipped: 5, running: 1, agentLabel: "2h" },
    });
    assert.ok(subject.includes("5 shipped"), subject);
    assert.ok(!subject.includes("needs you"), subject);
  });

  check("a window with only in-flight work reports that rather than nothing", () => {
    const { subject } = digestEmailTemplate({
      ...base,
      stats: { attention: 0, shipped: 0, running: 2, agentLabel: null },
    });
    assert.ok(subject.includes("2 running"), subject);
  });

  check("without stats it degrades to the old shape rather than inventing numbers", () => {
    const { subject, html } = digestEmailTemplate(base);
    assert.ok(subject.includes("daily digest"), subject);
    assert.ok(!/\d+ needs you/.test(html), "no fabricated counts");
  });

  console.log("\ndigestEmailTemplate — the body");

  check("opens with the same numbers the page leads with", () => {
    const { html } = digestEmailTemplate({
      ...base,
      stats: { attention: 1, shipped: 3, running: 0, agentLabel: "4h 12m" },
    });
    const stripIdx = html.indexOf("needs you");
    const reportIdx = html.indexOf("Headline");
    assert.ok(stripIdx >= 0, "stat strip missing");
    assert.ok(stripIdx < reportIdx, "the answer must come before the report");
  });

  check("agent time is stated when known — it is the fleet's actual output", () => {
    const { html } = digestEmailTemplate({
      ...base,
      stats: { attention: 0, shipped: 1, running: 0, agentLabel: "4h 12m" },
    });
    assert.ok(html.includes("4h 12m"), "agent time missing from the body");
  });

  check("a zero bucket is omitted, never printed as a hollow '0'", () => {
    const { html } = digestEmailTemplate({
      ...base,
      stats: { attention: 0, shipped: 2, running: 0, agentLabel: null },
    });
    assert.ok(!html.includes("needs you"), "a zero-failure window must not show a failures stat");
    assert.ok(!html.includes("running"), "a zero-running window must not show a running stat");
    assert.ok(html.includes("shipped"), html.slice(0, 200));
  });

  check("every stat ships beside a word, never colour alone", () => {
    const { html } = digestEmailTemplate({
      ...base,
      stats: { attention: 1, shipped: 1, running: 1, agentLabel: null },
    });
    for (const word of ["needs you", "shipped", "running"]) {
      assert.ok(html.includes(word), `${word} label missing — colour would be the only encoding`);
    }
  });

  check("the plain-text part carries the facts too", () => {
    const { text } = digestEmailTemplate({
      ...base,
      stats: { attention: 1, shipped: 3, running: 0, agentLabel: "4h 12m" },
    });
    assert.ok(text.includes("1 needs you"), text.slice(0, 120));
    assert.ok(text.includes(base.activityUrl), "the way back into the app must survive plain text");
  });

  console.log(`\n${passed}/${passed} digest-email cases passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
