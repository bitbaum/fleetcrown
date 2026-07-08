import assert from "node:assert/strict";
import { isResourceVisibleInShare } from "../../src/lib/project-share-visibility";
import type { ProjectResource } from "../../src/db/schema/user-projects";

function resource(partial: Partial<ProjectResource>): ProjectResource {
  return {
    id: "r",
    kind: "doc",
    title: "Spec",
    createdAt: new Date(0).toISOString(),
    ...partial,
  };
}

assert.equal(isResourceVisibleInShare(resource({ visibility: "private" }), "advisor"), false);
assert.equal(isResourceVisibleInShare(resource({ visibility: "team" }), "advisor"), true);
assert.equal(isResourceVisibleInShare(resource({ visibility: "team" }), "public"), false);
assert.equal(isResourceVisibleInShare(resource({ visibility: "public" }), "public"), true);
assert.equal(isResourceVisibleInShare(resource({ visibility: "public", sensitivity: "secret" }), "advisor"), false);
assert.equal(isResourceVisibleInShare(resource({ visibility: "public", kind: "credential" }), "public"), false);
assert.equal(isResourceVisibleInShare(resource({ visibility: "public", kind: "environment" }), "team"), false);

console.log("✓ project-share-visibility tests passed");
