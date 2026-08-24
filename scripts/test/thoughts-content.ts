/**
 * Unit tests for @fleetcrown/bip (and Thoughts re-exports).
 * Run via: npm run test:unit (auto-discovered)
 */
import { parseContentBlocks, parseVideoEmbed } from "@fleetcrown/bip";
import { parseThoughtBlocks } from "@/lib/thoughts-content";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("parses GFM table", () => {
    const blocks = parseContentBlocks(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | **bold** |\n",
    );
    assert(blocks.length === 1, `expected 1 block, got ${blocks.length}`);
    assert(blocks[0].type === "table", "expected table");
    if (blocks[0].type === "table") {
      assert(blocks[0].headers.join(",") === "A,B", "headers");
      assert(blocks[0].rows.length === 2, "rows");
      assert(blocks[0].rows[1][1] === "**bold**", "cell markdown preserved");
    }
  });

  check("parses lone YouTube URL as embed", () => {
    const blocks = parseContentBlocks("https://www.youtube.com/watch?v=dQw4w9WgXcQ\n");
    assert(blocks[0]?.type === "embed", "expected embed");
  });

  check("parses mermaid fence as code", () => {
    const blocks = parseContentBlocks("```mermaid\nflowchart LR\n  A-->B\n```\n");
    assert(blocks[0]?.type === "code", "expected code");
    if (blocks[0]?.type === "code") {
      assert(blocks[0].lang === "mermaid", "lang mermaid");
    }
  });

  check("parseThoughtBlocks delegates to bip", () => {
    const a = parseContentBlocks("## Hello\n");
    const b = parseThoughtBlocks("## Hello\n");
    assert(JSON.stringify(a) === JSON.stringify(b), "alias match");
  });

  check("parseVideoEmbed allowlists youtube and vimeo", () => {
    assert(parseVideoEmbed("https://youtu.be/abcdefghijk")?.provider === "youtube", "yt");
    assert(parseVideoEmbed("https://vimeo.com/123456789")?.provider === "vimeo", "vimeo");
    assert(parseVideoEmbed("https://evil.example/x") === null, "reject other");
  });

  console.log(`\nbip / thoughts-content: ${passed} passed`);
}

runTests();
