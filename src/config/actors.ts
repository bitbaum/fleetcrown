/**
 * Actor kernel — SSOT for anything that can have a profile in a user's
 * private book.
 *
 * Two kinds, one table (`entities`), different laws:
 *
 *   human  — a relationship. Check in, reach, import from *your* address
 *            book / social accounts. Never list, book, rent, or sell.
 *   robot  — a machine you own. Humanoid, vacuum, drone, industrial,
 *            whatever. Profile first. Book / rent / sell are legal
 *            because the listing is an OrangeCat *asset*, not a person.
 *
 * The book is per-user (`entities.user_id`). Another user's contacts and
 * robots never appear here. Social import is an accept/discard proposal
 * into *this* user's book — it is not a scrape, and it is never a GTM
 * side-channel (their public identity ≠ your private notes).
 *
 * Marketplace checkout lives in OrangeCat. This file only answers
 * "may this actor be listed at all?" The pointer is `orangecat_asset_id`.
 */

import { z } from "zod";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export const ACTOR_KIND = {
  HUMAN: "human",
  ROBOT: "robot",
} as const;
export type ActorKind = (typeof ACTOR_KIND)[keyof typeof ACTOR_KIND];

export const ACTOR_CAPABILITY = {
  CHECK_IN: "check_in",
  REACH: "reach",
  SOCIAL_IMPORT: "social_import",
  MARKET: "market",
} as const;
export type ActorCapability = (typeof ACTOR_CAPABILITY)[keyof typeof ACTOR_CAPABILITY];

export const MARKET_OFFER = {
  BOOK: "book",
  RENT: "rent",
  SELL: "sell",
} as const;
export type MarketOffer = (typeof MARKET_OFFER)[keyof typeof MARKET_OFFER];
export const MARKET_OFFERS = Object.values(MARKET_OFFER) as [MarketOffer, ...MarketOffer[]];

export const MARKET_OFFER_LABEL: Record<MarketOffer, string> = {
  [MARKET_OFFER.BOOK]: "Bookable",
  [MARKET_OFFER.RENT]: "Rentable",
  [MARKET_OFFER.SELL]: "Sellable",
};

/**
 * Robot class is a field, not a type. A vacuum and a humanoid share the
 * same entity type and the same market law. Adding "lawn mower" is a
 * config line, not a migration.
 */
export const ROBOT_CLASS = {
  HUMANOID: "humanoid",
  VACUUM: "vacuum",
  DRONE: "drone",
  INDUSTRIAL: "industrial",
  VEHICLE: "vehicle",
  COMPANION: "companion",
  OTHER: "other",
} as const;
export type RobotClass = (typeof ROBOT_CLASS)[keyof typeof ROBOT_CLASS];
export const ROBOT_CLASSES = Object.values(ROBOT_CLASS) as [RobotClass, ...RobotClass[]];

export const ROBOT_CLASS_LABEL: Record<RobotClass, string> = {
  [ROBOT_CLASS.HUMANOID]: "Humanoid",
  [ROBOT_CLASS.VACUUM]: "Vacuum",
  [ROBOT_CLASS.DRONE]: "Drone",
  [ROBOT_CLASS.INDUSTRIAL]: "Industrial",
  [ROBOT_CLASS.VEHICLE]: "Vehicle",
  [ROBOT_CLASS.COMPANION]: "Companion",
  [ROBOT_CLASS.OTHER]: "Other",
};

/** Attribute keys that belong on a robot profile. */
export const ROBOT_ATTR = {
  CLASS: "robot:class",
  MAKE: "robot:make",
  MODEL: "robot:model",
  ORANGECAT_ASSET_ID: "orangecat_asset_id",
} as const;

/** Attribute keys that record listing intent. Written only when canMarket. */
export const MARKET_ATTR: Record<MarketOffer, string> = {
  [MARKET_OFFER.BOOK]: "market:book",
  [MARKET_OFFER.RENT]: "market:rent",
  [MARKET_OFFER.SELL]: "market:sell",
};

const MARKET_ATTR_VALUES = new Set<string>(Object.values(MARKET_ATTR));
const ROBOT_ATTR_VALUES = new Set<string>(Object.values(ROBOT_ATTR));

export function isMarketAttrKey(key: string): boolean {
  return MARKET_ATTR_VALUES.has(key);
}

export function isRobotAttrKey(key: string): boolean {
  return ROBOT_ATTR_VALUES.has(key);
}

export function isRobotClass(value: string): value is RobotClass {
  return (ROBOT_CLASSES as readonly string[]).includes(value);
}

export function isMarketOffer(value: string): value is MarketOffer {
  return (MARKET_OFFERS as readonly string[]).includes(value);
}

