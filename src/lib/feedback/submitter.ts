/**
 * Who filed a piece of feedback, and the link that lets them follow it.
 *
 * One module owns three decisions that were previously nowhere or scattered:
 *   • what counts as the reporter's email (the widget's `contact` box is free
 *     text — people type "Anushka", "anushka@x.com", "Anushka <anushka@x.com>")
 *   • what a track token looks like
 *   • what URL that token becomes
 *
 * Kept free of `db` and `next/server` imports so the ingest route, the mailer,
 * and the unit suite can all read it without dragging a database in.
 */
import { randomBytes } from "node:crypto";

/** Deliberately the same shape close-loop.ts has always used to decide whether
 *  a contact string is mailable. One rule, so a row we would email is exactly
 *  a row we attribute. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Longest address we will store. RFC allows 254; the column is free-form text
 *  and the widget caps `contact` at 200, so this only guards direct API posts. */
const MAX_EMAIL_LEN = 254;

/**
 * Pull a usable address out of whatever the reporter typed, or null.
 *
 * Accepts a bare address and the `Name <addr>` form people paste out of mail
 * clients. Everything else (a name, a phone number, a Twitter handle) returns
 * null and stays in `contact` untouched — we never guess an identity, because
 * a wrong guess here attaches someone's report to someone else's account.
 */
export function normalizeSubmitterEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  // `Name <addr@host>` → `addr@host`. Only the LAST angle group, so a display
  // name that itself contains brackets cannot smuggle a different address in.
  const angled = value.match(/<([^<>]+)>\s*$/);
  const candidate = (angled ? angled[1] : value).trim().toLowerCase();
  if (candidate.length > MAX_EMAIL_LEN) return null;
  return EMAIL_RE.test(candidate) ? candidate : null;
}

/**
 * A fresh track token: 24 random bytes, base64url.
 *
 * Sized as a capability, not an id. Anyone holding it sees the report's text,
 * the page it was filed against and the contact line on it, so it has to be
 * unguessable at the same order as a password-reset link — 192 bits is well
 * past any online enumeration, and the string stays short enough to paste.
 */
export function mintTrackToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Shape check before a DB lookup — keeps junk paths off the query. */
export function isTrackTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

/** The public follow page for one report. Short on purpose: it is pasted into
 *  emails and shown on a customer's own site inside a small widget panel. */
export function trackPath(token: string): string {
  return `/f/${token}`;
}

/** Absolute follow URL. `origin` comes from the caller (the ingest route reads
 *  its own request) so one Loki deployment never hands out another's links. */
export function trackUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${trackPath(token)}`;
}
