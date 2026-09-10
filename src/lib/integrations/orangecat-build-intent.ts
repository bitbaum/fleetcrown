import { createHmac, timingSafeEqual } from "node:crypto";
import { PROJECT_ATTR } from "@/config/project-attrs";

export interface OrangeCatBuildIntent {
  iss: "orangecat";
  aud: "fleetcrown";
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  entity: {
    type: string;
    id: string;
    title: string;
    description: string | null;
    publicUrl: string;
  };
  /**
   * Who the builder is building FOR (OrangeCat sends it since 2026-09-10;
   * older tokens carry none). `unclaimed` is a page set up on someone's behalf
   * that she has not taken over yet — the steward answers for her until then.
   */
  owner?: {
    kind: "user" | "group" | "unclaimed";
    displayName: string;
    pageUrl: string | null;
    stewardUsername: string | null;
  };
  suggestedHandoff: string[];
}

/**
 * The client block for a project's notes. The first question any builder asks
 * is "who is this for, and who do I talk to?" — the answer travels in the
 * token and is written where the agent dossier and the project page both read.
 */
export function describeClient(intent: Pick<OrangeCatBuildIntent, "owner">): string[] {
  const owner = intent.owner;
  if (!owner) return [];
  const who = owner.pageUrl ? `${owner.displayName} (${owner.pageUrl})` : owner.displayName;
  if (owner.kind === "unclaimed") {
    return [
      `Client: ${who} — has not claimed the OrangeCat page yet.`,
      owner.stewardUsername
        ? `Contact until then: @${owner.stewardUsername} on OrangeCat, who set the page up.`
        : "Contact until then: the person who set the page up on OrangeCat.",
      "Once a site exists, the client steers changes through the FleetCrown feedback widget on it — no FleetCrown account needed.",
    ];
  }
  return [`Client: ${who}${owner.kind === "group" ? " (a group)" : ""}.`];
}

function decode(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

export function verifyOrangeCatBuildIntent(token: string): OrangeCatBuildIntent {
  const secret = process.env.FLEETCROWN_BUILD_INTENT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("OrangeCat build handoff is not configured");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid build handoff");
  const [header, body, supplied] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid build handoff signature");
  }

  const headerValue = decode(header) as { alg?: string };
  const payload = decode(body) as OrangeCatBuildIntent;
  const now = Math.floor(Date.now() / 1000);
  if (
    headerValue.alg !== "HS256" ||
    payload.iss !== "orangecat" ||
    payload.aud !== "fleetcrown" ||
    !payload.jti ||
    !payload.sub ||
    payload.exp <= now ||
    payload.iat > now + 60 ||
    payload.exp - payload.iat > 10 * 60 ||
    !payload.entity?.id ||
    !payload.entity?.title ||
    !payload.entity?.publicUrl
  ) {
    throw new Error("Expired or invalid build handoff");
  }
  const publicUrl = new URL(payload.entity.publicUrl);
  const isOrangeCatHost =
    publicUrl.hostname === "orangecat.ch" || publicUrl.hostname.endsWith(".orangecat.ch");
  if (publicUrl.protocol !== "https:" || !isOrangeCatHost) {
    throw new Error("Invalid OrangeCat public URL");
  }
  return payload;
}

const SITE_BRIEF_NEXT_STEP =
  "Turn the OrangeCat description into a website brief the client can read, then scaffold the site (fleetcrown: scripts/hetzner/new-site.sh <slug>) so the feedback widget reaches her from day one.";

/** The fields the token states outright — no model, no guessing. */
export function handoffAttributes(intent: OrangeCatBuildIntent): Record<string, string> {
  const attrs: Record<string, string> = {
    [PROJECT_ATTR.URL]: intent.entity.publicUrl,
    [PROJECT_ATTR.STATUS]: "Brief from OrangeCat",
    [PROJECT_ATTR.NEXT_STEP]: SITE_BRIEF_NEXT_STEP,
  };
  const owner = intent.owner;
  if (owner) {
    attrs[PROJECT_ATTR.OWNER] =
      owner.kind === "unclaimed"
        ? `${owner.displayName} (client; page not yet claimed${owner.stewardUsername ? `, steward @${owner.stewardUsername}` : ""})`
        : owner.displayName;
    if (owner.kind === "unclaimed") {
      attrs[PROJECT_ATTR.CUSTOMERS] =
        `Built for ${owner.displayName}; she reviews the result herself and requests changes through the site's feedback widget.`;
    }
  }
  return attrs;
}
