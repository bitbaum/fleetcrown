import assert from "node:assert/strict";
import { lastTalkLabel, reachChannels, whatsappHref } from "../../src/lib/people-reach";
import { ACTION_COPY } from "../../src/config/action-copy";

assert.deepEqual(reachChannels({}), []);
assert.deepEqual(reachChannels({ "channel:email": "derek@x.test", profession: "builder" }), [
  { label: "Email", value: "derek@x.test" },
]);
assert.equal(reachChannels({ "channel:phone": "e164:+41790000000" })[0]?.value, "+41790000000");

assert.equal(lastTalkLabel(null), ACTION_COPY.checkin.never);
assert.match(ACTION_COPY.checkin.groupWhy, /does not message/i);
assert.match(ACTION_COPY.checkin.remindedAll(3), /3 reminders/);
assert.match(ACTION_COPY.dispatch.sent("fleetcrown"), /fleetcrown/);

assert.equal(
  whatsappHref("+41 78 659 86 13", "Hi Manu"),
  "https://wa.me/41786598613?text=Hi%20Manu",
);

console.log("✓ people-reach / action-copy tests passed");
