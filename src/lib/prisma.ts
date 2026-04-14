import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __accountingPrisma__: PrismaClient | undefined;
  var __accountingPrismaPool__: Pool | undefined;
}

function assertDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return value;
}

function createPrismaClient(): PrismaClient {
  const pool =
    globalThis.__accountingPrismaPool__ ??
    new Pool({
      connectionString: assertDatabaseUrl(),
    });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
  });

  globalThis.__accountingPrismaPool__ = pool;

  return client;
}

export function getPrismaClient(): PrismaClient {
  if (globalThis.__accountingPrisma__) {
    return globalThis.__accountingPrisma__;
  }

  const client = createPrismaClient();

  globalThis.__accountingPrisma__ = client;

  return client;
}
