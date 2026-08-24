// Formatters that each fixed a real "the UI printed raw data at me" bug.
// Both had grown ad-hoc copies in components before being centralised.
import assert from "node:assert/strict";
import { formatBtc } from "../../src/lib/format";
import { humanizeAttrKey } from "../../src/config/project-attrs";

// THE regression pin: trimming every trailing zero off "0.00000000" leaves an
// empty string, so the project profile printed a bare `0` under a "Confirmed
// on OrangeCat" headline.
assert.equal(formatBtc(0), "0");
assert.equal(formatBtc(1.5), "1.5");
assert.equal(formatBtc(0.0021), "0.0021");
assert.equal(formatBtc(0.00000001), "0.00000001");
// Below one satoshi must not round down into a confident zero.
assert.equal(formatBtc(0.000000001), "<0.00000001");
assert.equal(formatBtc(Number.NaN), "—");

// Raw snake_case keys were rendered as labels ("production url", "gtm").
assert.equal(humanizeAttrKey("production_url"), "Production URL");
assert.equal(humanizeAttrKey("gtm"), "GTM");
assert.equal(humanizeAttrKey("next_step"), "Next step");
assert.equal(humanizeAttrKey("orangecat_profile"), "OrangeCat profile");
assert.equal(humanizeAttrKey("github"), "GitHub");
// Unknown keys still degrade to sentence case rather than shouting or mush.
assert.equal(humanizeAttrKey("some_new_field"), "Some new field");
assert.equal(humanizeAttrKey(""), "");

console.log("✓ display formatter tests passed");
