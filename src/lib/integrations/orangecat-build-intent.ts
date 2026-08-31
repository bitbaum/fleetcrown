import { createHmac, timingSafeEqual } from "node:crypto";

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
  suggestedHandoff: string[];
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
