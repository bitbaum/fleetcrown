// A build handoff from OrangeCat used to create a FleetCrown project with a
// name and a description and nothing else. These pin what the token now
// states outright — who the client is, where the page lives, what comes next —
// and that a token from an older OrangeCat (no `owner`) still works.
import assert from "node:assert/strict";
import {
  describeClient,
  handoffAttributes,
  type OrangeCatBuildIntent,
} from "../../src/lib/integrations/orangecat-build-intent";

const base: OrangeCatBuildIntent = {
  iss: "orangecat",
  aud: "fleetcrown",
  sub: "actor",
  jti: "j",
  iat: 0,
  exp: 600,
  entity: {
    type: "project",
    id: "e1",
    title: "Annushka's network",
    description:
      "People say who they are and what they do, so Annushka can connect the right ones.",
    publicUrl: "https://www.orangecat.ch/projects/e1",
  },
  suggestedHandoff: ["Turn the public entity into a concrete build brief."],
};

{
  const attrs = handoffAttributes(base);
  assert.equal(attrs.url, "https://www.orangecat.ch/projects/e1");
  assert.ok(attrs.next_step.includes("new-site.sh"), "next step names the scaffold");
  assert.equal(attrs.owner, undefined, "no owner claimed when the token carries none");
  assert.deepEqual(describeClient(base), [], "older tokens produce no client block");
}

{
  const unclaimed: OrangeCatBuildIntent = {
    ...base,
    owner: {
      kind: "unclaimed",
      displayName: "Annushka",
      pageUrl: "https://www.orangecat.ch/profiles/annushka",
      stewardUsername: "catomean",
    },
  };
  const attrs = handoffAttributes(unclaimed);
  assert.ok(
    attrs.owner.startsWith("Annushka (client; page not yet claimed, steward @catomean)"),
    attrs.owner,
  );
  assert.ok(attrs.customers.includes("feedback widget"), "the client steers through the widget");
  const client = describeClient(unclaimed);
  assert.equal(client.length, 3);
  assert.ok(
    client[0].startsWith("Client: Annushka (https://www.orangecat.ch/profiles/annushka)"),
    client[0],
  );
  assert.ok(client[1].includes("@catomean"), client[1]);
}

{
  const owned: OrangeCatBuildIntent = {
    ...base,
    owner: { kind: "user", displayName: "Cato", pageUrl: null, stewardUsername: null },
  };
  assert.deepEqual(describeClient(owned), ["Client: Cato."]);
  assert.equal(handoffAttributes(owned).owner, "Cato");
}

console.log("orangecat-handoff-profile: ok");
