import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountLabel,
  asRecord,
  extractArray,
  getSmartAccountsCacheNamespace,
  isNonNull,
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
    ).rejects.toThrow("SmartAccounts 401: Denied");
    await expect(
      smartAccountsRequest(
        "/settings/accounts",
        "get",
        buildCredentials("text-error"),
      ),
    ).rejects.toThrow("SmartAccounts 500: Gateway failed");
    await expect(
      smartAccountsRequest("/settings/accounts", "get", {
        apiKey: "",
        secretKey: "",
      }),
    ).rejects.toThrow("SmartAccounts API key and secret key are required.");
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
    expect(toOptionalNumber(" 12,5 ")).toBe(12.5);
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

describe("smartaccounts-core resource loading", () => {
  it("normalizes accounts, VAT codes, bank accounts, cash accounts, and articles", async () => {
    const credentials = buildCredentials("resources");
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

      return jsonResponse({});
    });

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
  });
});
