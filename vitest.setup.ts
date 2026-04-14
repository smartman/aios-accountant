import fs from "node:fs";
import path from "node:path";

const TEST_ISOLATED_ENV_PREFIXES = [
  "DEV_AUTH_",
  "NEXT_PUBLIC_WORKOS_",
  "OPENROUTER_",
  "SMARTACCOUNTS_DEV_",
  "WORKOS_",
] as const;

const TEST_ISOLATED_ENV_KEYS = [
  "CREDENTIAL_ENCRYPTION_KEY",
  "DATABASE_URL",
] as const;

function resetIsolatedTestEnv(): void {
  for (const key of TEST_ISOLATED_ENV_KEYS) {
    delete process.env[key];
  }

  for (const key of Object.keys(process.env)) {
    if (TEST_ISOLATED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete process.env[key];
    }
  }
}

function loadEnvFile(fileName: string): void {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = value;
}

resetIsolatedTestEnv();
loadEnvFile(".env.test.local");
loadEnvFile(".env.test");

process.env.DATABASE_URL ??=
  "postgresql://accounting:accounting@localhost:5432/accounting?schema=public";
process.env.CREDENTIAL_ENCRYPTION_KEY ??= "vitest-accounting-encryption-secret";
setNodeEnv(process.env.NODE_ENV ?? "test");
