/**
 * Server half of the fix ledger (see fix-shipping.ts): find the PR the run
 * produced, ask GitHub where it is, cache the answer on the run.
 *
 * Economics: one PR lookup plus, once merged, one workflow-runs lookup, per
 * run, at most every REFRESH_MS while the state can still change, never
 * again once it is terminal. The inbox calls this for the handful of rows
 * sitting in "needs verify"; a fleet with fifty such rows costs fifty small
 * GitHub calls a minute at worst.
 */
import { GITHUB_API_BASE } from "@/lib/github-api";
import { getRepoWriteToken } from "@/lib/github-org-token";
import { stampRunFix } from "@/db/queries/orchestration-runs";
import {
  deriveShippingFromPr,
  FIX_SHIP_STATE,
  fixNeedsRefresh,
  parsePrRef,
  type FixShipping,
  type GithubPrDetail,
  type GithubWorkflowRun,
  type PrRef,
} from "@/lib/feedback/fix-shipping";

/** Rows the inbox is willing to refresh per request — bounded on purpose. */
export const FIX_REFRESH_MAX_PER_REQUEST = 8;
export { fixNeedsRefresh };

export type FixRefreshInput = {
  runId: string;
  userId: string;
  /** The run's cached ledger, if any. */
  cached: FixShipping | null | undefined;
  /** The agent's handoff `done` line — where it names its PR. */
  summaryDone: string | null | undefined;
  /** The reaper's repo evidence, if it found one (payload.evidence). */
  evidence: { kind: string; url: string; title: string } | null | undefined;
  gitUrl: string | null | undefined;
};

function ghInit(token: string): RequestInit {
  return {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  };
}

async function fetchPr(ref: PrRef, token: string): Promise<GithubPrDetail | null> {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    ghInit(token),
  );
  if (!res.ok) return null;
  const j = (await res.json()) as Partial<GithubPrDetail>;
  if (typeof j.number !== "number" || typeof j.html_url !== "string") return null;
  return {
    number: j.number,
    html_url: j.html_url,
    title: typeof j.title === "string" ? j.title : `PR #${j.number}`,
    state: j.state === "closed" ? "closed" : "open",
    merged_at: typeof j.merged_at === "string" ? j.merged_at : null,
    merge_commit_sha: typeof j.merge_commit_sha === "string" ? j.merge_commit_sha : null,
  };
}

async function fetchRunsForSha(
  ref: PrRef,
  sha: string,
  token: string,
): Promise<GithubWorkflowRun[] | null> {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${ref.owner}/${ref.repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`,
    ghInit(token),
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { workflow_runs?: Array<Partial<GithubWorkflowRun>> };
  return (j.workflow_runs ?? []).map((r) => ({
    name: typeof r.name === "string" ? r.name : null,
    status: typeof r.status === "string" ? r.status : null,
    conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
    html_url: typeof r.html_url === "string" ? r.html_url : null,
  }));
}

/** Where the PR is named, in order of trust: the reaper's evidence URL, then the handoff. */
function findPrRef(input: FixRefreshInput): PrRef | null {
  if (input.evidence?.kind === "pr") {
    const fromEvidence = parsePrRef(input.evidence.url, input.gitUrl);
    if (fromEvidence) return fromEvidence;
  }
  return parsePrRef(input.summaryDone, input.gitUrl);
}

/**
 * Compute the ledger for one run and cache it. Never throws: GitHub down or
 * no token yields an `unverified` entry that still carries the PR link the
 * handoff named, so the row can at least point at it.
 */
export async function refreshFixShipping(input: FixRefreshInput): Promise<FixShipping> {
  const checkedAt = new Date().toISOString();
  const ref = findPrRef(input);
  let fix: FixShipping;
  if (!ref) {
    fix =
      input.evidence?.kind === "push"
        ? {
            state: FIX_SHIP_STATE.PUSHED,
            push: { url: input.evidence.url, title: input.evidence.title },
            checkedAt,
          }
        : { state: FIX_SHIP_STATE.NO_EVIDENCE, checkedAt };
  } else {
    const claimed: FixShipping = {
      state: FIX_SHIP_STATE.PR_OPEN,
      pr: { number: ref.number, url: ref.url, title: `PR #${ref.number}` },
      checkedAt,
      unverified: true,
    };
    try {
      // The person's OAuth token is NOT enough: `bitbaum` has OAuth-app access
      // restrictions, so GitHub answers 403 for every org repo even with the
      // right scope — the ledger read "PR #2 · open?" while that PR had merged
      // and deployed. getRepoWriteToken prefers the server's org token and
      // falls back to the person's, which is the same order repo creation uses.
      const picked = await getRepoWriteToken(input.userId);
      if (!picked) fix = claimed;
      else {
        const pr = await fetchPr(ref, picked.token);
        if (!pr) fix = claimed;
        else {
          const runs =
            pr.merged_at && pr.merge_commit_sha
              ? await fetchRunsForSha(ref, pr.merge_commit_sha, picked.token)
              : null;
          fix = deriveShippingFromPr(pr, runs, checkedAt);
        }
      }
    } catch {
      fix = claimed;
    }
  }
  await stampRunFix(input.runId, input.userId, fix).catch(() => {});
  return fix;
}
