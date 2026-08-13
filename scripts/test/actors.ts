import assert from "node:assert/strict";
import { ENTITY_TYPE } from "../../src/lib/constants/statuses";
import {
  ACTORS,
  ACTOR_CAPABILITY,
  ACTOR_KIND,
  MARKET_ATTR,
  MARKET_OFFERS,
  ROBOT_ATTR,
  ROBOT_CLASS,
  ROBOT_CLASSES,
  ActorCapabilityError,
  assertAttrAllowed,
  assertCanMarket,
  can,
  canCheckIn,
  canImportSocial,
  canMarket,
  canReach,
  isActorCapabilityError,
  isActorType,
  isMarketAttrKey,
  isRobotAttrKey,
  isRobotClass,
  parseMarketFlags,
  parseRobotClass,
} from "../../src/config/actors";
import { CreateRobotBody, PatchRobotBody } from "../../src/config/actors";

assert.equal(ACTORS[ENTITY_TYPE.PERSON].kind, ACTOR_KIND.HUMAN);
assert.equal(ACTORS[ENTITY_TYPE.ROBOT].kind, ACTOR_KIND.ROBOT);

assert.equal(canMarket(ENTITY_TYPE.PERSON), false, "people are never listable");
assert.equal(canMarket(ENTITY_TYPE.ROBOT), true, "robots are listable");
assert.equal(canCheckIn(ENTITY_TYPE.PERSON), true);
assert.equal(canCheckIn(ENTITY_TYPE.ROBOT), false, "vacuums do not get a check-in");
assert.equal(canReach(ENTITY_TYPE.PERSON), true);
assert.equal(canReach(ENTITY_TYPE.ROBOT), false, "do not WhatsApp a Roomba");
assert.equal(canImportSocial(ENTITY_TYPE.PERSON), true);
assert.equal(canImportSocial(ENTITY_TYPE.ROBOT), false);

assert.equal(can(ENTITY_TYPE.PROJECT, ACTOR_CAPABILITY.MARKET), false);
assert.equal(isActorType(ENTITY_TYPE.PERSON), true);
assert.equal(isActorType(ENTITY_TYPE.ROBOT), true);
assert.equal(isActorType(ENTITY_TYPE.PROJECT), false);

assert.deepEqual(
  [...ACTORS[ENTITY_TYPE.ROBOT].marketOffers],
  [...MARKET_OFFERS],
  "robot market offers are book / rent / sell — one list",
);
assert.deepEqual(ACTORS[ENTITY_TYPE.PERSON].marketOffers, [], "people have no market offers");

assert.throws(() => assertCanMarket(ENTITY_TYPE.PERSON), ActorCapabilityError);
assert.doesNotThrow(() => assertCanMarket(ENTITY_TYPE.ROBOT));

try {
  assertCanMarket(ENTITY_TYPE.PERSON);
  assert.fail("person market must throw");
} catch (e) {
  assert.equal(isActorCapabilityError(e), true);
  assert.match((e as Error).message, /cannot be listed, booked, rented, or sold/);
}

assert.throws(
  () => assertAttrAllowed(ENTITY_TYPE.PERSON, MARKET_ATTR.book),
  ActorCapabilityError,
  "a people attrs write cannot smuggle market:book",
);
assert.throws(
  () => assertAttrAllowed(ENTITY_TYPE.PERSON, ROBOT_ATTR.CLASS),
  /Robot attributes belong on robot profiles/,
);
assert.doesNotThrow(() => assertAttrAllowed(ENTITY_TYPE.ROBOT, MARKET_ATTR.rent));
assert.doesNotThrow(() => assertAttrAllowed(ENTITY_TYPE.ROBOT, ROBOT_ATTR.CLASS));
assert.doesNotThrow(() => assertAttrAllowed(ENTITY_TYPE.PERSON, "channel:whatsapp"));

assert.equal(isMarketAttrKey(MARKET_ATTR.sell), true);
assert.equal(isMarketAttrKey("profession"), false);
assert.equal(isRobotAttrKey(ROBOT_ATTR.MAKE), true);
assert.equal(isRobotClass(ROBOT_CLASS.VACUUM), true);
assert.equal(isRobotClass(ROBOT_CLASS.HUMANOID), true);
assert.equal(isRobotClass("toaster"), false);
assert.ok(ROBOT_CLASSES.includes(ROBOT_CLASS.VACUUM), "vacuum is a first-class robot class");

const flags = parseMarketFlags({
  [MARKET_ATTR.book]: "true",
  [MARKET_ATTR.rent]: "false",
});
assert.deepEqual(flags, { book: true, rent: false, sell: false });
assert.equal(parseRobotClass({ [ROBOT_ATTR.CLASS]: ROBOT_CLASS.VACUUM }), ROBOT_CLASS.VACUUM);
assert.equal(parseRobotClass({ [ROBOT_ATTR.CLASS]: "toaster" }), null);

const vacuum = CreateRobotBody.parse({
  name: "Kitchen Roomba",
  class: ROBOT_CLASS.VACUUM,
  make: "iRobot",
  model: "j7+",
  market: { rent: true },
});
assert.equal(vacuum.class, "vacuum");
assert.equal(vacuum.market?.rent, true);

assert.throws(() => CreateRobotBody.parse({ name: "Bob" }));
assert.throws(() => CreateRobotBody.parse({ name: "Bob", class: "person" }));

const patched = PatchRobotBody.parse({ market: { sell: true, book: false } });
assert.deepEqual(patched.market, { sell: true, book: false });

console.log("✓ actors SSOT — people unlistable, robots marketable, vacuum is a class");
