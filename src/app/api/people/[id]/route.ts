import { NextResponse } from "next/server";
import { getPersonDetail } from "@/db/queries/people";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(null, { status: 400 });
  }

  const person = await getPersonDetail(id);

  if (!person) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(person);
}
