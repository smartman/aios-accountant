import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asRecord,
  cachedValue,
  clearCachedValuesByPrefix,
  clearMeritCachesForTests,
  getMeritCacheNamespace,
  extractList,
  getAccounts,
  getBanks,
  getItems,
  getPaymentTypes,
  getTaxes,
  getUnits,
  meritDate,
  meritDateTime,
  meritRequest,
  namespacedCacheKey,
  setCachedValue,
  signMeritRequest,
  toOptionalNumber,
  toOptionalString,
  validateMeritV2Access,
} from "./core";

function buildCredentials(seed: string) {
  return {
    apiId: `merit-id-${seed}`,
    apiKey: `merit-key-${seed}`,
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function errorResponse(status: number, payload: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    text: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearMeritCachesForTests();
});

describe("merit-core date and parsing helpers", () => {
  it("normalizes dates, date-times, and scalar helper values", () => {
    expect(meritDate(undefined)).toBeUndefined();
    expect(meritDate("2026-04-14")).toBe("20260414");
    expect(meritDate("2026-04-14T15:30:00.000Z")).toBe("20260414");
    expect(meritDate("not-a-date")).toBeUndefined();
    expect(meritDateTime("2026-04-14T12:34:00.000Z")).toBe("202604141234");

    expect(asRecord({ key: "value" })).toEqual({ key: "value" });
    expect(asRecord(null)).toBeNull();

    expect(extractList([{ Id: "1" }])).toEqual([{ Id: "1" }]);
    expect(extractList({ rows: [{ Id: "2" }] })).toEqual([{ Id: "2" }]);
    expect(extractList({ Id: "3" })).toEqual([{ Id: "3" }]);
    expect(extractList("invalid")).toEqual([]);

    expect(toOptionalString("  merit  ")).toBe("merit");
    expect(toOptionalString("   ")).toBeUndefined();
    expect(toOptionalNumber(12.5)).toBe(12.5);
    expect(toOptionalNumber(" 12,5 ")).toBe(12.5);
    expect(toOptionalNumber("bad")).toBeUndefined();
  });

  it("builds deterministic cache keys and request signatures", () => {
    const credentials = buildCredentials("signature");
    const key = namespacedCacheKey(credentials, "accounts");
    const signature = signMeritRequest(credentials, "20260414090000", "{}");

    expect(key).toContain(":accounts");
    expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("includes cache scope in namespaces", () => {
    const scoped = getMeritCacheNamespace({
      ...buildCredentials("scope"),
      cacheScope: "user-1",
    });
    const global = getMeritCacheNamespace(buildCredentials("scope"));

    expect(scoped).toHaveLength(64);
    expect(global).toHaveLength(64);
    expect(scoped).not.toBe(global);
  });
});

describe("merit-core caching", () => {
  it("reuses cached and inflight values", async () => {
    const loader = vi.fn(async () => "loaded");

    const [first, second] = await Promise.all([
      cachedValue("cache:key", 60_000, loader),
      cachedValue("cache:key", 60_000, loader),
    ]);
    const third = await cachedValue("cache:key", 60_000, loader);

    expect(first).toBe("loaded");
    expect(second).toBe("loaded");
    expect(third).toBe("loaded");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("clears cached prefixes and retries after loader failures", async () => {
    const retryingLoader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("recovered");

    await expect(
      cachedValue("retry:key", 60_000, retryingLoader),
    ).rejects.toThrow("temporary");
    await expect(
      cachedValue("retry:key", 60_000, retryingLoader),
    ).resolves.toBe("recovered");

    setCachedValue("prefix:one", 60_000, "cached");
    clearCachedValuesByPrefix("prefix:");

    const loader = vi.fn(async () => "fresh");
    await expect(cachedValue("prefix:one", 60_000, loader)).resolves.toBe(
      "fresh",
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("clears inflight entries when a prefix is removed", async () => {
    const releases: Array<(value: string) => void> = [];
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releases.push(resolve);
        }),
    );

    const pending = cachedValue("prefix:inflight", 60_000, loader);
    clearCachedValuesByPrefix("prefix:");
    const second = cachedValue("prefix:inflight", 60_000, loader);

    for (const release of releases) {
      release("done");
    }

    await expect(pending).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("merit-core requests", () => {
  it("posts signed requests to the hardcoded Merit endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    const result = await meritRequest(
      "getpaymenttypes",
      buildCredentials("request"),
      { Type: 1 },
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://aktiva.merit.ee/api/v2/getpaymenttypes?",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      cache: "no-store",
    });
  });

  it("surfaces JSON and plain-text error messages", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        errorResponse(401, JSON.stringify({ message: "Denied" })),
      )
      .mockResolvedValueOnce(
        errorResponse(403, JSON.stringify({ error: "Forbidden" })),
      )
      .mockResolvedValueOnce(errorResponse(500, "Gateway failed"));

    await expect(
      meritRequest("getaccounts", buildCredentials("json-error")),
    ).rejects.toThrow("Merit 401: Denied");
    await expect(
      meritRequest("gettaxes", buildCredentials("error-field")),
    ).rejects.toThrow("Merit 403: Forbidden");
    await expect(
      meritRequest("gettaxes", buildCredentials("text-error")),
    ).rejects.toThrow("Merit 500: Gateway failed");
  });

  it("rejects blank Merit credentials before sending a request", async () => {
    await expect(
      meritRequest("getaccounts", { apiId: " ", apiKey: " " }),
    ).rejects.toThrow("Merit API ID and API key are required.");
  });
});

it("normalizes accounts, taxes, banks, payment types, units, and items", async () => {
  const credentials = buildCredentials("resources");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes("/getaccounts?")) {
      return jsonResponse([
        { AccountID: "1", Code: "4000", NameEN: "Services" },
        { Name: "skip" },
      ]);
    }
    if (url.includes("/gettaxes?")) {
      return jsonResponse([
        { Id: "tax-1", Code: "22", NameEN: "VAT", TaxPct: "22" },
        { Id: "tax-2", TaxPct: "0" },
        { Code: "skip" },
      ]);
    }
    if (url.includes("/getbanks?")) {
      return jsonResponse([
        { BankId: "bank-1", Name: "Main bank", CurrencyCode: "EUR" },
        { BankId: "x" },
      ]);
    }
    if (url.includes("/getpaymenttypes?")) {
      return jsonResponse([
        { Id: "ptype-1", Name: "Bank", SourceType: "1" },
        { Name: "skip" },
      ]);
    }
    if (url.includes("/getunits?")) {
      return jsonResponse([{ Code: "pcs", Name: "Pieces" }, { Code: "skip" }]);
    }
    if (url.includes("/getitems?")) {
      return jsonResponse([
        {
          ItemId: "item-1",
          Code: "FURNITURE",
          Description: "Furniture",
          UnitofMeasureName: "pcs",
          Usage: 2,
          PurchaseAccountCode: "4000",
          TaxId: "tax-1",
          Type: 2,
        },
        { Code: "BROKEN" },
      ]);
    }

    return jsonResponse([]);
  });

  await expect(getAccounts(credentials)).resolves.toEqual([
    {
      id: "1",
      code: "4000",
      name: undefined,
      nameEn: "Services",
      taxName: undefined,
      taxNameEn: undefined,
    },
  ]);
  await expect(getTaxes(credentials)).resolves.toEqual([
    {
      id: "tax-1",
      code: "22",
      name: "VAT",
      rate: 22,
    },
    {
      id: "tax-2",
      code: "tax-2",
      name: undefined,
      rate: 0,
    },
  ]);
  await expect(getBanks(credentials)).resolves.toEqual([
    {
      id: "bank-1",
      name: "Main bank",
      iban: undefined,
      currencyCode: "EUR",
      accountCode: undefined,
    },
  ]);
  await expect(getPaymentTypes(credentials)).resolves.toEqual([
    {
      id: "ptype-1",
      name: "Bank",
      sourceType: 1,
      currencyCode: undefined,
    },
  ]);
  await expect(getUnits(credentials)).resolves.toEqual([
    { code: "pcs", name: "Pieces" },
  ]);
  await expect(getItems(credentials)).resolves.toEqual([
    {
      id: "item-1",
      code: "FURNITURE",
      description: "Furniture",
      unit: "pcs",
      type: 2,
      usage: 2,
      purchaseAccountCode: "4000",
      salesAccountCode: undefined,
      inventoryAccountCode: undefined,
      costAccountCode: undefined,
      taxId: "tax-1",
    },
  ]);
});

it("validates v2 access by querying payment types and purchase orders", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(jsonResponse([]));

  await validateMeritV2Access(buildCredentials("validate"));

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/getpaymenttypes?");
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/getpurchorders?");
});
