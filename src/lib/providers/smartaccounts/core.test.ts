import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountLabel,
  asRecord,
  extractArray,
  cachedValue,
  clearCachedValuesByPrefix,
  clearSmartAccountsCachesForTests,
  getSmartAccountsCacheNamespace,
  isNonNull,
  setCachedValue,
  namespacedCacheKey,
  normalizeVendor,
  signSmartAccountsRequest,
  smartAccountsRequest,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalString,
} from "./core";
import {
  getAccounts,
  getArticles,
  getBankAccounts,
  getCashAccounts,
  getObjects,
  getVatPcs,
} from "./loaders";

function buildCredentials(seed: string) {
  return {
    apiKey: `smart-api-${seed}`,
    secretKey: `smart-secret-${seed}`,
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
  clearSmartAccountsCachesForTests();
});

describe("smartaccounts-core request helpers", () => {
  it("signs requests and posts to the hardcoded SmartAccounts API", async () => {
    const credentials = buildCredentials("request");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    expect(signSmartAccountsRequest("apikey=test", "{}", credentials)).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const result = await smartAccountsRequest(
      "/settings/accounts",
      "get",
      credentials,
      {
        query: { pageNumber: 1, optional: undefined },
        body: { active: true },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(getSmartAccountsCacheNamespace(credentials)).toHaveLength(64);
    expect(namespacedCacheKey(credentials, "accounts")).toContain(":accounts");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://sa.smartaccounts.eu/en/api/settings/accounts:get?",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      cache: "no-store",
    });
  });

  it("surfaces JSON and plain-text request errors and rejects empty credentials", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        errorResponse(401, JSON.stringify({ error: "Denied" })),
      )
      .mockResolvedValueOnce(errorResponse(500, "Gateway failed"));

    await expect(
      smartAccountsRequest(
        "/settings/accounts",
        "get",
        buildCredentials("json-error"),
      ),
    ).rejects.toThrow("SmartAccounts GET /settings/accounts:get 401: Denied");
    await expect(
      smartAccountsRequest(
        "/settings/accounts",
        "get",
        buildCredentials("text-error"),
      ),
    ).rejects.toThrow(
      "SmartAccounts GET /settings/accounts:get 500: Gateway failed",
    );
    await expect(
      smartAccountsRequest("/settings/accounts", "get", {
        apiKey: "",
        secretKey: "",
      }),
    ).rejects.toThrow("SmartAccounts API key and secret key are required.");
  });
});

describe("smartaccounts-core cache behavior", () => {
  it("includes cache scope in the namespace and prefixes by user", () => {
    const credentials = buildCredentials("scope");
    const scoped = getSmartAccountsCacheNamespace({
      ...credentials,
      cacheScope: "user-1",
    });
    const global = getSmartAccountsCacheNamespace(credentials);

    expect(scoped).toHaveLength(64);
    expect(global).toHaveLength(64);
    expect(scoped).not.toBe(global);
    expect(
      namespacedCacheKey({ ...credentials, cacheScope: "user-1" }, "vats"),
    ).toContain("vats");
  });

  it("clears cached values and inflight operations by key prefix", async () => {
    const pendingLoader = vi.fn(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      return "fresh";
    });

    const inFlight = cachedValue("user1:inflight", 60_000, pendingLoader);
    setCachedValue("user1:cache", 60_000, "stale");
    const loader = vi.fn(async () => "fresh");
    await expect(cachedValue("user1:cache", 60_000, loader)).resolves.toBe(
      "stale",
    );
    const noMatch = cachedValue("other:cache", 60_000, async () => "other");

    clearCachedValuesByPrefix("user1:");

    const next = await cachedValue("user1:cache", 60_000, loader);
    await expect(inFlight).resolves.toBe("fresh");
    expect(loader).toHaveBeenCalledOnce();
    expect(next).toBe("fresh");

    await expect(noMatch).resolves.toBe("other");
  });
});

describe("smartaccounts-core normalization helpers", () => {
  it("extracts arrays and normalizes scalar values", () => {
    expect(asRecord({ key: "value" })).toEqual({ key: "value" });
    expect(asRecord(null)).toBeNull();
    expect(isNonNull("value")).toBe(true);
    expect(isNonNull(null)).toBe(false);

    expect(extractArray([{ id: 1 }], ["items"])).toEqual([{ id: 1 }]);
    expect(extractArray({ items: [{ id: 2 }] }, ["items"])).toEqual([
      { id: 2 },
    ]);
    expect(extractArray({ other: [{ id: 3 }] }, ["items"])).toEqual([
      { id: 3 },
    ]);
    expect(extractArray("invalid", ["items"])).toEqual([]);

    expect(toOptionalString("  text  ")).toBe("text");
    expect(toOptionalString("   ")).toBeUndefined();
    expect(toOptionalNumber(12)).toBe(12);
    expect(toOptionalNumber(" 12,5 ")).toBe(12.5);
    expect(toOptionalNumber(Number.NaN)).toBeUndefined();
    expect(toOptionalNumber("bad")).toBeUndefined();
    expect(toOptionalBoolean(true)).toBe(true);
    expect(toOptionalBoolean("true")).toBeUndefined();

    const vendor = normalizeVendor({
      vendorId: "vendor-1",
      name: "Vendor OÜ",
      address: { country: "EE", city: "Tallinn" },
    });

    expect(vendor).toEqual({
      id: "vendor-1",
      name: "Vendor OÜ",
      regCode: undefined,
      vatNumber: undefined,
      bankAccount: undefined,
      referenceNumber: undefined,
      accountUnpaid: undefined,
      address: {
        country: "EE",
        county: undefined,
        city: "Tallinn",
        address1: undefined,
        address2: undefined,
        postalCode: undefined,
      },
    });
    expect(normalizeVendor({ id: "missing-name" })).toBeNull();
    expect(normalizeVendor({ name: "Vendor no address" })).toMatchObject({
      name: "Vendor no address",
      address: undefined,
    });
    expect(
      accountLabel({
        code: "4000",
        name: "Services",
        descriptionEt: "Teenused",
        descriptionEn: "Services",
      }),
    ).toContain("Services");
  });
});

function mockResourceFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes("/settings/accounts:get")) {
      return jsonResponse({
        accounts: [
          { code: "4000", descriptionEn: "Services" },
          { name: "skip" },
        ],
      });
    }
    if (url.includes("/settings/vatpcs:get")) {
      return jsonResponse({
        vatPcs: [{ vatPc: "VAT22", vatPercent: "22" }, { percent: 22 }],
      });
    }
    if (url.includes("/settings/bankaccounts:get")) {
      return jsonResponse({
        bankAccounts: [
          { name: "Main bank", account: "1020" },
          { account: "skip" },
        ],
      });
    }
    if (url.includes("/settings/cashaccounts:get")) {
      return jsonResponse({
        cashAccounts: [
          { name: "Cash desk", account: "1000" },
          { account: "skip" },
        ],
      });
    }
    if (url.includes("/purchasesales/articles:get")) {
      return jsonResponse({
        articles: [
          { code: "ROW01", description: "Consulting" },
          { description: "skip" },
        ],
      });
    }
    if (url.includes("/settings/objects:get")) {
      return jsonResponse({
        objects: [
          { id: "object-1", code: "OBJ", name: "Object", active: true },
          { code: "skip" },
        ],
      });
    }

    return jsonResponse({});
  });
}

describe("smartaccounts-core resource loading", () => {
  it("normalizes accounts, VAT codes, bank accounts, cash accounts, and articles", async () => {
    const credentials = buildCredentials("resources");
    mockResourceFetch();

    await expect(getAccounts(credentials)).resolves.toEqual([
      {
        code: "4000",
        type: undefined,
        name: undefined,
        nameEt: undefined,
        nameEn: undefined,
        description: "Services",
        descriptionEt: undefined,
        descriptionEn: "Services",
      },
    ]);
    await expect(getVatPcs(credentials)).resolves.toEqual([
      {
        vatPc: "VAT22",
        percent: 22,
        description: undefined,
        descriptionEt: undefined,
        descriptionEn: undefined,
        accountPurchase: undefined,
        accountSales: undefined,
      },
    ]);
    await expect(getBankAccounts(credentials)).resolves.toEqual([
      {
        name: "Main bank",
        account: "1020",
        currency: undefined,
        iban: undefined,
        swift: undefined,
        forNetting: undefined,
        defaultEInvoiceAccount: undefined,
        order: undefined,
      },
    ]);
    await expect(getCashAccounts(credentials)).resolves.toEqual([
      {
        name: "Cash desk",
        account: "1000",
        currency: undefined,
        order: undefined,
      },
    ]);
    await expect(getArticles(credentials)).resolves.toEqual([
      {
        code: "ROW01",
        description: "Consulting",
        unit: undefined,
        type: undefined,
        activePurchase: undefined,
        activeSales: undefined,
        accountPurchase: undefined,
        vatPc: undefined,
      },
    ]);
    await expect(getObjects(credentials)).resolves.toEqual([
      {
        id: "object-1",
        code: "OBJ",
        name: "Object",
        active: true,
      },
    ]);

    expect(
      extractArray(
        {
          values: [10, 20],
          text: "skip",
        },
        ["items"],
      ),
    ).toEqual([10, 20]);
    expect(extractArray({ text: "no-arrays" }, ["entries"])).toEqual([]);
  });
});

describe("smartaccounts-core request formatting", () => {
  it("handles request signing error body variants and fallback date parts", async () => {
    const credentials = buildCredentials("errors");
    const formatToPartsSpy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([
        { type: "day", value: "01" },
        { type: "month", value: "01" },
        { type: "year", value: "2026" },
        { type: "minute", value: "00" },
        { type: "second", value: "00" },
      ]);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => '{"message":"Missing hour"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

    await expect(
      smartAccountsRequest("/settings/accounts", "get", credentials),
    ).rejects.toThrow(
      "SmartAccounts GET /settings/accounts:get 400: Missing hour",
    );
    await expect(
      smartAccountsRequest("/settings/accounts", "get", credentials, {
        body: { active: true },
      }),
    ).rejects.toThrow(
      "SmartAccounts POST /settings/accounts:get 500: Internal Server Error",
    );

    await expect(
      smartAccountsRequest("/settings/accounts", "get", credentials, {
        query: { pageNumber: 1, optional: undefined },
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    formatToPartsSpy.mockRestore();
  });
});
