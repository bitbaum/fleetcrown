import assert from "node:assert/strict";
import { ACTION_TYPE, ENTITY_TYPE } from "../../src/lib/constants/statuses";
import {
  BOOK_ACTION_TYPES,
  BOOK_ATTR,
  IMPORT_SOURCE,
  enrichDraftTitle,
  importDraftTitle,
  isBookActionType,
  mergeDraftTitle,
} from "../../src/config/book";
import { canImportSocial, canMarket, DEFAULT_VACUUMS, ROBOT_CLASS, ROBOT_CLASS_TO_OC_ASSET } from "../../src/config/actors";
import { clusterPeople, extractEmails, extractPhones, matchImportedContact, normalizeName, phonesCompatible, pickCanonicalPerson, shouldPreferImportedName } from "../../src/lib/people-dedupe";
import { parseKnowledgePeople } from "../../src/lib/people-import";
import { ENRICH_SCAN_CAP } from "../../src/config/book";
import { isUniqueViolation } from "../../src/lib/api/route-helpers";
import { detectImportSource, parseCsv, parseImport, parseVCard, parseContactResolver } from "../../src/lib/people-import";
import { proposeEnrichments } from "../../src/lib/people-enrich";

assert.equal(isBookActionType(ACTION_TYPE.IMPORT_PERSON), true);
assert.equal(isBookActionType(ACTION_TYPE.SEND_MESSAGE), false);
assert.ok(BOOK_ACTION_TYPES.includes(ACTION_TYPE.MERGE_PEOPLE));
assert.equal(canImportSocial(ENTITY_TYPE.PERSON), true);
assert.equal(canImportSocial(ENTITY_TYPE.ROBOT), false);
assert.equal(canMarket(ENTITY_TYPE.PERSON), false);

assert.equal(normalizeName("José  García"), "jose garcia");
assert.deepEqual(extractEmails("write me at Mao@OrangeCat.ch please"), ["mao@orangecat.ch"]);
assert.deepEqual(extractPhones("WhatsApp +41 79 123 45 67"), ["41791234567"]);

const clusters = clusterPeople([
  { id: "1", name: "Jane Smith", attrs: { "channel:email": "jane@x.com" } },
  { id: "2", name: "Jane Smith", attrs: {} },
  { id: "3", name: "Jane S.", attrs: { "channel:email": "jane@x.com" } },
  { id: "4", name: "Other", attrs: {} },
]);
assert.ok(clusters.some((c) => c.reason === "email" && c.members.length === 2));
assert.ok(clusters.some((c) => c.reason === "name" && c.members.map((m) => m.id).includes("1")));

const emailMatch = matchImportedContact(
  { name: "J. Smith", attrs: { "channel:email": "jane@x.com" } },
  clusters.flatMap((c) => c.members),
);
assert.ok(emailMatch && emailMatch.attrs["channel:email"] === "jane@x.com");

const richer = pickCanonicalPerson([
  { id: "thin", name: "Jane", attrs: {} },
  { id: "rich", name: "Jane Smith", attrs: { "channel:email": "jane@x.com", profession: "dev" } },
]);
assert.equal(richer.id, "rich");
assert.ok(ENRICH_SCAN_CAP <= 50);
assert.equal(isUniqueViolation({ code: "23505" }), true);
assert.equal(isUniqueViolation({ cause: { code: "23505" } }), true);
assert.equal(isUniqueViolation(new Error("nope")), false);

