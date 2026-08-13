/**
 * Cluster people that are probably the same human.
 *
 * Keys, in order of confidence:
 *   1. same email
 *   2. same phone (digits only)
 *   3. same normalized name
 *
 * Pure. The query layer feeds {id, name, attrs}; this file never touches DB.
 */

export type DedupePerson = {
  id: string;
  name: string;
  attrs: Record<string, string>;
};

export type DuplicateCluster = {
  key: string;
  reason: "email" | "phone" | "name";
  members: DedupePerson[];
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function extractPhones(text: string): string[] {
  const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) ?? [];
  const digits = matches
    .map((m) => m.replace(/\D/g, ""))
    .filter((d) => d.length >= 7);
  return [...new Set(digits)];
}

/**
 * Same number across formats: +41 78 322 69 39 vs 078 322 69 39.
 * Last 8 digits is the national significant part for most mobiles.
 * Used for import matching only — clustering still requires exact digits
 * so two people in different countries cannot collapse on a coincidence.
 */
export function phonesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 8 && long.endsWith(short.slice(-8));
}

export function clusterPeople(people: DedupePerson[]): DuplicateCluster[] {
  const byEmail = new Map<string, DedupePerson[]>();
  const byPhone = new Map<string, DedupePerson[]>();
  const byName = new Map<string, DedupePerson[]>();

  for (const p of people) {
    for (const email of emailsOf(p)) {
      const list = byEmail.get(email) ?? [];
      list.push(p);
      byEmail.set(email, list);
    }
    for (const phone of phonesOf(p)) {
      const list = byPhone.get(phone) ?? [];
      list.push(p);
      byPhone.set(phone, list);
    }
    const name = normalizeName(p.name);
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(p);
      byName.set(name, list);
    }
  }

  const seen = new Set<string>();
  const out: DuplicateCluster[] = [];

  function push(reason: DuplicateCluster["reason"], key: string, members: DedupePerson[]) {
    const uniq = uniqueById(members);
    if (uniq.length < 2) return;
    const sig = uniq.map((m) => m.id).sort().join(",");
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ key, reason, members: uniq });
  }

  for (const [key, members] of byEmail) push("email", key, members);
  for (const [key, members] of byPhone) push("phone", key, members);
  for (const [key, members] of byName) push("name", key, members);

  return out.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

function uniqueById(people: DedupePerson[]): DedupePerson[] {
  const map = new Map<string, DedupePerson>();
  for (const p of people) map.set(p.id, p);
  return [...map.values()];
}

export function emailsOf(p: DedupePerson): string[] {
  const blob = [p.attrs["channel:email"], p.attrs.email, p.attrs.mail].filter(Boolean).join(" ");
  return extractEmails(blob);
}

export function phonesOf(p: DedupePerson): string[] {
  const blob = [
    p.attrs["channel:phone"],
    p.attrs["channel:whatsapp"],
    p.attrs.phone,
    p.attrs.mobile,
  ].filter(Boolean).join(" ");
  return extractPhones(blob);
}

/** Upgrade "Aaron" → "Aaron Brooks" when the imported name is the same person, longer. */
export function shouldPreferImportedName(current: string, imported: string): boolean {
  const a = normalizeName(current);
  const b = normalizeName(imported);
  if (!a || !b || a === b) return false;
  return b.startsWith(`${a} `) && b.length >= a.length + 3;
}

/** Prefer the richer row — more attrs, then longer name. */
export function pickCanonicalPerson(members: DedupePerson[]): DedupePerson {
  return [...members].sort((a, b) => {
    const score = (p: DedupePerson) => Object.keys(p.attrs).filter((k) => p.attrs[k]).length * 10 + p.name.length;
    return score(b) - score(a);
  })[0]!;
}

/** Match an imported contact to a person already in the book. Email, then phone, then name. */
export function matchImportedContact(
  contact: { name: string; attrs: Record<string, string> },
  people: DedupePerson[],
): DedupePerson | null {
  const emails = extractEmails(Object.values(contact.attrs).join(" "));
  if (emails.length > 0) {
    const hit = people.find((p) => emailsOf(p).some((e) => emails.includes(e)));
    if (hit) return hit;
  }
  const phones = extractPhones(Object.values(contact.attrs).join(" "));
  if (phones.length > 0) {
    const hit = people.find((p) => phonesOf(p).some((ph) => phones.some((imp) => phonesCompatible(ph, imp))));
    if (hit) return hit;
  }
  const name = normalizeName(contact.name);
  return people.find((p) => normalizeName(p.name) === name) ?? null;
}
