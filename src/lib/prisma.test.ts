import { afterEach, describe, expect, it } from "vitest";

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = value;
}

describe("getPrismaClient", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(async () => {
    const clients = [globalThis.__accountingPrisma__].filter(Boolean);

    for (const client of clients) {
      await client?.$disconnect();
    }

    delete globalThis.__accountingPrisma__;
    delete globalThis.__accountingPrismaPool__;
    setNodeEnv(originalNodeEnv);
  });

  it("reuses the same client in production mode", async () => {
    setNodeEnv("production");
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";

    const { getPrismaClient } = await import("./prisma");
    const first = getPrismaClient();
    const second = getPrismaClient();

    expect(first).toBe(second);
    expect(globalThis.__accountingPrisma__).toBe(first);
    expect(globalThis.__accountingPrismaPool__).toBeDefined();
  });

  it("throws when DATABASE_URL is missing", async () => {
    setNodeEnv("production");
    delete process.env.DATABASE_URL;

    const { getPrismaClient } = await import("./prisma");

    expect(() => getPrismaClient()).toThrow(
      "Missing required environment variable: DATABASE_URL",
    );
  });
});
