import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody } from "@/lib/api/route-helpers";
import { createGuide, deleteGuide, getGuides, updateGuide } from "@/db/queries/site-guides";

const StepSchema = z.object({
  label: z.string().trim().min(1).max(200),
  path: z.string().trim().max(1000).optional(),
  note: z.string().trim().max(1000).optional(),
});

const CreateBody = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  steps: z.array(StepSchema).max(40).default([]),
});

const UpdateBody = z.object({
  guideId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  steps: z.array(StepSchema).max(40).optional(),
});

/** Drop empty trailing fields so a blank note never renders as an empty line. */
function normalizeSteps(steps: z.infer<typeof StepSchema>[]) {
  return steps.map((s) => ({
    label: s.label,
    ...(s.path ? { path: s.path } : {}),
    ...(s.note ? { note: s.note } : {}),
  }));
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  return NextResponse.json({ guides: await getGuides(userId, projectId) });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const created = await createGuide(userId, dataOrResp.projectId, {
    title: dataOrResp.title,
    description: dataOrResp.description ?? null,
    steps: normalizeSteps(dataOrResp.steps),
  });
  // createGuide returns null only when the project is not the caller's — a 404
  // rather than a 403 so an unauthorized probe cannot confirm the id exists.
  if (!created) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, guide: created });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, UpdateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { guideId, steps, ...rest } = dataOrResp;
  const updated = await updateGuide(userId, guideId, {
    ...rest,
    ...(steps ? { steps: normalizeSteps(steps) } : {}),
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, guide: updated });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const guideId = req.nextUrl.searchParams.get("guideId");
  if (!guideId) return NextResponse.json({ error: "guideId required" }, { status: 400 });

  const deleted = await deleteGuide(userId, guideId);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
