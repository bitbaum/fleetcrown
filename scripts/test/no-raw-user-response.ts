// A users row must never reach a response body unprojected.
//
// This has now happened twice: GET/PATCH /api/me (#306) and POST /api/onboarding
// — both shipped passwordHash and privateZonePinHash to the browser, and the
// second one survived the grep that found the first only because it was nested
// one level deeper (`json({ ok: true, user })` instead of `json(user)`). So this
// stops being a thing anyone greps for and becomes a check.
//
// The rule: if a route reads a whole users row, the identifier holding it may
// not appear as a *value* inside a response call. Reading fields off it
// (`user.username`) is fine — that is a deliberate choice per field. Passing the
// object is not, because it carries every column the schema grows later.
//
// Scope, stated rather than implied: this reads API route handlers and server
// actions. It does not model RSC props (a server component handing a whole row
// to a client component serializes it into the flight payload just the same) —
// that needs a different check, and until it exists this file is not a proof
// that no user row reaches a browser, only that no route hands one over.
//
// Run: npx tsx scripts/test/no-raw-user-response.ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Query helpers that hand back an entire users row. */
const FULL_ROW_SOURCES = [
  "getUserById",
  "getUserByUsername",
  "getUserByEmail",
  "getDefaultUser",
  "getUserByStripeCustomerId",
  "getUserByOrangeCatActorId",
  "createUser",
  "createInitialUser",
  "updateUser",
  "updateUserBilling",
  "healReturningUserOnboarding",
];

/** The only sanctioned ways to turn a users row into a response value. */
const PROJECTORS = ["toClientUser", "toExportUser"];

/** Calls whose arguments are serialized to the client. */
const RESPONSE_SINKS = ["NextResponse.json", "Response.json", "jsonOk"];

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * Blank out comments and string/template contents so brace- and paren-matching
 * cannot be thrown off by punctuation inside them. Length is preserved so
 * reported offsets still line up with the original source.
 */
