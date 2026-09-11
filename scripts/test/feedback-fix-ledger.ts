// Pure tests for the fix ledger (src/lib/feedback/fix-shipping.ts): what
// happens to a fix after the agent finished, and the one canonical live URL.
//
// Regression pins:
// 1. "Check live" at run close was a lie — the agent's job ends at a PR, so
//    a fresh success is PR_OPEN, never DEPLOYED, until GitHub says merged and
//    a deploy-like workflow succeeded on the merge commit.
// 2. The live page is the PROJECT's origin + the reported path. A visitor on a
//    preview host or a fixture URL (…example/) must not become the link.
import assert from "node:assert/strict";
import {
  deriveShippingFromPr,
  firstSentence,
  FIX_SHIP_STATE,
  FIX_REFRESH_MS,
  fixNeedsRefresh,
  isFixShipTerminal,
  livePageHref,
  parseGithubRepoRef,
  parsePrRef,
  pickDeployRun,
} from "../../src/lib/feedback/fix-shipping";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "../../src/lib/feedback/work-phase";
import { FEEDBACK_STATUS } from "../../src/lib/constants/statuses";
import { ORCH_STATE, ORCHESTRATION_OUTCOME } from "../../src/lib/orchestration/contract";

const GIT = "https://github.com/bitbaum/dogfood-site-sep10-1201";

// PR reference from the handoff — the real handoff from 2026-09-11.
{
  const done =
    'Added a one-line "Last updated" note (rendered at build time) to the home page footer per visitor feedback; opened PR #1 on branch feat/footer-last-updated (commit 6b9015f), no CI checks configured on this repo so nothing is red.';
  const ref = parsePrRef(done, GIT);
  assert.deepEqual(ref, {
    owner: "bitbaum",
    repo: "dogfood-site-sep10-1201",
    number: 1,
    url: `${GIT}/pull/1`,
  });
  assert.equal(parsePrRef(done, null), null, "a bare number without a repo means nothing");
  assert.deepEqual(
    parsePrRef("see https://github.com/o/r/pull/7 please", GIT)?.url,
    "https://github.com/o/r/pull/7",
    "a full URL wins over the project repo",
  );
  assert.equal(parsePrRef("no pull request opened", GIT), null);
  assert.deepEqual(parseGithubRepoRef("git@github.com:bitbaum/annushka.git"), {
    owner: "bitbaum",
    repo: "annushka",
  });
}

// GitHub's answer → state.
{
  const at = "2026-09-11T12:00:00.000Z";
  const open = {
    number: 1,
    html_url: `${GIT}/pull/1`,
    title: "t",
    state: "open" as const,
    merged_at: null,
    merge_commit_sha: null,
  };
  assert.equal(deriveShippingFromPr(open, null, at).state, FIX_SHIP_STATE.PR_OPEN);
  assert.equal(
    deriveShippingFromPr({ ...open, state: "closed" }, null, at).state,
    FIX_SHIP_STATE.PR_CLOSED,
  );
  const merged = { ...open, state: "closed" as const, merged_at: at, merge_commit_sha: "abc" };
  assert.equal(
    deriveShippingFromPr(merged, null, at).state,
    FIX_SHIP_STATE.MERGED,
    "merged with no runs seen = merged",
  );
  assert.equal(
    deriveShippingFromPr(
      merged,
      [{ name: "CI", status: "completed", conclusion: "success", html_url: null }],
      at,
    ).state,
    FIX_SHIP_STATE.MERGED,
    "a CI-only repo cannot prove a deploy",
  );
  assert.equal(
    deriveShippingFromPr(
      merged,
      [{ name: "Deploy", status: "in_progress", conclusion: null, html_url: null }],
      at,
    ).state,
    FIX_SHIP_STATE.DEPLOYING,
  );
  assert.equal(
    deriveShippingFromPr(
      merged,
      [{ name: "Deploy", status: "completed", conclusion: "success", html_url: "u" }],
      at,
    ).state,
    FIX_SHIP_STATE.DEPLOYED,
  );
  assert.equal(
    deriveShippingFromPr(
      merged,
      [{ name: "Deploy", status: "completed", conclusion: "failure", html_url: "u" }],
      at,
    ).state,
    FIX_SHIP_STATE.DEPLOY_FAILED,
  );
  assert.equal(
    deriveShippingFromPr(
      merged,
      [{ name: "Deploy", status: "completed", conclusion: "skipped", html_url: "u" }],
      at,
    ).state,
    FIX_SHIP_STATE.MERGED,
    "a skipped deploy proves nothing either way",
  );
  assert.equal(
    pickDeployRun([
      { name: "Deploy", status: "completed", conclusion: "skipped", html_url: null },
      { name: "Deploy", status: "completed", conclusion: "success", html_url: null },
    ])?.conclusion,
    "success",
    "a later successful Deploy beats an earlier skipped one",
  );
  assert.equal(isFixShipTerminal(FIX_SHIP_STATE.DEPLOYED), true);
  assert.equal(isFixShipTerminal(FIX_SHIP_STATE.PR_OPEN), false);
}

