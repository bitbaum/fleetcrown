/**
 * Parse a user-supplied address book into contact rows.
 *
 * Sources we accept (the user handed us the file):
 *   - vCard (.vcf)
 *   - CSV with a name column
 *   - contact-resolver.json (the OpenClaw book already used at seed)
 *
 * We do not fetch anyone's social graph. Matching an existing person
 * becomes an enrich proposal; a new name becomes an import proposal.
 */

import {
  BOOK_ATTR,
  IMPORT_SOURCE,
  isBookAttrKey,
  type ImportSource,
} from "@/config/book";
import { extractEmails, extractPhones, normalizeName } from "@/lib/people-dedupe";

export type ImportedContact = {
  name: string;
  description?: string;
  attrs: Record<string, string>;
  externalId?: string;
  source: ImportSource;
};

export function detectImportSource(filename: string, text: string): ImportSource {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vcf") || lower.endsWith(".vcard") || text.includes("BEGIN:VCARD")) {
    return IMPORT_SOURCE.VCARD;
  }
  if (lower.includes("contact-resolver") || text.includes('"contacts"')) {
    try {
      const parsed = JSON.parse(text) as { contacts?: unknown };
      if (Array.isArray(parsed.contacts)) return IMPORT_SOURCE.CONTACT_RESOLVER;
    } catch { /* not json */ }
  }
  return IMPORT_SOURCE.CSV;
}

export function parseImport(text: string, source: ImportSource): ImportedContact[] {
  if (source === IMPORT_SOURCE.VCARD) return parseVCard(text);
  if (source === IMPORT_SOURCE.CONTACT_RESOLVER) return parseContactResolver(text);
  return parseCsv(text);
}

export function parseVCard(text: string): ImportedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const out: ImportedContact[] = [];
  for (const raw of cards) {
    const block = raw.split(/END:VCARD/i)[0] ?? "";
    const unfolded = block.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const fn = vcardField(unfolded, "FN") ?? vcardField(unfolded, "N")?.split(";").filter(Boolean).join(" ");
    const name = (fn ?? "").trim();
    if (!name) continue;
    const attrs: Record<string, string> = {};
    const emails = [...unfolded.matchAll(/EMAIL[^:]*:([^\r\n]+)/gi)].map((m) => m[1].trim());
    const tels = [...unfolded.matchAll(/TEL[^:]*:([^\r\n]+)/gi)].map((m) => m[1].trim());
    if (emails[0]) attrs[BOOK_ATTR.EMAIL] = emails[0];
    if (tels[0]) attrs[BOOK_ATTR.PHONE] = tels[0];
    const org = vcardField(unfolded, "ORG");
    if (org) attrs[BOOK_ATTR.COMPANY] = org.split(";")[0]!.trim();
    const title = vcardField(unfolded, "TITLE");
    if (title) attrs[BOOK_ATTR.PROFESSION] = title;
    const note = vcardField(unfolded, "NOTE");
    out.push({
      name,
      description: note || undefined,
      attrs,
      source: IMPORT_SOURCE.VCARD,
    });
  }
  return dedupeImported(out);
}

export function parseCsv(text: string): ImportedContact[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().trim());
  const hasHeader = header.some((h) => /name|email|phone|fn|display/.test(h));
  const rows = hasHeader ? lines.slice(1) : lines;
  const nameIdx = hasHeader ? header.findIndex((h) => /^(name|display name|fn|full name)$/.test(h)) : 0;
  const emailIdx = hasHeader ? header.findIndex((h) => /email/.test(h)) : -1;
  const phoneIdx = hasHeader ? header.findIndex((h) => /phone|tel|mobile/.test(h)) : -1;
  const noteIdx = hasHeader ? header.findIndex((h) => /note|notes|comment/.test(h)) : -1;
  const orgIdx = hasHeader ? header.findIndex((h) => /org|company|organisation|organization/.test(h)) : -1;

  const out: ImportedContact[] = [];
  for (const line of rows) {
    const cols = splitCsvLine(line);
    const name = (cols[nameIdx >= 0 ? nameIdx : 0] ?? "").trim();
    if (!name || normalizeName(name) === "name") continue;
    const attrs: Record<string, string> = {};
    const email = emailIdx >= 0 ? cols[emailIdx] : extractEmails(line)[0];
    const phone = phoneIdx >= 0 ? cols[phoneIdx] : extractPhones(line)[0];
    if (email) attrs[BOOK_ATTR.EMAIL] = email.trim();
    if (phone) attrs[BOOK_ATTR.PHONE] = phone.trim();
    if (orgIdx >= 0 && cols[orgIdx]) attrs[BOOK_ATTR.COMPANY] = cols[orgIdx]!.trim();
    const note = noteIdx >= 0 ? cols[noteIdx]?.trim() : undefined;
    out.push({ name, description: note || undefined, attrs, source: IMPORT_SOURCE.CSV });
  }
  return dedupeImported(out);
}

export function parseContactResolver(text: string): ImportedContact[] {
  let parsed: {
    contacts?: Array<{
      id?: string;
      displayName?: string;
      aliases?: string[];
      channels?: Record<string, Record<string, string> | string>;
    }>;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.contacts)) return [];

  const out: ImportedContact[] = [];
  for (const c of parsed.contacts) {
    const name = (c.displayName ?? "").trim();
    if (!name) continue;
    const attrs: Record<string, string> = {};
    if (c.aliases && c.aliases.length > 0) attrs[BOOK_ATTR.ALIASES] = JSON.stringify(c.aliases);
    if (c.channels) {
      for (const [channel, data] of Object.entries(c.channels)) {
        const key = channel.startsWith("channel:") ? channel : `channel:${channel}`;
        if (!isBookAttrKey(key) && !key.startsWith("channel:")) continue;
        const value = typeof data === "string"
          ? data
          : Object.entries(data).map(([k, v]) => `${k}:${v}`).join(",");
        if (value) attrs[isBookAttrKey(key) ? key : key] = value;
      }
    }
    out.push({
      name,
      attrs,
      externalId: c.id,
      source: IMPORT_SOURCE.CONTACT_RESOLVER,
    });
  }
  return dedupeImported(out);
}

function vcardField(block: string, key: string): string | null {
  const re = new RegExp(`^${key}[^:]*:(.+)$`, "im");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function dedupeImported(rows: ImportedContact[]): ImportedContact[] {
  const seen = new Map<string, ImportedContact>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      continue;
    }
    seen.set(key, {
      ...existing,
      description: existing.description || row.description,
      attrs: { ...row.attrs, ...existing.attrs },
      externalId: existing.externalId || row.externalId,
    });
  }
  return [...seen.values()];
}
