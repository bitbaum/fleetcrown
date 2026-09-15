/**
 * Escape the wildcards a LIKE/ILIKE pattern gives meaning to, so user input is
 * matched literally.
 *
 * Without it a search for "100%" matches every row and "a_b" matches "axb" —
 * the person's own text silently becoming a pattern. Both entity search paths
 * (db/queries/people, db/queries/robots) carried their own copy; one definition
 * is one place to be right, and one place to test.
 *
 * It lives in lib/ rather than beside the queries deliberately: it is pure
 * string work with no database in it, so the unit suite can exercise it without
 * a DATABASE_URL.
 */

/**
 * The backslash is in the character class on purpose: it is the escape
 * character itself, so a literal backslash left alone would consume whatever
 * followed it and "\%" would reach the database as a live wildcard.
 */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}
