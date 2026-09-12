/**
 * Rank the operator's projects so the one their message NAMES comes first.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Every other retrieval source already reads the message — `peopleFacts` and
 * `documentFacts` both search with it. Projects did not: they came back in
 * table order and were then head-sliced to a limit. With thirty-odd registered
 * projects that is a lottery, and it lost in production.
 *
 * Asked "what do you think about heidi", the people search matched two contacts
 * who happen to be named Heidi, the project slice never reached the registered
 * `Heidi` project, and the answer was therefore about two strangers in the
 * address book. Retrieval chose the subject of the answer, and chose wrong. No
 * prompt rule can recover a record that was never fetched.
 *
 * ── Why it lives in its own module ───────────────────────────────────────────
 * `sources.ts` imports `@/db`, which THROWS at module load when no connection
 * string is set. Pure ranking logic kept in there could only be tested with a
 * database, and this repo's unit suite is env-independent by construction. The
 * rule is worth a test; the test is worth a file.
 */

/** Normalise to lowercase words so slugs, spaces and punctuation all compare alike. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Shortest name we will match on.
 *
 * Two-character names ("ai", "oc") appear inside ordinary words often enough
 * that matching them would reorder projects on the strength of the word "said".
 * A name that short simply cannot be recognised from prose reliably.
 */
const MIN_NAME_CHARS = 3;

/**
 * Projects whose name the message mentions, in their original relative order,
 * followed by everything else. Never adds, drops, or duplicates a project —
 * callers still slice, and this only decides who survives the slice.
 *
 * Matching is whole-word against the normalised message, and also against each
 * PART of a multi-word name, because operators type slugs loosely: `aoz-housing`
 * is asked about as "aoz housing" and as "aoz".
 */
export function rankProjectsByMessage<T extends { name: string }>(
  projects: T[],
  message: string,
): T[] {
  const haystack = ` ${normalise(message)} `;

  const isNamed = (name: string): boolean => {
    const n = normalise(name);
    if (n.length < MIN_NAME_CHARS) return false;
    if (haystack.includes(` ${n} `)) return true;
    return n
      .split(" ")
      .some((part) => part.length >= MIN_NAME_CHARS && haystack.includes(` ${part} `));
  };

  const hits: T[] = [];
  const rest: T[] = [];
  for (const project of projects) (isNamed(project.name) ? hits : rest).push(project);
  return hits.length === 0 ? projects : [...hits, ...rest];
}
