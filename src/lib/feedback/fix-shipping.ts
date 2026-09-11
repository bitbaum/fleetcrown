/**
 * The fix ledger — what happened to a fix AFTER the agent finished.
 *
 * "Check live" used to appear the moment a run closed with success, and it
 * opened whatever URL the visitor had reported. Both halves were wrong. The
 * agent's job ends at a pull request (compose-dispatch's SHIP_INSTRUCTION),
 * so at close time the change is a PR nobody has merged, on a site nobody
 * has redeployed — "check live" would show the unchanged page. And the
 * reported URL is where the visitor happened to be (a preview, a stale host,
 * a fixture), not where the product lives.
 *
 * This module is the pure half: the shape of "where the fix is", how to find
 * the PR the agent named, how to read GitHub's answer, and the one canonical
 * "live page" URL. The server half (fix-shipping-refresh.ts) talks to GitHub
 * and caches the result on the run.
 */

export const FIX_SHIP_STATE = {
  /** Run said success, but no PR, push or commit could be found. */
  NO_EVIDENCE: "no_evidence",
  /** A branch was pushed; no PR opened. */
  PUSHED: "pushed",
  /** PR exists and is open. The repo's own path (auto-merge or a human) decides. */
  PR_OPEN: "pr_open",
  /** PR closed without merging. Nothing shipped. */
  PR_CLOSED: "pr_closed",
  /** Merged; no deploy observed yet (or the repo has no deploy workflow). */
  MERGED: "merged",
  /** Merged and a deploy-like workflow is still running on the merge commit. */
  DEPLOYING: "deploying",
  /** Merged and a deploy-like workflow succeeded on the merge commit. */
  DEPLOYED: "deployed",
  /** Merged and the deploy-like workflow failed on the merge commit. */
  DEPLOY_FAILED: "deploy_failed",
} as const;
export type FixShipState = (typeof FIX_SHIP_STATE)[keyof typeof FIX_SHIP_STATE];

export type FixShipping = {
  state: FixShipState;
  pr?: {
    number: number;
    url: string;
    title: string;
    mergedAt?: string | null;
    mergeSha?: string | null;
  };
  push?: { url: string; title: string };
  deploy?: { url: string | null; name: string; conclusion: string | null; status: string | null };
  /** ISO — when GitHub was last asked. */
  checkedAt: string;
  /** No GitHub token / API failure: the state is what the handoff claimed, unverified. */
  unverified?: boolean;
  /** FleetCrown merged this itself because the project opted in. */
  shippedByFleet?: boolean;
  /** Automatic shipping is on but declined to merge — why (see auto-ship.ts). */
  autoShipHold?: string;
};

/** How long a non-terminal ledger entry is trusted before GitHub is asked again. */
export const FIX_REFRESH_MS = 60_000;

export function fixNeedsRefresh(cached: FixShipping | null | undefined, now = Date.now()): boolean {
  if (!cached) return true;
  if (isFixShipTerminal(cached.state)) return false;
  const t = Date.parse(cached.checkedAt);
  return !Number.isFinite(t) || now - t > FIX_REFRESH_MS;
}

/** States that never change again — no point asking GitHub. */
export function isFixShipTerminal(state: FixShipState): boolean {
  return (
    state === FIX_SHIP_STATE.DEPLOYED ||
    state === FIX_SHIP_STATE.PR_CLOSED ||
    state === FIX_SHIP_STATE.DEPLOY_FAILED
  );
}

export type PrRef = { owner: string; repo: string; number: number; url: string };

