/**
 * Deterministic enrichment proposals from data already on the person.
 *
 * We never invent a biography. We only lift a fact that is already sitting
 * in notes or a mis-keyed attribute onto a canonical book field.
 */

import { BOOK_ATTR, PUBLIC_MAIL_DOMAINS } from "@/config/book";
import { extractEmails, extractPhones } from "@/lib/people-dedupe";

export type EnrichmentProposal = {
  key: string;
  value: string;
  reason: string;
};

export function proposeEnrichments(input: {
  name: string;
  description: string | null;
  attrs: Record<string, string>;
}): EnrichmentProposal[] {
  const out: EnrichmentProposal[] = [];
  const blob = [input.description, ...Object.values(input.attrs)].filter(Boolean).join("\n");

  if (!input.attrs[BOOK_ATTR.EMAIL]) {
    const email = extractEmails(blob)[0];
    if (email) out.push({ key: BOOK_ATTR.EMAIL, value: email, reason: "Email found in notes or another field." });
  }

  if (!input.attrs[BOOK_ATTR.PHONE] && !input.attrs[BOOK_ATTR.WHATSAPP]) {
    const phone = extractPhones(blob)[0];
    if (phone) out.push({ key: BOOK_ATTR.PHONE, value: phone, reason: "Phone number found in notes or another field." });
  }

  if (!input.attrs[BOOK_ATTR.COMPANY]) {
    const email = input.attrs[BOOK_ATTR.EMAIL] ?? extractEmails(blob)[0];
    const domain = email?.split("@")[1]?.toLowerCase();
    if (domain && !PUBLIC_MAIL_DOMAINS.has(domain)) {
      const company = domain.split(".")[0] ?? "";
      if (company.length >= 2) {
        out.push({
          key: BOOK_ATTR.COMPANY,
          value: company.charAt(0).toUpperCase() + company.slice(1),
          reason: `Inferred from email domain ${domain}. Discard if wrong.`,
        });
      }
    }
  }

  return out;
}
