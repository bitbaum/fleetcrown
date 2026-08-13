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

function emailsOf(p: DedupePerson): string[] {
  const blob = [p.attrs["channel:email"], p.attrs.email, p.attrs.mail].filter(Boolean).join(" ");
  return extractEmails(blob);
}

function phonesOf(p: DedupePerson): string[] {
  const blob = [
    p.attrs["channel:phone"],
    p.attrs["channel:whatsapp"],
    p.attrs.phone,
    p.attrs.mobile,
  ].filter(Boolean).join(" ");
  return extractPhones(blob);
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
