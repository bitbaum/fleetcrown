// Visitor-authored text must never reach an email body as markup.
//
// The widget accepts free prose from anonymous visitors on customer sites.
// feedbackShippedTemplate mails that prose back to an address the same visitor
// supplied, from our domain — so an unescaped `excerpt` is an injection path
// into mail that carries our From:. It shipped unescaped while the template
// four lines below it escaped correctly, which is exactly the shape a shared
// helper prevents: the escaping was a thing each template had to remember.
//
// `page` is equally untrusted — it is location.pathname read off the host page.
//
// This pins the invariant rather than the implementation: render a template
// with hostile input and assert no live markup survives.
// Run: npx tsx scripts/test/email-escaping.ts
import { escapeHtml, escapeHtmlWithBreaks } from "../../src/lib/escape-html";
import { feedbackShippedTemplate, operatorMailTemplate } from "../../src/lib/email";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

// ---- the helper itself ----
ok(escapeHtml("<script>") === "&lt;script&gt;", "escapes angle brackets");
ok(escapeHtml("a & b") === "a &amp; b", "escapes ampersand");
ok(escapeHtml(`"quoted"`) === "&quot;quoted&quot;", "escapes double quote (attribute safety)");
ok(escapeHtml("it's") === "it&#39;s", "escapes single quote (attribute safety)");
ok(
  escapeHtml("&lt;") === "&amp;lt;",
  "ampersand is escaped first, so an existing entity is not double-decoded",
);
ok(escapeHtmlWithBreaks("a\nb") === "a<br>b", "escapeHtmlWithBreaks turns newlines into <br>");
ok(
  escapeHtmlWithBreaks("<br>") === "&lt;br&gt;",
  "a literal <br> typed by a human stays visible text, not markup",
);

// ---- feedbackShippedTemplate: the route that shipped unescaped ----
const XSS = `<img src=x onerror="alert(1)">`;
const shipped = feedbackShippedTemplate({
  site: "example.com",
  excerpt: XSS,
  page: `/p?<svg onload="alert(2)">`,
});

ok(!shipped.html.includes("<img src=x"), "excerpt: no live <img> tag in html");
ok(!shipped.html.includes('onerror="'), "excerpt: no live onerror attribute in html");
ok(shipped.html.includes("&lt;img"), "excerpt: the tag is present as escaped text");
ok(!shipped.html.includes("<svg onload"), "page: no live <svg> tag in html");
ok(shipped.html.includes("&lt;svg"), "page: the tag is present as escaped text");

// The text/plain alternative is not markup and deliberately keeps raw values —
// pin that too, so a future "escape everything" change does not corrupt it.
ok(shipped.text.includes(XSS), "text/plain alternative keeps the raw excerpt");

// ---- operatorMailTemplate: was already correct, keep it that way ----
const op = operatorMailTemplate({ subject: "hi", body: `<b>bold</b>\nsecond line` });
ok(!op.html.includes("<b>bold</b>"), "operator body: no live <b> tag");
ok(op.html.includes("&lt;b&gt;bold&lt;/b&gt;"), "operator body: tag escaped as text");
ok(op.html.includes("second line"), "operator body: newline preserved as a break");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
