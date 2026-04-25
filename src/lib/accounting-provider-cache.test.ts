import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredConnectionCache,
  scopeMeritCredentials,
  scopeSmartAccountsCredentials,
} from "./accounting-provider-cache";

vi.mock("@/lib/providers/smartaccounts", () => ({
  clearCachedValuesByPrefix: vi.fn(),
  namespacedCacheKey: vi.fn(
    (
      credentials: { apiKey: string; secretKey: string; cacheScope: string },
      key: string,
    ) =>
      `${credentials.apiKey}:${credentials.secretKey}:${credentials.cacheScope}:${key}`,
  ),
}));

vi.mock("@/lib/providers/merit", () => ({
  clearCachedValuesByPrefix: vi.fn(),
  namespacedCacheKey: vi.fn(
    (
      credentials: { apiId: string; apiKey: string; cacheScope: string },
      key: string,
    ) =>
      `${credentials.apiId}:${credentials.apiKey}:${credentials.cacheScope}:${key}`,
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("accounting-provider-cache", () => {
  it("adds cache scope to smartaccounts credentials", () => {
    const credentials = scopeSmartAccountsCredentials(
      { apiKey: "smart-key", secretKey: "smart-secret" },
      "user-1",
    );

    expect(credentials.cacheScope).toBe("user-1");
  });

  it("adds cache scope to merit credentials", () => {
    const credentials = scopeMeritCredentials(
      { apiId: "merit-id", apiKey: "merit-key" },
      "user-1",
    );

    expect(credentials.cacheScope).toBe("user-1");
  });
});

describe("accounting-provider-cache clearing", () => {
  it("clears SmartAccounts cache by user-scoped prefix", async () => {
    const { clearCachedValuesByPrefix, namespacedCacheKey } =
      await import("@/lib/providers/smartaccounts");

    clearStoredConnectionCache({
      workosUserId: "user-1",
      provider: "smartaccounts",
      credentials: {
        provider: "smartaccounts",
        credentials: {
          apiKey: "smart-key",
          secretKey: "smart-secret",
        },
      },
      summary: {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "Verified",
        verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      },
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });

    expect(vi.mocked(namespacedCacheKey)).toHaveBeenCalledWith(
      {
        apiKey: "smart-key",
        secretKey: "smart-secret",
        cacheScope: "user-1",
      },
      "",
    );
    expect(vi.mocked(clearCachedValuesByPrefix)).toHaveBeenCalledWith(
      "smart-key:smart-secret:user-1:",
    );
  });

  it("clears Merit cache by user-scoped prefix", async () => {
    const { clearCachedValuesByPrefix, namespacedCacheKey } =
      await import("@/lib/providers/merit");

    clearStoredConnectionCache({
      workosUserId: "user-1",
      provider: "merit",
      credentials: {
        provider: "merit",
        credentials: {
          apiId: "merit-id",
          apiKey: "merit-key",
        },
      },
      summary: {
        provider: "merit",
        label: "Merit",
        detail: "Verified",
        verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      },
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });

    expect(vi.mocked(namespacedCacheKey)).toHaveBeenCalledWith(
      {
        apiId: "merit-id",
        apiKey: "merit-key",
        cacheScope: "user-1",
      },
      "",
    );
    expect(vi.mocked(clearCachedValuesByPrefix)).toHaveBeenCalledWith(
      "merit-id:merit-key:user-1:",
    );
  });
});

describe("accounting-provider-cache company scopes", () => {
  it("prefers company scope when clearing provider caches", async () => {
    const { namespacedCacheKey } =
      await import("@/lib/providers/smartaccounts");

    clearStoredConnectionCache({
      companyId: "company-1",
      workosUserId: "user-1",
      provider: "smartaccounts",
      credentials: {
        provider: "smartaccounts",
        credentials: {
          apiKey: "smart-key",
          secretKey: "smart-secret",
        },
      },
      summary: {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "Verified",
        verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      },
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });

    expect(vi.mocked(namespacedCacheKey)).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheScope: "company-1",
      }),
      "",
    );
  });

  it("falls back to a global scope for legacy connections without an owner", async () => {
    const { namespacedCacheKey } = await import("@/lib/providers/merit");

    clearStoredConnectionCache({
      provider: "merit",
      credentials: {
        provider: "merit",
        credentials: {
          apiId: "merit-id",
          apiKey: "merit-key",
        },
      },
      summary: {
        provider: "merit",
        label: "Merit",
        detail: "Verified",
        verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      },
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });

    expect(vi.mocked(namespacedCacheKey)).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheScope: "global",
      }),
      "",
    );
  });
});
