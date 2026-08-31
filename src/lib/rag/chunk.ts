/**
 * Split markdown into retrieval-sized chunks so the vector index stores
 * *passages*, not truncated whole documents. A query then retrieves the one
 * relevant section instead of a 6000-char blob sliced mid-thought — sharper
 * context means a modest model does more with it. Pure + deterministic.
 *
 * Strategy: break on `##`/`###` headings first (semantic boundaries), then split
 * any oversized section on blank lines (paragraph boundaries). Each returned
 * chunk can carry a prefix (e.g. the doc title) so it stands alone in retrieval.
 */
export function chunkMarkdown(
  text: string,
  opts?: { maxChars?: number; prefix?: string },
): string[] {
  const maxChars = opts?.maxChars ?? 1400;
  const prefix = opts?.prefix?.trim() ?? "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // 1. Group into sections at h2/h3 headings.
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) && current.some((l) => l.trim())) {
      sections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((l) => l.trim())) sections.push(current.join("\n").trim());

  // 2. Split any oversized section on paragraph boundaries.
  const chunks: string[] = [];
  for (const sec of sections.filter(Boolean)) {
    if (sec.length <= maxChars) {
      chunks.push(sec);
      continue;
    }
    let buf = "";
    for (const para of sec.split(/\n{2,}/)) {
      if (buf && buf.length + para.length + 2 > maxChars) {
        chunks.push(buf.trim());
        buf = para;
      } else {
        buf = buf ? `${buf}\n\n${para}` : para;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
  }

  return chunks
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (prefix ? `${prefix}\n${c}` : c));
}
