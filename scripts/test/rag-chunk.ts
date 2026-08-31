/**
 * Unit test for chunkMarkdown — the retrieval-precision splitter. Pure, no DB,
 * so it runs in the env-independent suite.
 */
import assert from "node:assert/strict";
import { chunkMarkdown } from "../../src/lib/rag/chunk";

// Splits on h2/h3 headings into separate passages.
{
  const md = "## First\nalpha content\n\n## Second\nbeta content\n\n### Third\ngamma content";
  const chunks = chunkMarkdown(md);
  assert.equal(chunks.length, 3, "one chunk per heading section");
  assert.match(chunks[0], /## First[\s\S]*alpha/, "section keeps its heading + body");
  assert.match(chunks[1], /## Second[\s\S]*beta/);
  assert.match(chunks[2], /### Third[\s\S]*gamma/);
}

// Intro text before the first heading stays its own chunk.
{
  const md = "intro paragraph before any heading\n\n## Body\nthe body";
  const chunks = chunkMarkdown(md);
  assert.equal(chunks.length, 2, "intro + one section");
  assert.match(chunks[0], /intro paragraph/);
}

// Oversized sections split on paragraph boundaries, under the cap.
{
  const para = "x".repeat(300);
  const md = `## Big\n${para}\n\n${para}\n\n${para}\n\n${para}`; // ~1200 chars of body
  const chunks = chunkMarkdown(md, { maxChars: 500 });
  assert.ok(chunks.length >= 2, "oversized section is split");
  for (const c of chunks)
    assert.ok(c.length <= 500 + 60, `each chunk near the cap (got ${c.length})`);
}

// Prefix is prepended to every chunk (so it stands alone in retrieval).
{
  const chunks = chunkMarkdown("## A\nbody a\n\n## B\nbody b", { prefix: "Essay: Test" });
  assert.ok(
    chunks.every((c) => c.startsWith("Essay: Test\n")),
    "prefix on every chunk",
  );
}

// Empty / whitespace input yields no chunks.
assert.deepEqual(chunkMarkdown(""), [], "empty → no chunks");
assert.deepEqual(chunkMarkdown("   \n\n  "), [], "whitespace → no chunks");

console.log("✓ rag-chunk (chunkMarkdown) tests passed");
