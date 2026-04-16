import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseFallbackPurchaseAccount,
  choosePaymentAccount,
  chooseRelevantArticle,
  chooseUnpaidAccount,
  createArticle,
  createPayment,
  createVendor,
  createVendorInvoice,
  findAccountByCode,
  findArticleByCode,
  findExistingVendorInvoice,
  findVendor,
  formatAccountLabel,
} from "./data";
import { uploadDocumentAttachment } from "./attachments";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("smartaccounts-data account utilities", () => {
  it("selects unpaid, payment, fallback, and formatted accounts", () => {
    expect(
      chooseUnpaidAccount([
        { code: "2000", type: "LIABILITY", descriptionEn: "Accounts payable" },
        { code: "1000", type: "ASSET", descriptionEn: "Cash" },
      ]),
    )?.toMatchObject({ code: "2000" });

    expect(
      choosePaymentAccount({
        bankAccounts: [
          { name: "Main bank", currency: "EUR", forNetting: true, order: "2" },
        ],
        cashAccounts: [{ name: "Cash desk", currency: "USD", order: "1" }],
        currency: "EUR",
        channelHint: "BANK",
      }),
    ).toMatchObject({ type: "BANK", name: "Main bank" });

    expect(
      findAccountByCode([{ code: "4000", descriptionEn: "Services" }], "4000")
        ?.code,
    ).toBe("4000");
    expect(
      findAccountByCode([{ code: "4000", descriptionEn: "Services" }], null),
    ).toBeNull();

    expect(
      chooseFallbackPurchaseAccount({
        accounts: [
          { code: "4000", type: "EXPENSE", descriptionEn: "Services" },
          { code: "1000", type: "ASSET", descriptionEn: "Assets" },
        ],
        descriptions: ["consulting services"],
      }),
    )?.toMatchObject({ code: "4000" });

    expect(formatAccountLabel(null)).toBe("Unknown account");
    expect(formatAccountLabel({ code: "4000" })).toBe("4000");
  });

  it("ranks relevant purchase articles and filters inactive or mismatched ones", () => {
    const article = chooseRelevantArticle({
      articles: [
        {
          code: "ROW01",
          description: "Consulting services",
          activePurchase: true,
          accountPurchase: "4000",
          unit: "pcs",
          vatPc: "VAT22",
        },
        {
          code: "ROW02",
          description: "Consulting services",
          activePurchase: false,
          accountPurchase: "4000",
        },
        {
          code: "ROW03",
          description: "Different account",
          activePurchase: true,
          accountPurchase: "5000",
        },
      ],
      description: "Consulting services",
      accountPurchase: "4000",
      unit: "pcs",
      vatPc: "VAT22",
    });

    expect(article?.code).toBe("ROW01");
    expect(
      chooseRelevantArticle({
        articles: [
          {
            code: "ROW02",
            description: "Other service",
            activePurchase: false,
          },
        ],
        description: "Consulting services",
        accountPurchase: "4000",
      }),
    ).toBeNull();
    expect(
      choosePaymentAccount({
        bankAccounts: [
          { name: "EUR bank", currency: "EUR", defaultEInvoiceAccount: true },
        ],
        cashAccounts: [{ name: "USD cash", currency: "USD" }],
        currency: "USD",
        channelHint: "CASH",
      }),
    )?.toMatchObject({ type: "CASH", name: "USD cash" });
  });
});

describe("smartaccounts-data vendor and article operations", () => {
  it("returns null when vendor search results are empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ vendors: [] }),
    );

    await expect(
      findVendor(buildCredentials("vendor-empty"), "Missing Vendor"),
    ).resolves.toBeNull();
  });

  it("finds and caches vendors created through the API", async () => {
    const credentials = buildCredentials("vendor");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ vendorId: "vendor-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ vendors: [{ id: "vendor-1", name: "Vendor OÜ" }] }),
      );

    await expect(
      createVendor(credentials, {
        name: "Vendor OÜ",
        regCode: "12345678",
      }),
    ).resolves.toEqual({ vendorId: "vendor-1" });
    await expect(findVendor(credentials, "12345678")).resolves.toMatchObject({
      id: "vendor-1",
    });
    await expect(findVendor(credentials, "Vendor OÜ")).resolves.toMatchObject({
      id: "vendor-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when a created vendor id is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));

    await expect(
      createVendor(buildCredentials("vendor-error"), { name: "Vendor OÜ" }),
    ).rejects.toThrow("SmartAccounts did not return a vendor id.");
  });

  it("creates name-only vendors without registry-code cache entries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ vendorId: "vendor-name-only" }),
    );

    await expect(
      createVendor(buildCredentials("vendor-name-only"), { name: "Vendor OÜ" }),
    ).resolves.toEqual({
      vendorId: "vendor-name-only",
    });
  });

  it("reuses cached articles, falls back to remote lookup, and validates created article ids", async () => {
    const credentials = buildCredentials("article");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          articles: [{ code: "ROW01", description: "Cached article" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          articles: [{ code: "ROW02", description: "Remote article" }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ code: "ROW03" }))
      .mockResolvedValueOnce(jsonResponse({ articles: [] }));

    await expect(
      findArticleByCode(credentials, "ROW01"),
    ).resolves.toMatchObject({ code: "ROW01" });
    await expect(
      findArticleByCode(credentials, "ROW02"),
    ).resolves.toMatchObject({ code: "ROW02" });
    await expect(
      createArticle(credentials, { description: "Missing code" }),
    ).rejects.toThrow("SmartAccounts did not return an article code.");
    await expect(
      createArticle(credentials, { description: "Created" }),
    ).resolves.toEqual({ code: "ROW03" });
    await expect(findArticleByCode(credentials, "MISSING")).resolves.toBeNull();
  });

  it("drops invalid remote article rows while looking up article codes", async () => {
    const credentials = buildCredentials("article-invalid");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ articles: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ articles: [null, { description: "Missing code" }] }),
      );

    await expect(findArticleByCode(credentials, "ROW404")).resolves.toBeNull();
  });
});

