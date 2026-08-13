/** Verbs that introduce a person even when the name is typed in lowercase. */
const WRITE_VERBS = new Set(["write", "message", "text", "tell", "ask", "call", "email", "ping", "sms", "whatsapp"]);

/**
 * Pull likely person names out of a free-text message.
 * Pure — no DB — so lookup tests do not import the query layer.
 */
export function nameCandidates(message: string): string[] {
  const stop = new Set([
    "who", "what", "when", "where", "why", "how", "the", "and", "but", "for", "with",
    "my", "me", "i", "is", "are", "was", "in", "on", "at", "to", "of", "do", "does",
    "also", "please", "can", "you", "your", "contacts", "contact", "affiliation",
    "research", "linkedin", "etc", "about", "tell", "give", "find", "show", "reach",
    "out", "him", "her", "them", "his", "their", "a", "an", "it",
    "today", "tomorrow", "saturday", "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "this", "next", "week", "weekend",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (cand: string) => {
    const key = cand.toLowerCase();
    if (cand.length > 2 && !seen.has(key) && !stop.has(key)) {
      seen.add(key);
      out.push(cand);
    }
  };

  for (const sentence of message.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    let run: string[] = [];
    const flush = () => {
      if (run.length > 0) {
        add(run.join(" "));
        if (run.length > 1) for (const part of run) add(part);
      }
      run = [];
    };
    let expectName = false;
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (WRITE_VERBS.has(lower)) {
        flush();
        expectName = true;
        continue;
      }
      if (expectName) {
        if (lower === "to" || lower === "at") continue;
        if (!stop.has(lower) && lower.length > 2) add(tok);
        expectName = false;
      }
      const isName = /^\p{Lu}/u.test(tok) && !stop.has(lower);
      if (isName) run.push(tok);
      else flush();
    }
    flush();
  }
  return out.slice(0, 6);
}
