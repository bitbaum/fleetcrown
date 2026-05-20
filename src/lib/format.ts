/**
 * Single source of truth for value formatting — money, counts, bytes.
 *
 * Date formatting lives in `lib/dates.ts` (deadlineLabel, compactRelativeDate,
 * timeAgo, secondsAgo, toLocalDateStr) — keep them separate so calendar-aware
 * helpers don't pull in Intl currency tables on the cold path.
 *
 * All locale-aware helpers consume APP_LOCALE so a single env var retones the
 * thousands separator, decimal mark, and currency placement across the app.
 */
import { APP_LOCALE } from "@/lib/constants";

const COMPACT_CURRENCY_SUFFIX = new Set(["CHF", "EUR", "USD", "GBP", "JPY"]);

/**
 * "12.34 CHF" / "9.99 USD" — amount + 3-letter currency code, always with two
 * decimals (locale-formatted), always with a trailing currency symbol so eye
 * scanning down a column of mixed currencies stays aligned.
 *
 * Why suffix instead of Intl.NumberFormat({ style: 'currency' }): the built-in
 * currency style places the symbol per the locale's rules (e.g. "CHF 9.99" in
 * de-CH) which destroys right-aligned column readability. We always want the
 * symbol last.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  const code = (currency ?? "").toUpperCase();
  const body = new Intl.NumberFormat(APP_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  if (!code) return body;
  return COMPACT_CURRENCY_SUFFIX.has(code) ? `${body} ${code}` : `${body} ${code}`;
}

/**
 * "1'324" / "1,324" — integer thousands separator per APP_LOCALE. Accepts
 * number, bigint, or numeric string (counts from Drizzle/Postgres come back
 * as strings for bigint columns).
 */
export function formatCount(value: number | bigint | string): string {
  const n =
    typeof value === "number" ? value :
    typeof value === "bigint" ? Number(value) :
    Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat(APP_LOCALE).format(n);
}

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/**
 * "8.9 GiB" / "512 MiB" — binary (1024-based) byte formatting. `inputUnit`
 * selects the unit of the *input* value (default "B"). Pass "MiB" when you
 * already have MiB and want GiB scaling, etc.
 */
export function formatBytes(
  value: number,
  inputUnit: typeof BYTE_UNITS[number] = "B",
): string {
  if (!Number.isFinite(value)) return "—";
  let idx = BYTE_UNITS.indexOf(inputUnit);
  let v = value;
  while (v >= 1024 && idx < BYTE_UNITS.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const decimals = v >= 100 || idx === 0 ? 0 : 1;
  return `${v.toFixed(decimals)} ${BYTE_UNITS[idx]}`;
}
