/**
 * The attribute endpoints every entity kind shares.
 *
 * Attributes live in one table keyed by entity id, so `POST /attrs` and
 * `DELETE /attrs` are the same request whatever the entity is called in the
 * URL. People and robots each had their own copy; the only real difference was
 * that robots first proves the id IS a robot the caller owns, so that
 * `/api/robots/<a person's id>/attrs` cannot write through the wrong door.
 *
 * That check is the `guard` parameter rather than a second file. A kind that
 * needs no guard passes none and gets byte-identical responses to what it had.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import {
  upsertEntityAttribute,
  deleteEntityAttribute,
  SetAttrBody,
  DeleteAttrBody,
} from "@/db/queries/utils";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { isActorCapabilityError } from "@/config/actors";

type RouteContext = { params: Promise<{ id: string }> };

/** Returns false when the id is not an entity of this kind owned by the user. */
type AttrGuard = (userId: string, id: string) => Promise<boolean>;

/**
 * Build the POST + DELETE handlers a `[id]/attrs/route.ts` re-exports.
 *
 * @param guard Optional ownership/kind check run BEFORE the body is read —
 *              the order the robots route already used, kept so a bad id still
 *              answers 404 rather than 400 on a malformed body.
 */
export function entityAttrHandlers(guard?: AttrGuard) {
  async function open(params: RouteContext["params"]) {
    const access = await requirePrivateApiAccess();
    if (access instanceof NextResponse) return access;
    const { userId } = access;
    const idOrResp = await readIdParam(params);
    if (idOrResp instanceof NextResponse) return idOrResp;
    if (guard && !(await guard(userId, idOrResp))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return { userId, id: idOrResp };
  }

  return {
    async POST(req: NextRequest, { params }: RouteContext) {
      const opened = await open(params);
      if (opened instanceof NextResponse) return opened;

      const dataOrResp = await readJsonBody(req, SetAttrBody);
      if (dataOrResp instanceof NextResponse) return dataOrResp;

      try {
        const ok = await upsertEntityAttribute(
          opened.userId,
          opened.id,
          dataOrResp.key,
          dataOrResp.value,
        );
        if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
      } catch (e: unknown) {
        if (isActorCapabilityError(e)) {
          return NextResponse.json({ error: e.message }, { status: 403 });
        }
        throw e;
      }
    },

    async DELETE(req: NextRequest, { params }: RouteContext) {
      const opened = await open(params);
      if (opened instanceof NextResponse) return opened;

      const dataOrResp = await readJsonBody(req, DeleteAttrBody);
      if (dataOrResp instanceof NextResponse) return dataOrResp;

      await deleteEntityAttribute(opened.userId, opened.id, dataOrResp.key);
      return NextResponse.json({ ok: true });
    },
  };
}
