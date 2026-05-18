import { SignInForm } from "@/components/auth/SignInForm";

// Server component — reads env vars on the server and passes as props.
// This prevents the hydration mismatch that occurred when a "use client"
// component tried to read server-only process.env vars (always undefined
// on the client, causing the GitHub button to flash away on hydration).
export default function SignInPage() {
  const githubEnabled  = Boolean(process.env.GITHUB_CLIENT_ID  && process.env.GITHUB_CLIENT_SECRET);
  const googleEnabled  = Boolean(process.env.GOOGLE_CLIENT_ID  && process.env.GOOGLE_CLIENT_SECRET);
  const twitterEnabled = Boolean(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);
  const localAuthEnabled = Boolean(process.env.LOCAL_AUTH_PASSWORD);
  return <SignInForm githubEnabled={githubEnabled} googleEnabled={googleEnabled} twitterEnabled={twitterEnabled} localAuthEnabled={localAuthEnabled} />;
}
