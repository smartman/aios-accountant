import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./connection-crypto";

function setEncryptionSecret(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.CREDENTIAL_ENCRYPTION_KEY;
    return;
  }

  env.CREDENTIAL_ENCRYPTION_KEY = value;
}

describe("connection-crypto", () => {
  it("encrypts and decrypts JSON payloads", () => {
    const payload = {
      provider: "smartaccounts",
      credentials: {
        apiKey: "public-key",
        secretKey: "secret-key",
      },
    };

    const encrypted = encryptJson(payload);
    expect(encrypted).not.toContain("public-key");
    expect(decryptJson<typeof payload>(encrypted)).toEqual(payload);
  });

  it("fails when ciphertext is tampered with", () => {
    const encrypted = encryptJson({ test: true });
    const tampered = `${encrypted}a`;

    expect(() => decryptJson(tampered)).toThrow();
  });

  it("supports a base64-encoded 32-byte secret", () => {
    const originalSecret = process.env.CREDENTIAL_ENCRYPTION_KEY;
    setEncryptionSecret(Buffer.alloc(32, 1).toString("base64"));

    const encrypted = encryptJson({ ok: true });

    expect(decryptJson<{ ok: boolean }>(encrypted)).toEqual({ ok: true });
    setEncryptionSecret(originalSecret);
  });

  it("throws when the encryption secret is missing", () => {
    const originalSecret = process.env.CREDENTIAL_ENCRYPTION_KEY;
    setEncryptionSecret(undefined);

    expect(() => encryptJson({ ok: true })).toThrow(
      "Missing required environment variable: CREDENTIAL_ENCRYPTION_KEY",
    );

    setEncryptionSecret(originalSecret);
  });
});
