import { NextResponse } from "next/server";
import { searchPeople } from "@/db/queries/people";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const result = await searchPeople(q, limit, offset);
  return NextResponse.json(result);
}
