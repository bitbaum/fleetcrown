import { NextRequest, NextResponse } from "next/server";
import { z, type ZodSchema } from "zod";
import { isValidUuid } from "@/lib/utils";

/**
 * Resolve and validate the `id` route param at a `/[id]` API handler.
 *
 * Returns the validated id as a string, or a 400 NextResponse the
 * caller should return as-is. Centralises the boilerplate that every
 * `/api/.../[id]/route.ts` had at the top of every method handler.
 *
 *   const idOrResp = await readIdParam(ctx.params);
 *   if (idOrResp instanceof NextResponse) return idOrResp;
 *   const id = idOrResp;
 */
export async function readIdParam(
  params: Promise<{ id: string }>,
): Promise<string | NextResponse> {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  return id;
}

/**
 * Read + validate a JSON request body against a zod schema. Caller gets
 * back either the parsed (and typed) data, or a 400 NextResponse with a
 * single human-readable error message — same callsite shape as
 * readIdParam so handlers branch the same way.
 *
 *   const dataOrResp = await readJsonBody(req, CreateEventBody);
 *   if (dataOrResp instanceof NextResponse) return dataOrResp;
 *   const { name, type } = dataOrResp;
 */
export async function readJsonBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): Promise<T | NextResponse> {
  const raw = await req.json().catch(() => null) as unknown;
  if (raw === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: friendlyZodMessage(parsed.error) }, { status: 400 });
  }
  return parsed.data;
}

/** Pick a human-readable message from the first zod issue, with a
 *  special case for "field is missing" (zod's default there reads as
 *  "Invalid input: expected string, received undefined"). */
function friendlyZodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  if (issue.code === "invalid_type" && issue.path.length > 0) {
    return `${issue.path.join(".")} is required`;
  }
  return issue.message;
}

/**
 * Handle the unique constraint on (userId, name, type) in the entities table.
 * Returns a 409 NextResponse when the error is a duplicate-name violation,
 * or null if it's a different error (so the caller can re-throw).
 *
 * Usage:
 *   const dup = handleDuplicateEntityNameError(e, "person");
 *   if (dup) return dup;
 *   throw e;
 */
export function handleDuplicateEntityNameError(
  e: unknown,
  entityLabel: string,
): NextResponse | null {
  if (e instanceof Error && e.message.includes("uq_entities_user_name_type")) {
    return NextResponse.json(
      { error: `A ${entityLabel} with that name already exists` },
      { status: 409 },
    );
  }
  return null;
}

/**
 * True when a caught error is a Postgres unique-constraint violation
 * (SQLSTATE 23505). Drizzle/pg surface the driver error with a `code`
 * field; route handlers use this to turn a duplicate insert into a 409
 * instead of a 500.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

// Re-export zod so route files don't have to import from "zod" + this
// helper file — keeps the validation surface in one place.
export { z };
