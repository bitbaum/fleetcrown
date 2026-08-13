import { NextResponse } from "next/server";
import { homedir } from "os";
import { readFile } from "fs/promises";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { IMPORT_SOURCE } from "@/config/book";
import { parseContactResolver } from "@/lib/people-import";
import { enqueueImport } from "@/db/queries/people-book";
import { canImportSocial } from "@/config/actors";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

function resolverPath(): string {
  return process.env.OPENCLAW_CONTACTS_PATH?.trim()
    || `${homedir()}/.openclaw/workspace/data/contact-resolver.json`;
}

export async function POST() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  if (!canImportSocial(ENTITY_TYPE.PERSON)) {
    return NextResponse.json({ error: "People import is not allowed" }, { status: 403 });
  }

  let text: string;
  try {
    text = await readFile(resolverPath(), "utf8");
  } catch {
    return NextResponse.json({
      error: "OpenClaw book not on this server. Upload contact-resolver.json with Import address book.",
      path: resolverPath(),
    }, { status: 404 });
  }

  const contacts = parseContactResolver(text);
  if (contacts.length === 0) {
    return NextResponse.json({ error: "OpenClaw book is empty" }, { status: 422 });
  }
  const result = await enqueueImport(access.userId, contacts, IMPORT_SOURCE.CONTACT_RESOLVER);
  return NextResponse.json({ ok: true, source: IMPORT_SOURCE.CONTACT_RESOLVER, parsed: contacts.length, ...result });
}
