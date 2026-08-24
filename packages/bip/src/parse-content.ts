import type { ContentBlock } from "./types";

/**
 * Parse repo-authored markdown into typed blocks.
 * Trust boundary: committed content only — not user input.
 */
export function parseContentBlocks(body: string): ContentBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ContentBlock[] = [];
  let i = 0;

  const isBlank = (line: string) => line.trim().length === 0;
  const isTableRow = (line: string) => /^\|.+\|/.test(line.trim());
  const isTableSep = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
  const splitCells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const isEmbedUrl = (line: string) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|vimeo\.com\/)\S+$/i.test(
      line.trim(),
    );

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "").trim() });
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.replace(/^###\s+/, "").trim() });
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (isEmbedUrl(line)) {
      blocks.push({ type: "embed", url: line.trim() });
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].replace(/^-\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].replace(/^>\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "blockquote", text: quote });
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      blocks.push({ type: "image", alt: imgMatch[1], src: imgMatch[2] });
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !lines[i].startsWith("## ") &&
      !lines[i].startsWith("### ") &&
      !lines[i].startsWith("- ") &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      !lines[i].startsWith("```") &&
      !lines[i].match(/^!\[/) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1])) &&
      !isEmbedUrl(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}

/** Simple YAML-ish frontmatter (`key: value`); strips matching quotes. */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: raw };
  const header = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    let value = line.slice(idx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    meta[line.slice(0, idx).trim()] = value;
  }
  return { meta, body };
}
