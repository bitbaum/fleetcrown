/**
 * Bitcoin signed-message SIGNING for Loki's Solon votes — FleetCrown's
 * independent port of the format Solon verifies (magic + varint preimage,
 * double-SHA256, base64 65-byte signature with a compressed-key recovery
 * header). Used for exactly one key: LOKI_SOLON_PRIVKEY, this system's own
 * governance identity. A vote signed here is FleetCrown's attested judgment.
 *
 * Pinned to Solon's implementation by a fixed test vector generated there
 * (scripts/test/solon-message.ts) — deterministic RFC6979 signing means the
 * signature bytes must match exactly; any drift fails the unit suite.
 */
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import bs58check from "bs58check";

// RFC6979 deterministic signing needs HMAC-SHA256 supplied. v3 moved this from
// `etc.hmacSha256Sync` (varargs) to `hashes.*` (a single message), and leaving
// it unset throws at sign time rather than at import — so it is wired here, not
// discovered in prod.
secp.hashes.sha256 = (msg) => sha256(msg);
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const MAGIC = new TextEncoder().encode("Bitcoin Signed Message:\n");

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, (n >> 8) & 0xff);
  return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
}

function messageDigest(message: string): Uint8Array {
  const msg = new TextEncoder().encode(message);
  const preimage = secp.etc.concatBytes(Uint8Array.of(MAGIC.length), MAGIC, varint(msg.length), msg);
  return sha256(sha256(preimage));
}

/** Mainnet P2PKH address for a private key — how Loki knows its own identity. */
export function addressFromPrivateKey(privateKeyHex: string): string {
  const pub = secp.getPublicKey(secp.etc.hexToBytes(privateKeyHex), true);
  return bs58check.encode(secp.etc.concatBytes(Uint8Array.of(0x00), ripemd160(sha256(pub))));
}

/** Standard base64 Bitcoin message signature (compressed key, header 31–34). */
export function signBitcoinMessage(message: string, privateKeyHex: string): string {
  const digest = messageDigest(message);
  // `prehash: false` is load-bearing: `digest` is already Bitcoin's
  // double-SHA256, and letting v3 hash it again would sign the wrong value —
  // silently, since the result is still a structurally valid signature.
  // `format: "recovered"` returns 65 bytes laid out as recovery || r || s.
  const sig = secp.sign(digest, secp.etc.hexToBytes(privateKeyHex), {
    prehash: false,
    format: "recovered",
  });
  const header = 27 + sig[0] + 4;
  return Buffer.from(secp.etc.concatBytes(Uint8Array.of(header), sig.subarray(1))).toString("base64");
}

/** Canonical Solon vote message — byte-identical to Solon's voteMessage(). */
export function solonVoteMessage(params: {
  sessionId: string;
  choice: string;
  memberAddress: string;
}): string {
  return `Solon vote\nsession:${params.sessionId}\nchoice:${params.choice}\nvoter:${params.memberAddress}`;
}
