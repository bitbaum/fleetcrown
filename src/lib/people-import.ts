/**
 * Parse a user-supplied address book into contact rows.
 *
 * Sources we accept (the user handed us the file):
 *   - vCard (.vcf)
 *   - CSV with a name column
 *   - contact-resolver.json (the OpenClaw book already used at seed)
 *
 * We do not fetch anyone's social graph. Handing us the file is the
 * approval — matching people get missing fields written; new names are
 * created. Inferred enrichments (scan) stay accept/discard.
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

/** Google Contacts export uses "E-mail 1 - Value", "Phone 1 - Value", "Organization Name". */
export function looksLikeGoogleContactsCsv(header: string[]): boolean {
  const joined = header.join(" | ").toLowerCase();
  return /e-mail 1|email 1 - value|organization name|first name/.test(joined) && header.length > 8;
}

function headerIndex(header: string[], re: RegExp): number {
  return header.findIndex((h) => re.test(h));
}

export function parseCsv(text: string): ImportedContact[] {
  const table = parseCsvTable(text);
  if (table.length === 0) return [];
  const header = table[0]!.map((h) => h.toLowerCase().replace(/[\u2013\u2014]/g, "-").trim());
  const dataRows = table.slice(1);
  if (looksLikeGoogleContactsCsv(header)) return parseGoogleContactsCsv(header, dataRows);
  const hasHeader = header.some((h) => /name|email|phone|fn|display/.test(h));
  const rows = hasHeader ? dataRows : table;
  const nameIdx = hasHeader ? header.findIndex((h) => /^(name|display name|fn|full name)$/.test(h)) : 0;
  const emailIdx = hasHeader ? header.findIndex((h) => /email/.test(h)) : -1;
  const phoneIdx = hasHeader ? header.findIndex((h) => /phone|tel|mobile/.test(h)) : -1;
  const noteIdx = hasHeader ? header.findIndex((h) => /note|notes|comment/.test(h)) : -1;
  const orgIdx = hasHeader ? header.findIndex((h) => /org|company|organisation|organization/.test(h)) : -1;

  const out: ImportedContact[] = [];
  for (const cols of rows) {
    const name = (cols[nameIdx >= 0 ? nameIdx : 0] ?? "").trim();
    if (!name || normalizeName(name) === "name") continue;
    const attrs: Record<string, string> = {};
    const blob = cols.join(" ");
    const email = emailIdx >= 0 ? cols[emailIdx] : extractEmails(blob)[0];
    const phone = phoneIdx >= 0 ? cols[phoneIdx] : extractPhones(blob)[0];
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
      notes?: string;
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
      description: c.notes?.trim() || undefined,
      attrs,
      externalId: c.id,
      source: IMPORT_SOURCE.CONTACT_RESOLVER,
    });
  }
  return dedupeImported(out);
}

function parseGoogleContactsCsv(header: string[], rows: string[][]): ImportedContact[] {
  const first = headerIndex(header, /^first name$/);
  const last = headerIndex(header, /^last name$/);
  const fileAs = headerIndex(header, /^file as$/);
  const nick = headerIndex(header, /^nickname$/);
  const nameIdx = headerIndex(header, /^(name|display name)$/);
  const emailIdx = headerIndex(header, /e-?mail 1.*value|^e-?mail 1$|^email$/);
  const phoneIdx = headerIndex(header, /phone 1.*value|^phone 1$|^phone$/);
  const orgIdx = headerIndex(header, /^organization name$|^organisation name$/);
  const titleIdx = headerIndex(header, /^organization title$|^organisation title$/);
  const noteIdx = headerIndex(header, /^notes?$/);
  const cityIdx = headerIndex(header, /^address 1 - city$/);
  const countryIdx = headerIndex(header, /^address 1 - country$/);

  const out: ImportedContact[] = [];
  for (const cols of rows) {
    const name = (
      (nameIdx >= 0 ? cols[nameIdx] : "")
      || [first >= 0 ? cols[first] : "", last >= 0 ? cols[last] : ""].filter(Boolean).join(" ")
      || (fileAs >= 0 ? cols[fileAs] : "")
    ).trim();
    if (!name) continue;
    const attrs: Record<string, string> = {};
    const email = emailIdx >= 0 ? cols[emailIdx]?.trim() : "";
    const phone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() : "";
    const org = orgIdx >= 0 ? cols[orgIdx]?.trim() : "";
    const title = titleIdx >= 0 ? cols[titleIdx]?.trim() : "";
    const nickname = nick >= 0 ? cols[nick]?.trim() : "";
    const city = cityIdx >= 0 ? cols[cityIdx]?.trim() : "";
    const country = countryIdx >= 0 ? cols[countryIdx]?.trim() : "";
    if (email) attrs[BOOK_ATTR.EMAIL] = email;
    if (phone) attrs[BOOK_ATTR.PHONE] = phone;
    if (org) attrs[BOOK_ATTR.COMPANY] = org;
    if (title) attrs[BOOK_ATTR.PROFESSION] = title;
    if (nickname) attrs[BOOK_ATTR.ALIASES] = JSON.stringify([nickname]);
    const place = [city, country].filter(Boolean).join(", ");
    if (place) attrs[BOOK_ATTR.LOCATION] = place;
    const note = noteIdx >= 0 ? cols[noteIdx]?.trim() : "";
    out.push({ name, description: note || undefined, attrs, source: IMPORT_SOURCE.CSV });
  }
  return dedupeImported(out);
}

const KNOWLEDGE_KEY_MAP: Record<string, string> = {
  email: BOOK_ATTR.EMAIL,
  whatsapp: BOOK_ATTR.WHATSAPP,
  phone: BOOK_ATTR.PHONE,
  telegram: BOOK_ATTR.TELEGRAM,
  profession: BOOK_ATTR.PROFESSION,
  role: BOOK_ATTR.PROFESSION,
  title: BOOK_ATTR.PROFESSION,
  company: BOOK_ATTR.COMPANY,
  affiliation: BOOK_ATTR.COMPANY,
  organization: BOOK_ATTR.COMPANY,
  organisation: BOOK_ATTR.COMPANY,
  home_location: BOOK_ATTR.LOCATION,
  location: BOOK_ATTR.LOCATION,
  relationship_to_george: BOOK_ATTR.RELATIONSHIP,
  relationship: BOOK_ATTR.RELATIONSHIP,
};

/** OpenClaw knowledge.sqlite person rows — the 11 richer profiles, not the WhatsApp dump. */
export function parseKnowledgePeople(
  people: Array<{ name: string; description?: string | null; attrs?: Record<string, string> }>,
): ImportedContact[] {
  const out: ImportedContact[] = [];
  for (const p of people) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    const attrs: Record<string, string> = {};
    for (const [rawKey, rawVal] of Object.entries(p.attrs ?? {})) {
      const val = String(rawVal ?? "").trim();
      if (!val) continue;
      const mapped = KNOWLEDGE_KEY_MAP[rawKey.toLowerCase().trim()];
      if (mapped) attrs[mapped] = val;
    }
    out.push({
      name,
      description: p.description?.trim() || undefined,
      attrs,
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

/** RFC4180-ish: quoted commas and newlines stay inside the field. */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cur.trim());
      cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
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
