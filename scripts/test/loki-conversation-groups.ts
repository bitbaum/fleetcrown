import assert from "node:assert/strict";
import {
  conversationGroupKey,
  groupConversations,
  LOKI_HISTORY_VISIBLE,
  normalizeConversationTitle,
  visibleConversationGroups,
} from "../../src/lib/loki/conversation-groups";

function row(id: string, title: string, projectKeys: string[] = ["fleetcrown"]) {
  return { id, title, projectKeys };
}

assert.equal(normalizeConversationTitle("move forward on fleetcrown"), "move-forward");
assert.equal(normalizeConversationTitle("Move forward"), "move-forward");
assert.equal(
  normalizeConversationTitle("Move HamsterCheek toward its active goal: Integrate all feat…"),
  "move-forward",
);
assert.equal(normalizeConversationTitle("code review for kivvi"), "code-review");
assert.equal(normalizeConversationTitle("Website for restaurants"), "website for restaurants");

assert.equal(
  conversationGroupKey(row("1", "move forward on fleetcrown", ["fleetcrown"])),
  conversationGroupKey(row("2", "Move forward", ["FleetCrown"])),
);
assert.notEqual(
  conversationGroupKey(row("1", "move forward on fleetcrown", ["fleetcrown"])),
  conversationGroupKey(row("2", "move forward on fleetcrown", ["datacat"])),
);

const mixed = [
  row("a", "move forward on fleetcrown"),
  row("b", "move forward on fleetcrown"),
  row("c", "Website for restaurants", []),
  row("d", "Move fleetcrown toward its active goal: ship"),
  row("e", "code review for kivvi", ["kivvi"]),
];
const groups = groupConversations(mixed);
assert.equal(groups.length, 3, "same verb+project collapse; other titles stay");
const forward = groups.find((g) => g.head.id === "a");
assert.ok(forward);
assert.equal(forward!.count, 3);
assert.equal(groups.find((g) => g.head.id === "c")?.count, 1);
assert.equal(groups.find((g) => g.head.id === "e")?.count, 1);

const withActive = groupConversations(mixed, "d");
assert.equal(
  withActive.find((g) => g.count === 3)?.head.id,
  "d",
  "active thread becomes the group head",
);

const many = Array.from({ length: 20 }, (_, i) => row(String(i), `unique ${i}`, []));
const capped = visibleConversationGroups(groupConversations(many));
assert.equal(capped.visible.length, LOKI_HISTORY_VISIBLE);
assert.equal(capped.hidden, 20 - LOKI_HISTORY_VISIBLE);

const short = visibleConversationGroups(groupConversations(mixed));
assert.equal(short.hidden, 0);
assert.equal(short.visible.length, 3);

console.log("✓ loki-conversation-groups tests passed");