export function parseGithubRepoRef(
  gitUrl: string | null | undefined,
): { owner: string; repo: string } | null {
  const m = (gitUrl ?? "").trim().match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * The PR the agent named in its handoff — "opened PR #2 on branch …",
 * "https://github.com/o/r/pull/7". Full URLs win over bare numbers (a bare
 * number needs the project's repo to mean anything). Returns null rather than
 * guessing when neither is present.
 */
export function parsePrRef(
  text: string | null | undefined,
  gitUrl: string | null | undefined,
): PrRef | null {
  const t = text ?? "";
  const full = t.match(/https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  if (full) {
    const number = Number(full[3]);
    return {
      owner: full[1],
      repo: full[2],
      number,
      url: `https://github.com/${full[1]}/${full[2]}/pull/${number}`,
    };
  }
  const repo = parseGithubRepoRef(gitUrl);
  if (!repo) return null;
  const bare = t.match(/\bPR\s*#(\d+)|\bpull request\s*#(\d+)|\bpull\/(\d+)\b/i);
  const n = bare ? Number(bare[1] ?? bare[2] ?? bare[3]) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    owner: repo.owner,
    repo: repo.repo,
    number: n,
    url: `https://github.com/${repo.owner}/${repo.repo}/pull/${n}`,
  };
}

/** GitHub's PR object, only the fields the ledger reads. */
export type GithubPrDetail = {
  number: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  merged_at: string | null;
  merge_commit_sha: string | null;
  /** Only read when deciding whether FleetCrown may merge it (see auto-ship.ts). */
  draft?: boolean;
  /** null while GitHub is still computing mergeability — never treat as true. */
  mergeable?: boolean | null;
  headSha?: string | null;
};
/** GitHub's workflow run object, only the fields the ledger reads. */
export type GithubWorkflowRun = {
  name: string | null;
  status: string | null; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | …
  html_url: string | null;
};

const DEPLOY_NAME = /deploy|ship|release|publish/i;

/** Which of the merge commit's workflow runs is the deploy, if any. A repo
 *  with only a CI workflow has none — then "merged" is as far as we can see. */
export function pickDeployRun(runs: readonly GithubWorkflowRun[]): GithubWorkflowRun | null {
  const deployish = runs.filter((r) => DEPLOY_NAME.test(r.name ?? ""));
  if (!deployish.length) return null;
  // Prefer a decisive answer: success > failure > still running.
  return (
    deployish.find((r) => r.conclusion === "success") ??
    deployish.find((r) => r.conclusion && r.conclusion !== "skipped") ??
    deployish.find((r) => r.status !== "completed") ??
    deployish[0]
  );
}

export function deriveShippingFromPr(
  pr: GithubPrDetail,
  mergeRuns: readonly GithubWorkflowRun[] | null,
  checkedAt: string,
): FixShipping {
  const base = {
    pr: {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      mergedAt: pr.merged_at,
      mergeSha: pr.merge_commit_sha,
    },
    checkedAt,
  };
  if (!pr.merged_at) {
    return {
      ...base,
      state: pr.state === "open" ? FIX_SHIP_STATE.PR_OPEN : FIX_SHIP_STATE.PR_CLOSED,
    };
  }
  const deploy = mergeRuns ? pickDeployRun(mergeRuns) : null;
  if (!deploy) return { ...base, state: FIX_SHIP_STATE.MERGED };
  const d = {
    url: deploy.html_url,
    name: deploy.name ?? "deploy",
    conclusion: deploy.conclusion,
    status: deploy.status,
  };
  if (deploy.conclusion === "success")
    return { ...base, deploy: d, state: FIX_SHIP_STATE.DEPLOYED };
  if (deploy.status !== "completed" || deploy.conclusion === null)
    return { ...base, deploy: d, state: FIX_SHIP_STATE.DEPLOYING };
  if (deploy.conclusion === "skipped") return { ...base, deploy: d, state: FIX_SHIP_STATE.MERGED };
  return { ...base, deploy: d, state: FIX_SHIP_STATE.DEPLOY_FAILED };
}

/**
 * Where to look at the change: the project's live origin plus the path the
 * visitor reported. The reported host is only a fallback — a visitor on a
 * preview deployment or a fixture URL reports from there, and the product
 * lives at liveUrl. Returns null when neither yields an absolute URL.
 */
export function livePageHref(
  liveUrl: string | null | undefined,
  reportedUrl: string | null | undefined,
  page: string | null | undefined,
): string | null {
  let path = "";
  // The widget sends the page as an absolute URL on some hosts and as a path
  // on others; either field may carry the absolute one.
  const reported =
    [reportedUrl, page].map((v) => (v ?? "").trim()).find((v) => /^https?:\/\//i.test(v)) ?? "";
  if (/^https?:\/\//i.test(reported)) {
    try {
      const u = new URL(reported);
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* fall through */
    }
  } else if ((page ?? "").trim().startsWith("/")) {
    path = (page ?? "").trim();
  }
  const live = (liveUrl ?? "").trim();
  if (/^https?:\/\//i.test(live)) {
    try {
      const origin = new URL(live).origin;
      return `${origin}${path || "/"}`;
    } catch {
      /* fall through */
    }
  }
  if (/^https?:\/\//i.test(reported)) {
    try {
      return new URL(reported).toString();
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** First sentence of the agent's `done` line, for the row — the handoff is
 *  written for another engineer and runs to a paragraph. */
export function firstSentence(text: string | null | undefined, max = 160): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = t.match(/^(.{20,}?[.;])\s/);
  const s = (m ? m[1] : t).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
