import { homedir } from "os";
import path from "path";

export const HOME = homedir();
const OPENCLAW_DIR = `${HOME}/.openclaw`;
const WORKSPACE_DIR = `${OPENCLAW_DIR}/workspace`;
export const TOOLS_DIR = `${WORKSPACE_DIR}/tools`;
export const CRON_FILE = path.join(HOME, ".openclaw", "cron", "jobs.json");

export const DEFAULT_USER_NAME = process.env.COCKPIT_DEFAULT_USER_NAME ?? "George";
/** External ID of the owner entity — used to exclude the user from people queries */
export const DEFAULT_USER_EXTERNAL_ID = process.env.COCKPIT_DEFAULT_USER_EXTERNAL_ID ?? "george";
export const TELEGRAM_CHAT_ID = process.env.COCKPIT_TELEGRAM_CHAT_ID ?? "";
export const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";

/** Source attribution for rows created via the Cockpit UI. Distinguishes
 *  manual-from-app rows from the seeded knowledge.sqlite + contact-resolver
 *  imports so future audit/cleanup queries can filter by origin. */
export const SOURCE_COCKPIT_UI = "cockpit-ui";

/** How many days of history the /habits page (and its heatmap) covers. */
export const HABIT_HISTORY_DAYS = 30;

/** Default timezone for schedule-related operations (cron jobs, calendar). */
export const DEFAULT_TIMEZONE = process.env.COCKPIT_DEFAULT_TIMEZONE ?? "Europe/Zurich";

/** Locale used for date/time formatting throughout the app. */
export const APP_LOCALE = process.env.COCKPIT_LOCALE ?? "de-CH";

/** Lookahead windows for the /today summary cards. */
export const GOALS_DUE_SOON_DAYS = 14;
export const EVENTS_DUE_SOON_DAYS = 30;
export const SUBSCRIPTIONS_UPCOMING_DAYS = 14;

/** How many days before an invitation link expires. */
export const INVITATION_EXPIRY_DAYS = 7;
