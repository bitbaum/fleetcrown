/**
 * Private book — SSOT for import, enrich, and merge.
 *
 * These are book-building proposals, not Loki "do something in the world"
 * actions. They reuse the actions table (draft → accept/discard) so the
 * IRON RULE stays one gate. They are excluded from Today's draft count
 * so 200 vCards cannot drown the check-in queue.
 *
 * Import is accept/discard of a file the user handed us (vCard, CSV, or
 * the contact-resolver JSON they already have). It is not a scrape.
 * Their public identity on a network is not a GTM lead.
 */

import { ACTION_TYPE, ENTITY_TYPE, type ActionType } from "@/lib/constants/statuses";

export const BOOK_ACTION_TYPE = {
  IMPORT_PERSON: "import_person",
  ENRICH_PERSON: "enrich_person",
  MERGE_PEOPLE: "merge_people",
} as const;

export const BOOK_ACTION_TYPES = [
  ACTION_TYPE.IMPORT_PERSON,
  ACTION_TYPE.ENRICH_PERSON,
  ACTION_TYPE.MERGE_PEOPLE,
] as const satisfies readonly ActionType[];

export function isBookActionType(type: string): type is (typeof BOOK_ACTION_TYPES)[number] {
  return (BOOK_ACTION_TYPES as readonly string[]).includes(type);
}

export const IMPORT_SOURCE = {
  VCARD: "vcard",
  CSV: "csv",
  CONTACT_RESOLVER: "contact-resolver",
  INTERNAL: "internal",
} as const;
export type ImportSource = (typeof IMPORT_SOURCE)[keyof typeof IMPORT_SOURCE];
export const IMPORT_SOURCES = Object.values(IMPORT_SOURCE) as [ImportSource, ...ImportSource[]];

export const IMPORT_SOURCE_LABEL: Record<ImportSource, string> = {
  [IMPORT_SOURCE.VCARD]: "vCard",
  [IMPORT_SOURCE.CSV]: "CSV",
  [IMPORT_SOURCE.CONTACT_RESOLVER]: "Contact book",
  [IMPORT_SOURCE.INTERNAL]: "This book",
};

/** Attribute keys an import/enrich proposal may write. Nothing else. */
export const BOOK_ATTR = {
  EMAIL: "channel:email",
  PHONE: "channel:phone",
  WHATSAPP: "channel:whatsapp",
  TELEGRAM: "channel:telegram",
  ALIASES: "aliases",
  PROFESSION: "profession",
  LOCATION: "location",
  COMPANY: "company",
} as const;

export const BOOK_ATTR_KEYS = Object.values(BOOK_ATTR);

export const BOOK_ATTR_LABEL: Record<string, string> = {
  [BOOK_ATTR.EMAIL]: "Email",
  [BOOK_ATTR.PHONE]: "Phone",
  [BOOK_ATTR.WHATSAPP]: "WhatsApp",
  [BOOK_ATTR.TELEGRAM]: "Telegram",
  [BOOK_ATTR.ALIASES]: "Aliases",
  [BOOK_ATTR.PROFESSION]: "Profession",
  [BOOK_ATTR.LOCATION]: "Location",
  [BOOK_ATTR.COMPANY]: "Company",
};

const BOOK_ATTR_SET = new Set<string>(BOOK_ATTR_KEYS);

export function isBookAttrKey(key: string): boolean {
  return BOOK_ATTR_SET.has(key);
}

export const IMPORT_BATCH_CAP = 200;

export function importDraftTitle(name: string): string {
  return `Import: ${name}`.slice(0, 200);
}

export function enrichDraftTitle(name: string, field: string): string {
  return `Enrich: ${name} · ${BOOK_ATTR_LABEL[field] ?? field}`.slice(0, 200);
}

export function mergeDraftTitle(keepName: string, dropName: string): string {
  return `Merge: ${keepName} ← ${dropName}`.slice(0, 200);
}

/** Consumer inboxes are not companies. */
export const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "web.de",
  "aol.com",
]);

/** People entities only — robots never enter the book-building queue. */
export const BOOK_ENTITY_TYPE = ENTITY_TYPE.PERSON;
