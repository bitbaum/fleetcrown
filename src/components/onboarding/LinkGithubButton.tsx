"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GitBranch, Loader2 } from "lucide-react";

/**
 * Link a GitHub account to the currently-signed-in user.
 *
 * Why this exists: a user who signed up with email+password (the path many
 * people take by reflex, because the password tab is the default in the
 * SignInForm) has no GitHub access_token in the accounts table — and
 * therefore no way to use the /control/import bulk-repo flow.
 *
 * Auth.js v5 supports account linking: calling `signIn("github")` while
 * already authenticated will (if the OAuth email matches the existing
 * account) append a GitHub row to the accounts table for the current
 * user_id, rather than creating a new user. Net effect: same user_id,
 * now with a stored GitHub access_token.
 *
 * The `callbackUrl` brings the user back to where they came from after
 * the OAuth roundtrip, with hasGithub=true on the next /api/github/repos
 * call.
 */
export function LinkGithubButton({
  callbackUrl = "/control/import",
  size = "default",
  className = "",
}: {
  callbackUrl?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await signIn("github", { callbackUrl });
    // If signIn doesn't redirect (rare — usually it does), reset the spinner.
    setLoading(false);
  }

  const sizeClass = size === "sm" ? "ui-btn-xs" : "";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50 ${sizeClass} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
      Connect GitHub
    </button>
  );
}
