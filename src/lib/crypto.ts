import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must contain 64 hexadecimal characters.");
  }
  return Buffer.from(value, "hex");
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const [version, iv, tag, encrypted, ...extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra.length) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
