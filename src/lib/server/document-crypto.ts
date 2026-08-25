import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TAG_LENGTH = 16;

function encryptionKey() {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("DOCUMENT_ENCRYPTION_KEY is not configured on the server.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DOCUMENT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptDocument(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, tag]),
    iv: iv.toString("base64"),
    sha256: createHash("sha256").update(plain).digest("hex"),
  };
}

export function decryptDocument(ciphertextWithTag: Buffer, ivBase64: string) {
  if (ciphertextWithTag.length <= TAG_LENGTH) throw new Error("Encrypted document is invalid.");
  const encrypted = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LENGTH);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
