import crypto from "node:crypto";
import { WebSocket, type RawData } from "ws";

/**
 * Drives the OpenClaw gateway `agent` method over WebSocket so FleetCrown's
 * in-app Loki IS the same agent (`main`) as the Telegram bot — one persona,
 * one workspace memory. Auth: a persistent Ed25519 device identity (from env)
 * that auto-pairs over loopback (silent approval) to obtain operator.write
 * scope, plus the shared gateway token. Mirrors OpenClaw's device-auth scheme
 * (src/infra/device-identity.ts + gateway/device-auth.ts).
 */

const ED25519_SPKI_PREFIX_LEN = 12; // DER SPKI header for Ed25519 raw key

function b64url(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

type DeviceIdentity = { privateKey: crypto.KeyObject; deviceId: string; publicKeyB64Url: string };

let cachedIdentity: DeviceIdentity | null | undefined;

function loadDeviceIdentity(): DeviceIdentity | null {
  if (cachedIdentity !== undefined) return cachedIdentity;
  const b64 = process.env.LOKI_GATEWAY_DEVICE_KEY_B64?.trim();
  if (!b64) return (cachedIdentity = null);
  try {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey);
    const raw = (publicKey.export({ type: "spki", format: "der" }) as Buffer).subarray(ED25519_SPKI_PREFIX_LEN);
    const deviceId = crypto.createHash("sha256").update(raw).digest("hex");
    return (cachedIdentity = { privateKey, deviceId, publicKeyB64Url: b64url(raw) });
  } catch {
    return (cachedIdentity = null);
  }
}

function gatewayWsUrl(): string {
  const url = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
  return url.replace(/^http/, "ws");
}

export type GatewayAgentResult = { ok: boolean; text?: string; model?: string; durationMs?: number; error?: string };

/** True when the gateway brain is configured (token + device key present). */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim() && loadDeviceIdentity());
}

/**
 * Send a message to the OpenClaw agent and return its text reply.
 * Resolves (never rejects) with `{ ok:false, error }` on any failure so the
 * caller can decide how to surface it (no thrown exceptions in the hot path).
 */
export async function askGatewayAgent(
  message: string,
  opts: { sessionKey?: string; agentId?: string; timeoutMs?: number } = {},
): Promise<GatewayAgentResult> {
  const shared = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  const identity = loadDeviceIdentity();
  if (!shared || !identity) return { ok: false, error: "gateway not configured" };

  const agentId = opts.agentId ?? "main";
  const sessionKey = opts.sessionKey ?? "agent:main:web";
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const clientId = "node-host";
  const clientMode = "backend";
  const role = "operator";
  const scopes = ["operator.write"];
  const connectId = crypto.randomUUID();
  const agentReqId = crypto.randomUUID();
  const startedAt = Date.now();

  return new Promise<GatewayAgentResult>((resolve) => {
    let settled = false;
    let ws: WebSocket;
    const timerRef: { id?: ReturnType<typeof setTimeout> } = {};
    const finish = (r: GatewayAgentResult) => {
      if (settled) return;
      settled = true;
      if (timerRef.id) clearTimeout(timerRef.id);
      try { ws.close(); } catch { /* ignore */ }
      resolve(r);
    };
    try {
      ws = new WebSocket(gatewayWsUrl());
    } catch {
      resolve({ ok: false, error: "gateway unreachable" });
      return;
    }
    timerRef.id = setTimeout(() => finish({ ok: false, error: "gateway timeout" }), timeoutMs);

    const sendConnect = (nonce: string) => {
      const signedAt = Date.now();
      const payload = ["v2", identity.deviceId, clientId, clientMode, role, scopes.join(","), String(signedAt), shared, nonce].join("|");
      const signature = b64url(crypto.sign(null, Buffer.from(payload, "utf8"), identity.privateKey));
      ws.send(JSON.stringify({
        type: "req", id: connectId, method: "connect",
        params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: clientId, displayName: "FleetCrown", version: "1.0.0", platform: "linux", mode: clientMode },
          auth: { token: shared }, role, scopes,
          device: { id: identity.deviceId, publicKey: identity.publicKeyB64Url, signature, signedAt, nonce },
        },
      }));
    };

    ws.on("error", () => finish({ ok: false, error: "gateway unreachable" }));
    ws.on("close", () => finish({ ok: false, error: "gateway closed before reply" }));
    ws.on("message", (data: RawData) => {
      let f: Record<string, unknown> & { payload?: Record<string, unknown>; error?: { message?: string }; id?: string; ok?: boolean; event?: string };
      try {
        f = JSON.parse(data.toString());
      } catch { return; }

      if (f.event === "connect.challenge") {
        const nonce = (f.payload as { nonce?: unknown } | undefined)?.nonce;
        if (typeof nonce === "string") sendConnect(nonce);
        return;
      }
      if (f.id === connectId) {
        const payload = f.payload as { type?: string } | undefined;
        if (f.ok && payload?.type === "hello-ok") {
          ws.send(JSON.stringify({
            type: "req", id: agentReqId, method: "agent",
            params: { message, agentId, sessionKey, idempotencyKey: agentReqId, timeout: Math.floor(timeoutMs / 1000) },
          }));
        } else {
          finish({ ok: false, error: f.error?.message ?? "gateway connect failed" });
        }
        return;
      }
      if (f.id === agentReqId) {
        const payload = f.payload as { status?: string; result?: { payloads?: Array<{ text?: string }>; meta?: { agentMeta?: { model?: string } } } } | undefined;
        const status = payload?.status;
        if (status === "accepted") return; // wait for final frame
        if (status === "ok") {
          finish({
            ok: true,
            text: payload?.result?.payloads?.[0]?.text ?? "",
            model: payload?.result?.meta?.agentMeta?.model ?? "openclaw/main",
            durationMs: Date.now() - startedAt,
          });
        } else {
          finish({ ok: false, error: f.error?.message ?? "agent run failed" });
        }
      }
    });
  });
}