type ActorDef = {
  kind: ActorKind;
  entityType: typeof ENTITY_TYPE.PERSON | typeof ENTITY_TYPE.ROBOT;
  capabilities: readonly ActorCapability[];
  marketOffers: readonly MarketOffer[];
};

export const ACTORS = {
  [ENTITY_TYPE.PERSON]: {
    kind: ACTOR_KIND.HUMAN,
    entityType: ENTITY_TYPE.PERSON,
    capabilities: [
      ACTOR_CAPABILITY.CHECK_IN,
      ACTOR_CAPABILITY.REACH,
      ACTOR_CAPABILITY.SOCIAL_IMPORT,
    ],
    marketOffers: [],
  },
  [ENTITY_TYPE.ROBOT]: {
    kind: ACTOR_KIND.ROBOT,
    entityType: ENTITY_TYPE.ROBOT,
    capabilities: [ACTOR_CAPABILITY.MARKET],
    marketOffers: MARKET_OFFERS,
  },
} as const satisfies Record<string, ActorDef>;

export type ActorEntityType = keyof typeof ACTORS;

export function isActorType(type: string): type is ActorEntityType {
  return type === ENTITY_TYPE.PERSON || type === ENTITY_TYPE.ROBOT;
}

export function actorOf(type: string): ActorDef | null {
  return isActorType(type) ? ACTORS[type] : null;
}

export function can(type: string, capability: ActorCapability): boolean {
  const actor = actorOf(type);
  return actor ? (actor.capabilities as readonly ActorCapability[]).includes(capability) : false;
}

export function canMarket(type: string): boolean {
  return can(type, ACTOR_CAPABILITY.MARKET);
}

export function canCheckIn(type: string): boolean {
  return can(type, ACTOR_CAPABILITY.CHECK_IN);
}

export function canReach(type: string): boolean {
  return can(type, ACTOR_CAPABILITY.REACH);
}

export function canImportSocial(type: string): boolean {
  return can(type, ACTOR_CAPABILITY.SOCIAL_IMPORT);
}

export class ActorCapabilityError extends Error {
  readonly status = 403;
  constructor(
    public readonly type: string,
    public readonly capability: ActorCapability,
    message?: string,
  ) {
    super(message ?? capabilityMessage(type, capability));
    this.name = "ActorCapabilityError";
  }
}

function capabilityMessage(type: string, capability: ActorCapability): string {
  if (capability === ACTOR_CAPABILITY.MARKET) {
    return "People cannot be listed, booked, rented, or sold.";
  }
  return `Actors of type ${type} cannot ${capability.replace("_", " ")}.`;
}

export function isActorCapabilityError(e: unknown): e is ActorCapabilityError {
  return e instanceof ActorCapabilityError;
}

export function assertCanMarket(type: string): void {
  if (!canMarket(type)) {
    throw new ActorCapabilityError(type, ACTOR_CAPABILITY.MARKET);
  }
}

/**
 * Attribute writes go through here so a people attrs route cannot smuggle
 * a listing flag onto a human, and a robot class cannot land on a person.
 */
export function assertAttrAllowed(type: string, key: string): void {
  if (isMarketAttrKey(key)) {
    assertCanMarket(type);
    return;
  }
  if (isRobotAttrKey(key) && type !== ENTITY_TYPE.ROBOT) {
    throw new ActorCapabilityError(
      type,
      ACTOR_CAPABILITY.MARKET,
      "Robot attributes belong on robot profiles.",
    );
  }
}

export function parseMarketFlags(attrs: Record<string, string>): Record<MarketOffer, boolean> {
  return {
    [MARKET_OFFER.BOOK]: attrs[MARKET_ATTR.book] === "true",
    [MARKET_OFFER.RENT]: attrs[MARKET_ATTR.rent] === "true",
    [MARKET_OFFER.SELL]: attrs[MARKET_ATTR.sell] === "true",
  };
}

export function parseRobotClass(attrs: Record<string, string>): RobotClass | null {
  const raw = attrs[ROBOT_ATTR.CLASS];
  return raw && isRobotClass(raw) ? raw : null;
}

const MarketBody = z.object({
  book: z.boolean().optional(),
  rent: z.boolean().optional(),
  sell: z.boolean().optional(),
});

export const CreateRobotBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  class: z.enum(ROBOT_CLASSES),
  description: z.string().trim().optional(),
  make: z.string().trim().optional(),
  model: z.string().trim().optional(),
  market: MarketBody.optional(),
});

export type CreateRobotInput = z.infer<typeof CreateRobotBody>;

export const PatchRobotBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    description: z.string().optional(),
    class: z.enum(ROBOT_CLASSES).optional(),
    make: z.string().trim().nullable().optional(),
    model: z.string().trim().nullable().optional(),
    market: MarketBody.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
