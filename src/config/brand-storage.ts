/**
 * Client + cookie persistence identifiers derived from APP_SLUG.
 *
 * Display name lives in brand.ts; env vars use brand-env.ts (APP_* → FLEETCROWN_* → COCKPIT_*).
 * This file is the SSOT for browser cookies, localStorage keys, and push tags so a
 * slug rename does not leave "cockpit" scattered in components.
 *
 * LEGACY_* constants are read-only migration paths — never write new data under them.
 */
import { APP_SLUG } from "@/config/brand";

/** HTTP-only cookie set after PIN unlock on /unlock and Settings → Privacy. */
export const PRIVATE_ZONE_COOKIE = `${APP_SLUG}-pz`;
/** @deprecated Pre-rename cookie — read during unlock check only. */
export const LEGACY_PRIVATE_ZONE_COOKIE = "cockpit-pz";

/** Per-project Control composer drafts in localStorage. */
export const DRAFT_STORAGE_PREFIX = `${APP_SLUG}:draft:`;
export const LEGACY_DRAFT_STORAGE_PREFIX = "cockpit:draft:";

/** Sidebar section expand/collapse preference. */
export const SIDEBAR_SECTIONS_STORAGE_KEY = `${APP_SLUG}-sidebar-sections-v1`;
export const LEGACY_SIDEBAR_SECTIONS_STORAGE_KEY = "cockpit-sidebar-sections-v1";

/** Cmd+K palette recent entries. */
export const PALETTE_RECENT_STORAGE_KEY = `${APP_SLUG}.palette.recent`;
export const LEGACY_PALETTE_RECENT_STORAGE_KEY = "cockpit.palette.recent";

/** Web push notification tag prefix. */
export const PUSH_TAG_PREFIX = `${APP_SLUG}:`;
