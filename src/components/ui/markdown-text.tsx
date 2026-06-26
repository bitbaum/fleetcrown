import type { ReactNode } from "react";

// Renderer for plain LLM output: paragraphs, list bullets, headings, **bold**,
// `inline code`, [links](url), and ```fenced code blocks```. Deliberately a
// small hand-rolled subset (no tables/images) — pull in a real markdown lib if a
// surface needs more. Lives in ui/ so every LLM-output panel (digest, project
// bios, Loki responses) renders consistently.
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ?? "space-y-2 text-sm leading-relaxed text-text-secondary"}>
      {blocks.map((block, i) => {
        if (block.kind === "code") {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-xs leading-relaxed text-text-primary"
            >
              <code className="font-mono whitespace-pre">{block.items.join("\n")}</code>
            </pre>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={i} className="space-y-1 pl-4 list-disc marker:text-text-tertiary">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "h") {
          return (
            <h3 key={i} className="text-sm font-semibold text-text-primary mt-2">
              {renderInline(block.items[0])}
            </h3>
          );
        }
        return <p key={i}>{renderInline(block.items[0])}</p>;
      })}
    </div>
  );
}

type Block = { kind: "p" | "ul" | "h" | "code"; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let currentList: string[] | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // ``` fenced code block — collect verbatim until the closing fence.
    if (line.startsWith("```")) {
      currentList = null;
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", items: code });
      continue; // i sits on the closing fence; the for-loop's i++ skips it
    }
    if (!line) {
      currentList = null;
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!currentList) {
        currentList = [];
        blocks.push({ kind: "ul", items: currentList });
      }
      currentList.push(line.slice(2));
    } else if (/^#{1,3} /.test(line)) {
      currentList = null;
      blocks.push({ kind: "h", items: [line.replace(/^#+\s+/, "")] });
    } else {
      currentList = null;
      blocks.push({ kind: "p", items: [line] });
    }
  }
  return blocks;
}

// Inline spans: `code`, **bold**, and [text](url) links. One split keeps the
// order they appear; everything else is plain text.
const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string): ReactNode {
  return text.split(INLINE_RE).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface-raised px-1 py-0.5 font-mono text-text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-text-primary">{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2 hover:text-text-primary">
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
