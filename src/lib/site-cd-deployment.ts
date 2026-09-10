/** Pure deployment evidence selection: only the current main SHA can prove live. */
export type SiteDeploymentRun = {
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
};

export type SiteDeploymentStatus = "pending" | "failed" | "live";

export function currentSiteDeployment(runs: SiteDeploymentRun[], sha: string) {
  return runs.find((run) => run.head_sha === sha);
}

export function siteDeploymentIsLive(
  run: SiteDeploymentRun | undefined,
  publicStatus: number,
): boolean {
  return run?.status === "completed" && run.conclusion === "success" && publicStatus === 200;
}

/**
 * What the workflow runs say BEFORE the public probe. Kept pure because the
 * first GET after a dispatch lands before GitHub materialises the run: with a
 * head_sha-filtered list that read as "no deployment exists" and polling
 * stopped on a false failure. A run that is still queued for any commit, or
 * simply not there yet after a dispatch, is "starting" — not absent.
 */
export function describeSiteDeployment(
  runs: SiteDeploymentRun[],
  sha: string,
  opts: { dispatch: boolean; workflowMissing: boolean },
): {
  run: SiteDeploymentRun | undefined;
  inFlight: boolean;
  status: SiteDeploymentStatus;
  reason: string;
} {
  const run = currentSiteDeployment(runs, sha);
  const inFlight = !run && runs.some((r) => r.status !== "completed");
  if (run?.status === "completed" && run.conclusion === "success") {
    return {
      run,
      inFlight,
      status: "pending",
      reason: "Deployment completed; checking the public site.",
    };
  }
  if (run?.status === "completed") {
    return {
      run,
      inFlight,
      status: "failed",
      reason: "Deployment failed. Check the deployment log, fix the cause, and retry registration.",
    };
  }
  if (run || inFlight) {
    return {
      run,
      inFlight,
      status: "pending",
      reason: run
        ? "Deployment is running. The live link appears after deployment and a public check pass."
        : "A deployment is starting for the latest commit.",
    };
  }
  if (opts.dispatch) {
    return { run, inFlight, status: "pending", reason: "Starting deployment." };
  }
  return {
    run,
    inFlight,
    status: "failed",
    reason: opts.workflowMissing
      ? "The deploy workflow is missing from the repository. Register the site to add it and start deployment."
      : "No deployment exists for the current main commit. Register the site to start deployment.",
  };
}
