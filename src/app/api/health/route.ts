import { NextResponse } from "next/server";
import { isRuntimeAvailable } from "@/lib/runtime";

// force-dynamic: env read must happen at request time, not build time.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: isRuntimeAvailable(),
    version: process.env.npm_package_version ?? null,
  });
}
