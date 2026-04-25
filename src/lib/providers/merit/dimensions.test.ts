import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritCredentials } from "../../accounting-provider-types";

const mocks = vi.hoisted(() => ({
  cachedValue: vi.fn(
    async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
      loader(),
  ),
  extractList: vi.fn((value: unknown) => (Array.isArray(value) ? value : [])),
  isNonNull: vi.fn((value: unknown) => value !== null && value !== undefined),
  meritRequest: vi.fn(),
  namespacedCacheKey: vi.fn(
    (_credentials: MeritCredentials, key: string) => `scope:${key}`,
  ),
  toOptionalNumber: vi.fn((value: unknown) =>
    typeof value === "number" ? value : undefined,
  ),
  toOptionalString: vi.fn((value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined,
  ),
}));

vi.mock("./core", () => ({
  CACHE_TTLS: {
    dimensions: 1000,
  },
  ...mocks,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Merit dimensions", () => {
  it("loads and normalizes active dimension values", async () => {
    mocks.meritRequest.mockResolvedValue([
      {
        DimId: 1,
        DimName: "Object",
        Id: "value-1",
        Code: "OBJ-1",
        Name: "Office build",
        EndDate: "2026-12-31",
        NonActive: false,
        DebitPositive: true,
      },
      {
        DimId: 2,
        Code: "skip",
        Name: "Missing id",
      },
      {
        DimId: 3,
        DimName: "Department",
        Id: "value-3",
        Code: "DEP-1",
        Name: "Sales",
      },
    ]);
    const { getDimensions } = await import("./dimensions");

    await expect(
      getDimensions({ apiId: "id", apiKey: "key" }),
    ).resolves.toEqual([
      {
        dimId: 1,
        dimName: "Object",
        id: "value-1",
        code: "OBJ-1",
        name: "Office build",
        endDate: "2026-12-31",
        nonActive: false,
        debitPositive: true,
      },
      {
        dimId: 3,
        dimName: "Department",
        id: "value-3",
        code: "DEP-1",
        name: "Sales",
        endDate: undefined,
        nonActive: undefined,
        debitPositive: undefined,
      },
    ]);
    expect(mocks.meritRequest).toHaveBeenCalledWith(
      "getdimensions",
      {
        apiId: "id",
        apiKey: "key",
      },
      {
        AllValues: false,
      },
    );
  });
});
