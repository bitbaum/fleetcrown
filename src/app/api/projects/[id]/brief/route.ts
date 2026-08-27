import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { extractProjectProfile, applyProjectProfile } from "@/lib/project-brief";
import { getProjectCore } from "@/db/queries/projects";
import { LONG_TEXT_MAX } from "@/lib/constants";

// Free-form project brief → structured profile. The user writes (or dictates)
// what the project should be in plain language; the model fills description +
// mission/vision/customers/stack/status/next_step. No forms.

const BriefBody = z.object({
  text: z.string().trim().min(10, "Tell us a bit more — at least a sentence.").max(LONG_TEXT_MAX),
  // Defaults to false so the kickoff flow is unchanged: there the user has just
  // edited the brief and means for the profile to be rewritten from it. The
  // health worklist passes true — it fills gaps in a profile someone has
  // already worked on, where quietly replacing their own mission with the
  // model's would be a worse outcome than leaving the point unearned.
  onlyMissing: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, BriefBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const project = await getProjectCore(userId, idOrResp);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let profile;
  try {
    profile = await extractProjectProfile(project.name, dataOrResp.text);
  } catch (e) {
    return NextResponse.json(
      { error: "Could not extract a profile from that text. Try again in a moment.", details: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const applied = await applyProjectProfile(userId, idOrResp, profile, {
    onlyMissing: dataOrResp.onlyMissing,
  });
  if (applied === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Object.keys(applied).length === 0) {
    return NextResponse.json(
      {
        error: dataOrResp.onlyMissing
          ? "Nothing to fill — every field the brief could answer is already written."
          : "The text didn't contain anything to fill the profile with.",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true, applied });
}
