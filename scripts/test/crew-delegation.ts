/**
 * Inline tests for the crew delegation rules (config/crew.ts + config/actors.ts).
 *
 * Why this is worth testing: the whole feature rests on an asymmetry that is
 * invisible at a glance — the operator hands work out and accepts it back, but
 * only the person asked can say yes, say no, or claim it is done. If an
 * operator-side move ever gains `accepted`, FleetCrown starts recording consent
 * nobody gave, and it does so silently, on a board that looks correct. The same
 * goes the other way: an assignee move that could reach `done` would let the
 * person asked sign off their own work.
 *
 * The second half guards the actor kernel: a crew flag on a robot, or a listing
 * flag on a person, are both "a person became inventory" bugs. They are cheap
 * to prevent here and expensive to notice in production.
 *
 * Pure — no DB, no network. Run: npx tsx scripts/test/crew-delegation.ts
 */
import {
  ASSIGNEE_ACTION,
  ASSIGNEE_ACTION_STATUS,
  CLOSED_HUMAN_TASK_STATUSES,
  HUMAN_TASK_STATUS,
  HUMAN_TASK_STATUS_LABEL,
  HUMAN_TASK_STATUS_ORDER,
  OPEN_HUMAN_TASK_STATUSES,
  assigneeActionsFor,
  canAssigneeMove,
  canOperatorMove,
  canShare,
  formatFee,
  isWaitingOnAssignee,
  isWaitingOnOperator,
  taskSharePath,
  type HumanTaskStatus,
} from "@/config/crew";
import {
  ACTOR_CAPABILITY,
  CREW_ATTR,
  MARKET_ATTR,
  assertAttrAllowed,
  canDelegate,
  isActorCapabilityError,
} from "@/config/actors";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const ok = (condition: boolean, message: string) => {
  assert(condition, message);
  passed += 1;
};

const ALL_STATUSES = Object.values(HUMAN_TASK_STATUS) as HumanTaskStatus[];

// ─── The asymmetry: who may move what ────────────────────────────────────────

// The operator asks. They never answer on the other person's behalf.
for (const from of ALL_STATUSES) {
  ok(
    !canOperatorMove(from, HUMAN_TASK_STATUS.ACCEPTED) || from === HUMAN_TASK_STATUS.DELIVERED,
    `operator must not record consent: ${from} → accepted`,
  );
  ok(
    !canOperatorMove(from, HUMAN_TASK_STATUS.DECLINED),
    `operator must not decline on someone's behalf: ${from} → declined`,
  );
}
// The one exception above is deliberate: delivered → accepted is "not good
// enough yet, you are still on it", which is the operator revising THEIR
// judgement of the work, not asserting the person agreed to something.
ok(
  canOperatorMove(HUMAN_TASK_STATUS.DELIVERED, HUMAN_TASK_STATUS.ACCEPTED),
  "sending delivered work back must stay possible",
);

// The assignee answers. They never close the work off as accepted.
for (const from of ALL_STATUSES) {
  ok(!canAssigneeMove(from, HUMAN_TASK_STATUS.DONE), `assignee must not sign off their own work: ${from} → done`);
  ok(!canAssigneeMove(from, HUMAN_TASK_STATUS.CANCELLED), `assignee must not cancel the ask: ${from} → cancelled`);
  ok(!canAssigneeMove(from, HUMAN_TASK_STATUS.ASSIGNED), `assignee must not hand work to themselves: ${from} → assigned`);
}

// A draft has told nobody anything, so nobody can answer it.
ok(
  assigneeActionsFor(HUMAN_TASK_STATUS.DRAFT).length === 0,
  "a draft must offer the assignee nothing — it was never sent",
);
// Once asked, all three honest answers are on the table. Declining is not
// hidden behind acceptance: an ask you cannot refuse is an order.
const asked = assigneeActionsFor(HUMAN_TASK_STATUS.ASSIGNED);
ok(asked.includes(ASSIGNEE_ACTION.ACCEPT), "an asked person can say yes");
ok(asked.includes(ASSIGNEE_ACTION.DECLINE), "an asked person can say no");
ok(asked.includes(ASSIGNEE_ACTION.DELIVER), "an asked person can just do it");
// Having accepted, they can still back out — circumstances change, and a
// system that only allows yes-then-deliver produces silence instead of news.
ok(
  assigneeActionsFor(HUMAN_TASK_STATUS.ACCEPTED).includes(ASSIGNEE_ACTION.DECLINE),
  "someone who accepted can still tell you they cannot after all",
);
// Nothing to answer once it is closed or already delivered.
for (const status of [...CLOSED_HUMAN_TASK_STATUSES, HUMAN_TASK_STATUS.DELIVERED]) {
  ok(assigneeActionsFor(status).length === 0, `no actions once ${status}`);
}