function stripLiterals(src: string): string {
  const out = src.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/** Given the index of a "(", return the index just past its match. */
function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/** Every `name(...)` call site, as [start, endExclusive] over the arguments. */
function callArgRanges(src: string, name: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const needle = new RegExp(`(?<![\\w.$])${name.replace(".", "\\.")}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = needle.exec(src))) {
    const open = src.indexOf("(", m.index);
    const close = matchParen(src, open);
    ranges.push([open + 1, close - 1]);
    needle.lastIndex = close;
  }
  return ranges;
}

/** Identifiers bound to a whole users row. */
function taintedIdentifiers(src: string): Set<string> {
  const tainted = new Set<string>();
  const sources = FULL_ROW_SOURCES.join("|");
  // const/let x = await getUserById(...)  |  x = await healReturningUser(...)
  const assign = new RegExp(
    `(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+(?:${sources})\\s*\\(`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = assign.exec(src))) tainted.add(m[1]);

  // const [x] = await db.select().from(users)... and db.query.users.findFirst
  // without a `columns:` projection.
  const drizzle = new RegExp(
    `(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+db[\\s\\S]{0,200}?\\.from\\(users\\)`,
    "g",
  );
  while ((m = drizzle.exec(src))) tainted.add(m[1]);

  const rq = new RegExp(
    `(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+db\\.query\\.users\\.find\\w*\\(([\\s\\S]{0,300}?)\\)\\s*[;\\n]`,
    "g",
  );
  while ((m = rq.exec(src))) {
    if (!m[2].includes("columns:")) tainted.add(m[1]);
  }
  return tainted;
}

/** Remove sanctioned `toClientUser(x)` / `toExportUser(x)` expressions. */
function dropProjectedCalls(args: string): string {
  let text = args;
  for (const p of PROJECTORS) {
    for (const [s, e] of callArgRanges(text, p).reverse()) {
      // Blank the whole call, name included, keeping offsets stable.
      const start = text.lastIndexOf(p, s);
      text = text.slice(0, start) + " ".repeat(e + 1 - start) + text.slice(e + 1);
    }
  }
  return text;
}

export function findRawUserResponses(source: string): string[] {
  const src = stripLiterals(source);
  const tainted = taintedIdentifiers(src);
  if (tainted.size === 0) return [];

  const problems: string[] = [];
  for (const sink of RESPONSE_SINKS) {
    for (const [start, end] of callArgRanges(src, sink)) {
      // `...user` is a bare use, but the dots read as a property access to the
      // lookbehind below — flatten spreads to whitespace before testing.
      const args = dropProjectedCalls(src.slice(start, end)).replace(/\.\.\./g, "   ");
      for (const name of tainted) {
        // A bare value: a whole identifier (not the prefix of a longer one such
        // as `username`), and not a property access, object key, call or target.
        const bare = new RegExp(`(?<![\\w.$])${name}(?![\\w$])(?!\\s*[.\\[:(=])`);
        if (bare.test(args)) {
          const line = source.slice(0, start).split("\n").length;
          problems.push(
            `line ${line}: \`${name}\` is a whole users row and is passed into ${sink}(...) — ` +
              `wrap it in ${PROJECTORS.join(" / ")} (src/lib/user-client-view.ts)`,
          );
        }
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

// --- the shape that shipped (#306): the row returned directly
ok(
  findRawUserResponses(`
    const user = await getUserById(userId);
    return NextResponse.json(user);
  `).length === 1,
  "catches json(user)",
);

// --- the shape that survived the grep: nested one level deeper
ok(
  findRawUserResponses(`
    const updated = await updateUser(userId, { onboardedAt: new Date() });
    return NextResponse.json({ ok: true, user: updated });
  `).length === 1,
  "catches json({ ok: true, user: updated }) — the nested form",
);

// --- shorthand property is the same leak
ok(
  findRawUserResponses(`
    const user = await getUserById(userId);
    return NextResponse.json({ ok: true, user });
  `).length === 1,
  "catches shorthand { user }",
);

// --- spread is the same leak
ok(
  findRawUserResponses(`
    const user = await getUserById(userId);
    return jsonOk({ ...user, extra: 1 });
  `).length === 1,
  "catches spread into jsonOk",
);

// --- projected is fine
ok(
  findRawUserResponses(`
    const user = await getUserById(userId);
    return NextResponse.json(toClientUser(user));
  `).length === 0,
  "allows toClientUser(user)",
);
ok(
  findRawUserResponses(`
    const updated = await updateUser(userId, {});
    return NextResponse.json({ ok: true, user: toClientUser(updated) });
  `).length === 0,
  "allows nested toClientUser(updated)",
);
ok(
  findRawUserResponses(`
    const rows = await db.select().from(users).where(eq(users.id, userId));
    return NextResponse.json({ user: rows.map(toExportUser) });
  `).length === 0,
  "allows rows.map(toExportUser)",
);

// --- reading fields is a per-field decision, not a leak
ok(
  findRawUserResponses(`
    const user = await getUserById(userId);
    return NextResponse.json({ username: user.username, name: user.name });
  `).length === 0,
  "allows field reads off the row",
);

// --- a projected drizzle read is not tainted at all
ok(
  findRawUserResponses(`
    const row = await db.query.users.findFirst({ where: eq(users.id, id), columns: { passwordHash: true } });
    return NextResponse.json({ row });
  `).length === 0,
  "a columns:-projected findFirst is not a whole row",
);

// --- an unprojected findFirst is
ok(
  findRawUserResponses(`
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    return NextResponse.json({ row });
  `).length === 1,
  "an unprojected findFirst is a whole row",
);

// --- the string/comment stripper must not create or hide findings
ok(
  findRawUserResponses(`
    // return NextResponse.json(user);
    const user = await getUserById(userId);
    return NextResponse.json({ label: "json(user) )))", id: user.id });
  `).length === 0,
  "commented-out and quoted occurrences are ignored",
);

// --- reassignment taints too (the onboarding heal step)
ok(
  findRawUserResponses(`
    let user = await getUserById(userId);
    user = await healReturningUserOnboarding(user);
    return NextResponse.json({ ok: true, user });
  `).length === 1,
  "reassignment through a heal helper stays tainted",
);

// ---------------------------------------------------------------------------
// The repository itself
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts" || entry === "actions.ts") out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, "src", "app"));
ok(files.length > 0, "found route handlers to scan");

let scanned = 0;
const violations: string[] = [];
for (const file of files) {
  const found = findRawUserResponses(readFileSync(file, "utf8"));
  scanned++;
  for (const problem of found) violations.push(`${relative(ROOT, file)} ${problem}`);
}
ok(violations.length === 0, `no route hands a whole users row to the client`);
for (const v of violations) console.error(`    ${v}`);

if (fail > 0) {
  console.error(`no-raw-user-response: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`no-raw-user-response: ${pass} checks passed (${scanned} route/action files scanned)`);
