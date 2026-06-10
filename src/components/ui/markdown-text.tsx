import type { ReactNode } from "react";

// Tiny renderer for plain LLM output: paragraphs, list bullets, headings,
// and **bold** spans. Anything fancier (code blocks, links, tables) is out
// of scope — pull in a real markdown lib when a surface needs them. Lives
// in ui/ so every LLM-output panel (digest, project bios, Ivy responses)
// renders consistently.
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ?? "space-y-2 text-sm leading-relaxed text-text-secondary"}>
      {blocks.map((block, i) => {
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

type Block = { kind: "p" | "ul" | "h"; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let currentList: string[] | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
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

function renderInline(text: string): ReactNode {
  // Alternate between plain text and **bold** spans.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-text-primary">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