describe("smartaccounts-data invoice and payment APIs", () => {
  it("handles vendor invoice lookups and validates returned identifiers", async () => {
    const credentials = buildCredentials("invoice");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ vendorInvoices: [{ invoiceId: "invoice-1" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ vendorInvoices: [{}] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ invoiceId: "invoice-2" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ paymentId: "payment-1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(
      findExistingVendorInvoice(credentials, "vendor-1", "INV-1", "14.04.2026"),
    ).resolves.toEqual({
      invoiceId: "invoice-1",
    });
    await expect(
      findExistingVendorInvoice(credentials, "vendor-1", "INV-2", "14.04.2026"),
    ).resolves.toBeNull();
    await expect(
      createVendorInvoice(credentials, { vendorId: "vendor-1" }),
    ).rejects.toThrow("SmartAccounts did not return an invoice id.");
    await expect(
      createVendorInvoice(credentials, { vendorId: "vendor-1" }),
    ).resolves.toEqual({
      invoiceId: "invoice-2",
    });
    await expect(
      createPayment(credentials, { invoiceId: "invoice-2" }),
    ).rejects.toThrow("SmartAccounts did not return a payment id.");
    await expect(
      createPayment(credentials, { invoiceId: "invoice-2" }),
    ).resolves.toEqual({
      paymentId: "payment-1",
    });
    await expect(
      uploadDocumentAttachment({
        credentials,
        docId: "invoice-2",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "ZmFrZQ==",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns null when no vendor invoices are present", async () => {
    const credentials = buildCredentials("invoice-empty");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ vendorInvoices: [] }),
    );

    await expect(
      findExistingVendorInvoice(credentials, "vendor-1", "INV-1", "14.04.2026"),
    ).resolves.toBeNull();
  });
});

describe("smartaccounts-data uncovered helper branches", () => {
  it("returns the first fallback account when scores are zero and null when there are no candidates", () => {
    expect(
      chooseFallbackPurchaseAccount({
        accounts: [
          { code: "4000", type: "EXPENSE", descriptionEn: "Services" },
        ],
        descriptions: ["", "no overlap"],
      }),
    )?.toMatchObject({ code: "4000" });
    expect(
      chooseFallbackPurchaseAccount({
        accounts: [
          { code: "2000", type: "LIABILITY", descriptionEn: "Liability" },
        ],
        descriptions: ["no overlap"],
      }),
    ).toBeNull();
  });

  it("returns null when article scoring produces no usable match", () => {
    expect(
      chooseRelevantArticle({
        articles: [{ code: "ROW99", description: "Different" }],
        description: "Consulting services",
        accountPurchase: "4000",
      }),
    ).toBeNull();
    expect(
      choosePaymentAccount({
        bankAccounts: [],
        cashAccounts: [],
        currency: "EUR",
        channelHint: null,
      }),
    ).toBeNull();
  });

  it("sorts competing article candidates by account, unit, and VAT matches", () => {
    expect(
      chooseRelevantArticle({
        articles: [
          {
            code: "ROW01",
            description: "Consulting services",
            accountPurchase: "4000",
            unit: "pcs",
            vatPc: "VAT22",
          },
          {
            code: "ROW02",
            description: "Consulting services",
            accountPurchase: "4000",
          },
        ],
        description: "Consulting services",
        accountPurchase: "4000",
        unit: "pcs",
        vatPc: "VAT22",
      }),
    )?.toMatchObject({ code: "ROW01" });
  });
});
