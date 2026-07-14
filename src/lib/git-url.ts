/**
 * Pure git-URL helpers — SSOT for "can a runner materialize this workspace by
 * cloning?". Used by dispatch routing (execution-access) and the box-runner's
 * workspace prep (box-workspace), so the two can never disagree about what is
 * cloneable. No imports: safe in any bundle.
 */

/** Normalize git URLs to https://github.com/owner/repo for unattended clone. */
export function normalizeGitHubCloneUrl(gitUrl: string): string | null {
  const trimmed = gitUrl.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}.git`;
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(trimmed)) return trimmed;
  return null;
}

/** True when a runner WITHOUT the project's directory could still obtain the
 *  workspace (unattended GitHub clone). */
export function isCloneableGitUrl(gitUrl: string | null | undefined): boolean {
  return !!gitUrl && normalizeGitHubCloneUrl(gitUrl) !== null;
}