// Refresh economics.
{
  const now = Date.now();
  assert.equal(fixNeedsRefresh(null, now), true);
  assert.equal(
    fixNeedsRefresh(
      {
        state: FIX_SHIP_STATE.DEPLOYED,
        checkedAt: new Date(now - 10 * FIX_REFRESH_MS).toISOString(),
      },
      now,
    ),
    false,
    "terminal = never again",
  );
  assert.equal(
    fixNeedsRefresh(
      { state: FIX_SHIP_STATE.PR_OPEN, checkedAt: new Date(now - 1000).toISOString() },
      now,
    ),
    false,
    "fresh = wait",
  );
  assert.equal(
    fixNeedsRefresh(
      {
        state: FIX_SHIP_STATE.PR_OPEN,
        checkedAt: new Date(now - FIX_REFRESH_MS - 1).toISOString(),
      },
      now,
    ),
    true,
  );
}

// The canonical live page.
{
  assert.equal(
    livePageHref("https://annushka.orangecat.ch", "https://annushka.orangecat.ch/en/", "/en/"),
    "https://annushka.orangecat.ch/en/",
  );
  assert.equal(
    livePageHref(
      "https://dogfood-site-sep10-1201.orangecat.ch",
      "https://dogfood-site-sep10-1201.example/",
      "/",
    ),
    "https://dogfood-site-sep10-1201.orangecat.ch/",
    "a fixture host never becomes the link when the project has a live URL",
  );
  assert.equal(
    livePageHref("https://site.example/", "https://preview-42.vercel.app/pricing?x=1", "/pricing"),
    "https://site.example/pricing?x=1",
    "path and query travel, the preview host does not",
  );
  assert.equal(
    livePageHref(null, "https://only-reported.example/a", "/a"),
    "https://only-reported.example/a",
    "no live URL = the reported one",
  );
  assert.equal(
    livePageHref("https://site.example", null, "/contact"),
    "https://site.example/contact",
  );
  assert.equal(livePageHref(null, null, "/contact"), null);
}

// The row's words per state.
{
  const base = {
    id: "r",
    state: ORCH_STATE.DONE,
    outcome: ORCHESTRATION_OUTCOME.SUCCESS,
    startedAt: new Date(),
    finishedAt: new Date(),
    deliveredAt: null,
    lastProgressAt: null,
    error: null,
    summaryDone:
      "Added the About page; opened PR #2 on branch feat/about (commit 4252c90), checks green.",
  };
  const at = new Date().toISOString();
  const pr = { number: 2, url: `${GIT}/pull/2`, title: "About page" };
  const open = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
    ...base,
    fix: { state: FIX_SHIP_STATE.PR_OPEN, pr, checkedAt: at },
  });
  assert.equal(open.phase, FEEDBACK_WORK_PHASE.NEEDS_VERIFY);
  assert.equal(open.label, "PR #2 · open");
  assert.equal(open.checkLive, undefined, "an open PR is NOT a reason to check the live page");
  assert.equal(open.didLine, "Added the About page;");
  const live = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
    ...base,
    fix: { state: FIX_SHIP_STATE.DEPLOYED, pr, checkedAt: at },
  });
  assert.equal(live.label, "Live · confirm");
  assert.equal(live.checkLive, true);
  const none = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
    ...base,
    fix: { state: FIX_SHIP_STATE.NO_EVIDENCE, checkedAt: at },
  });
  assert.equal(none.label, "Finished · nothing shipped");
  const closed = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, {
    ...base,
    fix: { state: FIX_SHIP_STATE.PR_CLOSED, pr, checkedAt: at },
  });
  assert.equal(
    closed.phase,
    FEEDBACK_WORK_PHASE.FAILED,
    "closed without merge is a failure with Retry",
  );
  const pending = deriveFeedbackWork(FEEDBACK_STATUS.DISPATCHED, { ...base, fix: null });
  assert.equal(pending.label, "Finished");
  assert.equal(pending.checkLive, undefined, "no ledger yet = no live claim");
  assert.equal(firstSentence("Short."), "Short.");
  assert.equal(firstSentence("x".repeat(200)).length, 160);
}

console.log("feedback-fix-ledger: ok");
