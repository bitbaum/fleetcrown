import { NextResponse } from "next/server";
import { searchPeople } from "@/db/queries/people";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  const result = await searchPeople(q, limit, offset);
  return NextResponse.json(result);
}
