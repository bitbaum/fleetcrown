// Single source of truth for the product brand on the TypeScript side.
// scripts/_brand.sh mirrors APP_NAME / APP_SLUG / APP_DOMAIN for shell.
// To rebrand the entire product, edit this file + scripts/_brand.sh + the
// vercel.json alias + DNS at the registrar — that's it.
//
// Conventions:
//   APP_NAME     Display string. Appears in <title>, sidebar, marketing.
//   APP_SLUG     Lowercase kebab. Used in URLs, file paths, env-var prefixes.
//   APP_DOMAIN   Canonical hostname (no scheme). Used in callbacks, emails, copy.

export const APP_NAME        = "Cockpit";
export const APP_SLUG        = "cockpit";
export const APP_DOMAIN      = "cockpitapp.vercel.app";
export const APP_KICKER      = "Personal Systems";
export const APP_DESCRIPTION = "Command your agents, projects, and personal systems from one workspace.";

// Helpers — never hardcode these patterns in components.
export const APP_URL         = `https://${APP_DOMAIN}`;
export const APP_PROFILE_URL = (username: string) => `${APP_DOMAIN}/u/${username}`;

// Email "From" address. Kept separate from APP_DOMAIN because the email host
// is usually a different domain than the app host (vercel.app is hostable but
// not a deliverable email domain). Override via EMAIL_FROM env var.
export const APP_EMAIL_FROM = `${APP_NAME} <noreply@${APP_SLUG}.app>`;
export const APP_TAGLINE    = "your life operating system";
