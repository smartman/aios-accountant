import crypto from "node:crypto";

const ENCRYPTION_PREFIX = "v1";

function assertEncryptionSecret(): string {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!value) {
    throw new Error(
      "Missing required environment variable: CREDENTIAL_ENCRYPTION_KEY",
    );
  }

  return value;
}

function deriveEncryptionKey(secret: string): Buffer {
  try {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall back to hashing the provided secret.
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptJson(value: unknown): string {
  const key = deriveEncryptionKey(assertEncryptionSecret());
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(value);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptJson<T>(payload: string): T {
  const [prefix, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(":");
  if (
    prefix !== ENCRYPTION_PREFIX ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded
  ) {
    throw new Error("Stored credentials could not be decrypted.");
  }

  const key = deriveEncryptionKey(assertEncryptionSecret());
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}
