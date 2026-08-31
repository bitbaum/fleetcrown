import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { readJsonBody } from "@/lib/api/route-helpers";
import { IMPORT_SOURCES } from "@/config/book";
import { detectImportSource, parseImport } from "@/lib/people-import";
import { applyImportedBook } from "@/db/queries/people-book";
import { canImportSocial } from "@/config/actors";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

const Body = z.object({
  text: z.string().min(1).max(1_000_000),
  filename: z.string().trim().optional(),
  source: z.enum(IMPORT_SOURCES).optional(),
  offset: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  if (!canImportSocial(ENTITY_TYPE.PERSON)) {
    return NextResponse.json(
      { error: "People import is not allowed for this actor kind" },
      { status: 403 },
    );
  }
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const source =
    dataOrResp.source ?? detectImportSource(dataOrResp.filename ?? "", dataOrResp.text);
  const contacts = parseImport(dataOrResp.text, source);
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts found in that file" }, { status: 422 });
  }
  const result = await applyImportedBook(access.userId, contacts, dataOrResp.offset ?? 0);
  return NextResponse.json({ ok: true, source, ...result });
}
