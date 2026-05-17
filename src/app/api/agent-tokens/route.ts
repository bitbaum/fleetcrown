import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createAgentToken, listAgentTokens, deleteAgentToken } from "@/db/queries/agent-tokens";
import { getOwnerOrgId } from "@/db/queries/orgs";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const CreateBody = z.object({
  label: z.string().trim().min(1).max(80),
});

const DeleteBody = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = await listAgentTokens(userId);
  // Never expose the token value in list — only show metadata.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const safe = tokens.map(({ token: _t, ...rest }) => rest);
  return NextResponse.json({ tokens: safe });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, CreateBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { label } = dataOrResp;

  const orgId = await getOwnerOrgId(userId);
  const { token, record } = await createAgentToken(userId, label, orgId);

  // Return the plaintext token exactly once — caller must store it.
  return NextResponse.json({ token, id: record.id, label: record.label, createdAt: record.createdAt });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, DeleteBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await deleteAgentToken(dataOrResp.id, userId);
  return NextResponse.json({ ok: true });
}
