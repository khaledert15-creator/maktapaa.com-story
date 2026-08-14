import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function hashWebsiteChatGuestKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encryptWebsiteChatSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptWebsiteChatSecret(value: string, secret: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted website chat secret");
  const [ivValue, tagValue, encryptedValue] = parts;
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
