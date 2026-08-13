/**
 * Publish a robot to OrangeCat as an asset.
 *
 * People never go through here — callers must already have passed canMarket.
 * Fire-and-forget from the user's point of view: a missing OC key leaves
 * listing intent on the robot and returns null.
 */

import { getOrangeCatClient } from "@/lib/integrations/orangecat";
import {
  ROBOT_ATTR,
  ROBOT_CLASS_TO_OC_ASSET,
  assertCanMarket,
  type RobotClass,
} from "@/config/actors";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { upsertEntityAttribute } from "@/db/queries/utils";
import type { RobotWithAttributes } from "@/db/queries/robots";

export async function publishRobotAsset(
  userId: string,
  robot: RobotWithAttributes,
): Promise<{ assetId: string | null; published: boolean; reason?: string }> {
  assertCanMarket(ENTITY_TYPE.ROBOT);
  const listed = robot.market.book || robot.market.rent || robot.market.sell;
  if (!listed) {
    return { assetId: robot.orangecatAssetId, published: false, reason: "no-offer" };
  }

  const client = await getOrangeCatClient();
  if (!client) {
    return { assetId: robot.orangecatAssetId, published: false, reason: "orangecat-not-configured" };
  }

  const robotClass = (robot.robotClass ?? "other") as RobotClass;
  const spec = [robot.make, robot.model].filter(Boolean).join(" ");
  const offers = [
    robot.market.book && "bookable",
    robot.market.rent && "rentable",
    robot.market.sell && "sellable",
  ].filter(Boolean).join(", ");

  try {
    const asset = await client.assets.create(
      {
        title: robot.name,
        description: [robot.description, spec && `Spec: ${spec}`, `Offers: ${offers}`].filter(Boolean).join("\n"),
        type: ROBOT_CLASS_TO_OC_ASSET[robotClass],
        is_for_rent: robot.market.book || robot.market.rent,
        is_for_sale: robot.market.sell,
      } as Parameters<typeof client.assets.create>[0],
      { idempotencyKey: `fleetcrown_robot_${robot.id}` },
    );
    await upsertEntityAttribute(userId, robot.id, ROBOT_ATTR.ORANGECAT_ASSET_ID, asset.id);
    return { assetId: asset.id, published: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "orangecat-publish-failed";
    console.warn("[orangecat] robot asset publish failed", { robotId: robot.id, reason });
    return { assetId: robot.orangecatAssetId, published: false, reason };
  }
}
