/**
 * Inline tests for the two text helpers that were each defined twice.
 *
 * `escapeLike` is a security helper: without it, a person's own search text
 * becomes a LIKE pattern. It is four characters of code and exactly the kind of
 * thing that gets "simplified" by someone who has not thought about `\`.
 *
 * `decodeEntities` had two copies that disagreed about ORDER, and the
 * disagreement was a real defect — see the `&amp;lt;` case below.
 *
 * Run: npx tsx scripts/test/text-helpers.ts
 */
import { escapeLike } from "@/lib/sql-escape";
import { decodeEntities, escapeHtml } from "@/lib/escape-html";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

// ------------------------------------------------------------- escapeLike

check("a percent in the search text matches a percent, not everything", () => {
  assert(escapeLike("100%") === "100\\%", `got ${escapeLike("100%")}`);
});

check("an underscore matches an underscore, not any character", () => {
  assert(escapeLike("a_b") === "a\\_b", `got ${escapeLike("a_b")}`);
});

check("the escape character itself is escaped", () => {
  // If `\` were left alone it would consume whatever followed it, so "\%"
  // would still reach the database as a live wildcard.
  assert(escapeLike("\\") === "\\\\", `got ${JSON.stringify(escapeLike("\\"))}`);
  assert(escapeLike("\\%") === "\\\\\\%", `got ${JSON.stringify(escapeLike("\\%"))}`);
});

check("ordinary text is untouched", () => {
  assert(escapeLike("Elena Ruiz") === "Elena Ruiz", "escaped a name that needed nothing");
  assert(escapeLike("") === "", "empty input changed");
});

// --------------------------------------------------------- decodeEntities

check("the common entities decode", () => {
  assert(decodeEntities("A &amp; B") === "A & B", "ampersand");
  assert(decodeEntities("&lt;tag&gt;") === "<tag>", "angle brackets");
  assert(decodeEntities("&quot;q&quot;") === '"q"', "double quote");
  assert(decodeEntities("it&#39;s") === "it's", "&#39;");
  assert(decodeEntities("it&#x27;s") === "it's", "&#x27;");
  assert(decodeEntities("it&apos;s") === "it's", "&apos;");
  assert(decodeEntities("a&nbsp;b") === "a b", "non-breaking space");
});

check("&amp; decodes LAST, so an escaped entity is not double-decoded", () => {
  // The whole reason one of the two copies was wrong. A site that deliberately
  // shows the text "&lt;" writes "&amp;lt;". Decoding &amp; first turns that
  // into "&lt;" and then into "<" — text the author escaped becoming markup.
  assert(decodeEntities("&amp;lt;") === "&lt;", `double-decoded: ${decodeEntities("&amp;lt;")}`);
  assert(decodeEntities("&amp;amp;") === "&amp;", "double-decoded a nested ampersand");
});

check("a CDATA wrapper from an RSS feed is unwrapped", () => {
  assert(decodeEntities("<![CDATA[Hi &amp; bye]]>") === "Hi & bye", "CDATA not unwrapped");
});

check("escapeHtml then decodeEntities round-trips", () => {
  for (const original of ["A & B", "<script>", `say "hi"`, "it's", "plain text"]) {
    const round = decodeEntities(escapeHtml(original));
    assert(round === original, `round trip lost ${JSON.stringify(original)} → ${round}`);
  }
});

console.log(`\n✓ text-helpers tests passed (${passed} assertions)`);