// Every action maps to a status the assignee is actually allowed to reach.
for (const action of Object.values(ASSIGNEE_ACTION)) {
  const target = ASSIGNEE_ACTION_STATUS[action];
  ok(
    ALL_STATUSES.some((from) => canAssigneeMove(from, target)),
    `action ${action} maps to ${target}, which no assignee move reaches`,
  );
}

// ─── Board bookkeeping ───────────────────────────────────────────────────────

ok(
  OPEN_HUMAN_TASK_STATUSES.every((s) => !CLOSED_HUMAN_TASK_STATUSES.includes(s)),
  "a status cannot be both open and closed",
);
ok(
  OPEN_HUMAN_TASK_STATUSES.length + CLOSED_HUMAN_TASK_STATUSES.length === ALL_STATUSES.length,
  "every status must be classified open or closed — an unclassified one vanishes from the counts",
);
for (const status of ALL_STATUSES) {
  ok(HUMAN_TASK_STATUS_ORDER.includes(status), `${status} missing from the board order`);
  ok(Boolean(HUMAN_TASK_STATUS_LABEL[status]), `${status} has no label`);
  // Waiting-on is a partition of the open set: a row that is nobody's move is
  // a row that quietly rots.
  const open = OPEN_HUMAN_TASK_STATUSES.includes(status);
  ok(
    !open || isWaitingOnOperator(status) !== isWaitingOnAssignee(status),
    `${status} is open but is either nobody's move or both`,
  );
}

// ─── Handing over ────────────────────────────────────────────────────────────

ok(
  !canShare({ status: HUMAN_TASK_STATUS.DRAFT, assigneeId: null }),
  "an unassigned ask has nobody to hand it to",
);
ok(
  canShare({ status: HUMAN_TASK_STATUS.DRAFT, assigneeId: "id" }),
  "an assigned draft is exactly what handing over is for",
);
for (const status of CLOSED_HUMAN_TASK_STATUSES) {
  ok(!canShare({ status, assigneeId: "id" }), `a ${status} assignment has nothing left to ask`);
}
ok(taskSharePath("abc") === "/share/task/abc", "share path is the public route");

// Fees are displayed, never computed. No currency, no invented one.
ok(formatFee(null, "CHF") === "", "no fee renders as nothing at all");
ok(formatFee(400, "CHF") === "CHF 400", "whole amounts stay whole");
ok(formatFee(12.5, "EUR") === "EUR 12.50", "part amounts get two places");
ok(formatFee(400, null) === "400", "an amount without a currency is not dressed up as one");

// ─── The actor kernel: people are not inventory ──────────────────────────────

ok(canDelegate(ENTITY_TYPE.PERSON), "people can be asked to do work");
ok(!canDelegate(ENTITY_TYPE.ROBOT), "machines are dispatched, not asked");

function refuses(type: string, key: string, why: string) {
  let threw = false;
  try {
    assertAttrAllowed(type, key);
  } catch (e) {
    threw = isActorCapabilityError(e);
  }
  ok(threw, why);
}

refuses(ENTITY_TYPE.ROBOT, CREW_ATTR.MEMBER, "a robot must never join the crew roster");
refuses(ENTITY_TYPE.ROBOT, CREW_ATTR.RATE, "a robot must never carry a crew rate");
refuses(ENTITY_TYPE.PERSON, MARKET_ATTR.rent, "a person must never carry a listing flag");
refuses(ENTITY_TYPE.PERSON, MARKET_ATTR.sell, "a person must never be sellable");
// The allowed direction still works, or the guard has eaten the feature.
assertAttrAllowed(ENTITY_TYPE.PERSON, CREW_ATTR.ROLE);
assertAttrAllowed(ENTITY_TYPE.ROBOT, MARKET_ATTR.rent);
passed += 2;

ok(
  ACTOR_CAPABILITY.DELEGATE === "delegate",
  "capability name is persisted in nothing, but renaming it silently would break the guards above",
);

console.log(`✓ crew delegation rules — ${passed} assertions passed`);
