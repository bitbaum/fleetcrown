import { NextResponse } from "next/server";
import { getPersonDetail } from "@/db/queries/people";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const person = await getPersonDetail(id);

  if (!person) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(person);
}
