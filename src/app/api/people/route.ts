import { NextResponse } from "next/server";
import { searchPeople, type SortMode } from "@/db/queries/people";

const VALID_SORTS: SortMode[] = ["recent", "name", "health"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const sortRaw = searchParams.get("sort") ?? "recent";
  const sort: SortMode = VALID_SORTS.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : "recent";

  const result = await searchPeople(q, limit, offset, sort);
  return NextResponse.json(result);
}
