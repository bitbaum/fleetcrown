import { NextResponse } from "next/server";
import { getPersonDetail } from "@/db/queries/people";
import { isValidUuid } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json(null, { status: 400 });
  }

  const person = await getPersonDetail(id);

  if (!person) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(person);
}