const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Ada Lovelace
EMAIL:ada@analytical.engine
TEL:+44 20 1234
ORG:Analytical Engines
END:VCARD`;
const vcards = parseVCard(vcf);
assert.equal(vcards.length, 1);
assert.equal(vcards[0]!.name, "Ada Lovelace");
assert.equal(vcards[0]!.attrs[BOOK_ATTR.EMAIL], "ada@analytical.engine");
assert.equal(vcards[0]!.attrs[BOOK_ATTR.COMPANY], "Analytical Engines");

const csv = parseCsv("Name,Email\nManuel,manu@example.com\n");
assert.equal(csv[0]!.name, "Manuel");
assert.equal(csv[0]!.attrs[BOOK_ATTR.EMAIL], "manu@example.com");

const google = parseCsv([
  "First Name,Last Name,Nickname,E-mail 1 - Value,Phone 1 - Value,Organization Name,Organization Title,Notes,Address 1 - City,Address 1 - Country,Extra",
  "Ada,Lovelace,A.L.,ada@analytical.engine,+44201234,Analytical Engines,Mathematician,Notes here,London,UK,x",
].join("\n"));
assert.equal(google[0]!.name, "Ada Lovelace");
assert.equal(google[0]!.attrs[BOOK_ATTR.EMAIL], "ada@analytical.engine");
assert.equal(google[0]!.attrs[BOOK_ATTR.COMPANY], "Analytical Engines");
assert.equal(google[0]!.attrs[BOOK_ATTR.PROFESSION], "Mathematician");
assert.equal(google[0]!.attrs[BOOK_ATTR.LOCATION], "London, UK");
assert.ok(google[0]!.attrs[BOOK_ATTR.ALIASES]?.includes("A.L."));
assert.equal(google[0]!.description, "Notes here");

assert.equal(
  matchImportedContact(
    { name: "George", attrs: {} },
    [{ id: "g", name: "George", attrs: {} }],
  ),
  null,
);
assert.equal(
  matchImportedContact(
    { name: "Elena Weber", attrs: {} },
    [{ id: "e", name: "Elena Weber", attrs: {} }],
  )?.id,
  "e",
);
assert.equal(shouldPreferImportedName("Aaron", "Aaron Brooks"), true);
assert.equal(shouldPreferImportedName("Aaron Brooks", "Aaron"), false);
assert.equal(shouldPreferImportedName("Manu", "Manuel Riegner"), false);
assert.equal(phonesCompatible("41783226939", "0783226939"), true);
assert.equal(phonesCompatible("41783226939", "41783226939"), true);
assert.equal(phonesCompatible("41783226939", "12025550123"), false);

const phoneMatch = matchImportedContact(
  { name: "George", attrs: { "channel:phone": "078 322 69 39" } },
  [{ id: "g", name: "George", attrs: { "channel:whatsapp": "e164:+41783226939" } }],
);
assert.equal(phoneMatch?.id, "g");

const knowledge = parseKnowledgePeople([
  { name: "Manuel Riegner", attrs: { profession: "psychiatrist", relationship_to_george: "friend" } },
]);
assert.equal(knowledge[0]!.attrs[BOOK_ATTR.PROFESSION], "psychiatrist");
assert.equal(knowledge[0]!.attrs[BOOK_ATTR.RELATIONSHIP], "friend");

const resolver = parseContactResolver(JSON.stringify({
  contacts: [{
    id: "c1",
    displayName: "Ilya",
    aliases: ["Ilja"],
    channels: { whatsapp: { e164: "+4179" } },
  }],
}));
assert.equal(resolver[0]!.name, "Ilya");
assert.ok(resolver[0]!.attrs[BOOK_ATTR.ALIASES]?.includes("Ilja"));

assert.equal(detectImportSource("book.vcf", vcf), IMPORT_SOURCE.VCARD);
assert.equal(detectImportSource("contact-resolver.json", '{"contacts":[]}'), IMPORT_SOURCE.CONTACT_RESOLVER);
assert.equal(parseImport("Name\nOnlyName\n", IMPORT_SOURCE.CSV)[0]!.name, "OnlyName");

const enrich = proposeEnrichments({
  name: "Ada",
  description: "Reach ada@analytical.engine",
  attrs: {},
});
assert.ok(enrich.some((p) => p.key === BOOK_ATTR.EMAIL && p.value === "ada@analytical.engine"));
assert.ok(enrich.some((p) => p.key === BOOK_ATTR.COMPANY && p.value === "Analytical"));

assert.equal(importDraftTitle("Ada"), "Import: Ada");
assert.match(enrichDraftTitle("Ada", BOOK_ATTR.EMAIL), /Email/);
assert.match(mergeDraftTitle("Ada", "A. L."), /Ada/);

assert.equal(DEFAULT_VACUUMS.length, 2);
assert.ok(DEFAULT_VACUUMS.every((v) => v.class === ROBOT_CLASS.VACUUM));
assert.equal(ROBOT_CLASS_TO_OC_ASSET[ROBOT_CLASS.VACUUM], "robot");
assert.equal(ROBOT_CLASS_TO_OC_ASSET[ROBOT_CLASS.DRONE], "drone");

console.log("✓ people book — import, enrich, dedupe, vacuums stay robots");
