import { NextResponse } from "next/server";
import { homedir } from "os";
import { readFile } from "fs/promises";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { IMPORT_SOURCE } from "@/config/book";
import { parseContactResolver, parseKnowledgePeople, type ImportedContact } from "@/lib/people-import";
import { applyImportedBook } from "@/db/queries/people-book";
import { canImportSocial } from "@/config/actors";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

function resolverPath(): string {
  return process.env.OPENCLAW_CONTACTS_PATH?.trim()
    || `${homedir()}/.openclaw/workspace/data/contact-resolver.json`;
}

function knowledgePath(): string {
  return process.env.OPENCLAW_KNOWLEDGE_PATH?.trim()
    || `${homedir()}/.openclaw/knowledge.sqlite`;
}

async function readKnowledgePeople(): Promise<ImportedContact[]> {
  try {
    const Database = (await import("better-sqlite3")).default;
    const sqlite = new Database(knowledgePath(), { readonly: true });
    try {
      const rows = sqlite.prepare(
        "SELECT id, name FROM entities WHERE type = 'person'",
      ).all() as Array<{ id: number; name: string }>;
      const attrs = sqlite.prepare(
        "SELECT entity_id, key, value FROM attributes",
      ).all() as Array<{ entity_id: number; key: string; value: string }>;
      const byId = new Map<number, Record<string, string>>();
      for (const a of attrs) {
        const bag = byId.get(a.entity_id) ?? {};
        bag[a.key] = a.value;
        byId.set(a.entity_id, bag);
      }
      return parseKnowledgePeople(rows.map((r) => ({ name: r.name, attrs: byId.get(r.id) ?? {} })));
    } finally {
      sqlite.close();
    }
  } catch {
    return [];
  }
}

export async function POST() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  if (!canImportSocial(ENTITY_TYPE.PERSON)) {
    return NextResponse.json({ error: "People import is not allowed" }, { status: 403 });
  }

  let text: string | null = null;
  try {
    text = await readFile(resolverPath(), "utf8");
  } catch {
    text = null;
  }

  const fromResolver = text ? parseContactResolver(text) : [];
  const fromKnowledge = await readKnowledgePeople();
  const contacts = [...fromResolver, ...fromKnowledge];
  if (contacts.length === 0) {
    return NextResponse.json({
      error: "OpenClaw book not on this server. Upload contact-resolver.json with Import address book.",
      path: resolverPath(),
    }, { status: 404 });
  }

  let offset = 0;
  let created = 0;
  let enriched = 0;
  let skipped = 0;
  let done = false;
  while (!done) {
    const chunk = await applyImportedBook(access.userId, contacts, offset);
    created += chunk.created;
    enriched += chunk.enriched;
    skipped += chunk.skipped;
    offset = chunk.nextOffset;
    done = chunk.done;
  }

  return NextResponse.json({
    ok: true,
    source: IMPORT_SOURCE.CONTACT_RESOLVER,
    parsed: contacts.length,
    created,
    enriched,
    skipped,
    knowledge: fromKnowledge.length,
  });
}
