import { SignInForm } from "@/components/auth/SignInForm";

// Server component — reads env vars on the server and passes as props.
// This prevents the hydration mismatch that occurred when a "use client"
// component tried to read server-only process.env vars (always undefined
// on the client, causing the GitHub button to flash away on hydration).
export default function SignInPage() {
  const githubEnabled  = Boolean(process.env.GITHUB_CLIENT_ID  && process.env.GITHUB_CLIENT_SECRET);
  const googleEnabled  = Boolean(process.env.GOOGLE_CLIENT_ID  && process.env.GOOGLE_CLIENT_SECRET);
  // X login uses the OAuth 1.0a flow (src/app/api/x-login/*) gated on the X1
  // consumer keys — X's OAuth 2.0 authorize endpoint 503s on this Pay-Per-Use
  // account, so the 2.0 client id/secret are no longer the gate.
  const twitterEnabled = Boolean(process.env.X1_CONSUMER_KEY && process.env.X1_CONSUMER_SECRET);
  // Two gates, both required: a configured password AND an explicit opt-in
  // flag. The hosted prod keeps LOCAL_AUTH_PASSWORD set for legacy reasons, but
  // ENABLE_OWNER_KEY is unset there, so the tab stays hidden. Local installs
  // (cockpit-app systemd, dev) set both. See auth.ts for the matching runtime
  // refusal — the UI gate alone wouldn't stop a direct POST.
  const localAuthEnabled = Boolean(process.env.LOCAL_AUTH_PASSWORD) && process.env.ENABLE_OWNER_KEY === "1";
  return <SignInForm githubEnabled={githubEnabled} googleEnabled={googleEnabled} twitterEnabled={twitterEnabled} localAuthEnabled={localAuthEnabled} />;
}
