// Encryption at rest for secrets we must keep, such as a bank connection's Plaid access
// token. AES-256-GCM with a key derived (HKDF-SHA256) from DATA_ENCRYPTION_KEY, or from
// PHONE_ALERT_SECRET when that is the only server secret configured. The derivation uses
// its own label, so the two purposes never share a key.
//
// Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64url). Values written before
// encryption existed have no prefix and are read as-is, so old rows keep working.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const secret = process.env.DATA_ENCRYPTION_KEY?.trim() || process.env.PHONE_ALERT_SECRET?.trim();
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "verafund", "data-at-rest-v1", 32));
}

export function encryptionEnabled(): boolean {
  return key() !== null;
}

export function sealSecret(plain: string): string {
  const k = key();
  if (!k) {
    console.warn("[crypto] no DATA_ENCRYPTION_KEY: storing a secret unencrypted");
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
}

export function openSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // written before encryption
  const k = key();
  if (!k) throw new Error("DATA_ENCRYPTION_KEY is needed to read an encrypted secret");
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
