import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  MeritCredentials,
  ProviderRuntimeContext,
} from "../../accounting-provider-types";
import type { InvoiceExtraction } from "../../invoice-import-types";

const mocks = vi.hoisted(() => ({
  clearCachedValuesByPrefix: vi.fn(),
  createVendor: vi.fn(),
  findExistingPurchaseInvoice: vi.fn(),
  findVendor: vi.fn(),
  getAccounts: vi.fn(),
  getBanks: vi.fn(),
  getPaymentTypes: vi.fn(),
  getTaxes: vi.fn(),
  getUnits: vi.fn(),
  getDimensions: vi.fn(),
  meritDate: vi.fn((value?: string | null) => (value ? "20260414" : undefined)),
  meritDateTime: vi.fn(() => "202604141200"),
  meritRequest: vi.fn(),
  namespacedCacheKey: vi.fn(
    (_credentials: MeritCredentials, key: string) => `ns:${key}`,
  ),
  toOptionalString: vi.fn((value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined,
  ),
  validateMeritV2Access: vi.fn(),
}));

vi.mock("./core", () => mocks);
vi.mock("./dimensions", () => ({
  getDimensions: mocks.getDimensions,
}));
vi.mock("./data", () => ({
  createVendor: mocks.createVendor,
  findExistingPurchaseInvoice: mocks.findExistingPurchaseInvoice,
  findVendor: mocks.findVendor,
}));

function buildCredentials(apiKey = "merit-key"): MeritCredentials {
  return {
    apiId: "merit-id",
    apiKey,
  };
}

function buildContext(): Extract<
  ProviderRuntimeContext,
  { provider: "merit" }
> {
  return {
    provider: "merit",
    referenceData: {
      accounts: [{ code: "4000", label: "4000 - Services" }],
      taxCodes: [{ code: "tax-22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [
        { id: "bank-1", type: "BANK", name: "Main bank", currency: "EUR" },
      ],
    },
    raw: {
      accounts: [{ code: "4000", name: "Services" }],
      taxes: [{ id: "tax-22", code: "22", name: "VAT", rate: 22 }],
      banks: [
        {
          id: "bank-1",
          name: "Main bank",
          currencyCode: "EUR",
          accountCode: "1020",
        },
      ],
      paymentTypes: [{ id: "ptype-1", name: "Main bank" }],
      units: [{ code: "tk", name: "tk" }],
      items: [],
      vendors: [],
      dimensions: [],
    },
  };
}

function buildVendorExtraction(): InvoiceExtraction {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: "12345678",
      vatNumber: null,
      bankAccount: "EE123",
      email: null,
      phone: null,
      countryCode: "EE",
      city: "Tallinn",
      postalCode: "10111",
      addressLine1: "Tartu mnt 1",
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: "REF-1",
      currency: "EUR",
      issueDate: "2026-04-14",
      dueDate: "2026-04-21",
      entryDate: "2026-04-14",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: "Consulting",
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-14",
      paymentAmount: 122,
      paymentChannelHint: "BANK",
      reason: "Card payment",
    },
    rows: [],
    warnings: [],
  };
}

function buildInvoiceParams(): CreatePurchaseInvoiceParams {
  return {
    vendorId: "vendor-1",
    extraction: buildVendorExtraction(),
    rows: [
      {
        code: "ROW01",
        description: "Consulting",
        quantity: 1,
        unit: "pcs",
        price: 100,
        sum: 100,
        taxCode: "tax-22",
        accountCode: "4000",
        accountSelectionReason: "Matched services account.",
      },
      {
        code: "ROW02",
        description: "Zero tax",
        quantity: 1,
        unit: "pcs",
        price: 10,
        sum: 10,
        taxCode: undefined,
        accountCode: "4000",
        accountSelectionReason: "No tax.",
      },
    ],
    referenceData: buildContext().referenceData,
  };
}

function buildPaymentParams(): CreatePaymentParams {
  return {
    invoiceId: "invoice-1",
    vendorId: "vendor-1",
    vendorName: "Vendor OÜ",
    extraction: buildVendorExtraction(),
    referenceData: buildContext().referenceData,
    paymentAccountName: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createVendor.mockResolvedValue({ id: "vendor-1", name: "Vendor OÜ" });
  mocks.findExistingPurchaseInvoice.mockResolvedValue({
    invoiceId: "invoice-1",
  });
  mocks.findVendor.mockResolvedValue(null);
  mocks.getAccounts.mockResolvedValue([{ code: "4000", name: "Services" }]);
  mocks.getBanks.mockResolvedValue([
    {
      id: "bank-1",
      name: "Main bank",
      currencyCode: "EUR",
      accountCode: "1020",
    },
  ]);
  mocks.getPaymentTypes.mockResolvedValue([
    { id: "ptype-1", name: "Main bank" },
  ]);
  mocks.getTaxes.mockResolvedValue([
    { id: "tax-22", code: "22", name: "VAT", rate: 22 },
  ]);
  mocks.getUnits.mockResolvedValue([{ code: "tk", name: "tk" }]);
  mocks.getDimensions.mockResolvedValue([]);
  mocks.meritRequest.mockResolvedValue({
    PIHId: "invoice-1",
    PaymentId: "payment-1",
  });
});

describe("merit adapter validation and context", () => {
  it("validates credentials and keeps short api keys readable in the summary", async () => {
    const { meritProviderAdapter } = await import("./index");

    const summary = await meritProviderAdapter.validateCredentials(
      buildCredentials("abc"),
    );

    expect(summary.secretMasked).toBe("abc");
    expect(mocks.validateMeritV2Access).toHaveBeenCalledOnce();
  });

  it("normalizes context from Merit helper loaders", async () => {
    const { meritProviderAdapter } = await import("./index");

    const context = await meritProviderAdapter.loadContext(buildCredentials());
    expect(context.provider).toBe("merit");
    if (context.provider !== "merit") {
      throw new Error("Expected Merit provider context.");
    }

    expect(context.referenceData.accounts).toEqual([
      { code: "4000", label: "4000 - Services" },
    ]);
    expect(context.referenceData.paymentAccounts[0]).toMatchObject({
      id: "bank-1",
      name: "Main bank",
    });
    expect(context.raw.units).toEqual([{ code: "tk", name: "tk" }]);
  });
});

describe("merit adapter vendor and invoice flows", () => {
  it("returns existing vendors and throws when a created vendor id is missing", async () => {
    const { meritProviderAdapter } = await import("./index");
    mocks.findVendor.mockResolvedValueOnce({
      id: "vendor-existing",
      name: "Vendor OÜ",
    });

    const existing = await meritProviderAdapter.findVendor(
      buildCredentials(),
      { extraction: buildVendorExtraction() },
      buildContext(),
    );
    expect(existing).toMatchObject({
      vendorId: "vendor-existing",
    });

    mocks.createVendor.mockResolvedValueOnce({ name: "Vendor OÜ" });

    await expect(
      meritProviderAdapter.createVendor(
        buildCredentials(),
        {
          extraction: buildVendorExtraction(),
          referenceData: buildContext().referenceData,
        },
        buildContext(),
      ),
    ).rejects.toThrow("Merit did not return a vendor id.");
  });

  it("falls back to name-based vendor search when registry lookup misses", async () => {
    const { meritProviderAdapter } = await import("./index");
    mocks.findVendor
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "vendor-name", name: "Vendor OÜ" });

    const result = await meritProviderAdapter.findVendor(
      buildCredentials(),
      { extraction: buildVendorExtraction() },
      buildContext(),
    );

    expect(result).toMatchObject({
      vendorId: "vendor-name",
    });
    expect(mocks.findVendor).toHaveBeenNthCalledWith(1, buildCredentials(), {
      regNo: "12345678",
      vatRegNo: null,
    });
    expect(mocks.findVendor).toHaveBeenNthCalledWith(2, buildCredentials(), {
      name: "Vendor OÜ",
    });
  });

  it("delegates existing invoice lookups to the Merit data helper", async () => {
    const { meritProviderAdapter } = await import("./index");

    await expect(
      meritProviderAdapter.findExistingInvoice(
        buildCredentials(),
        {
          vendorId: "vendor-1",
          invoiceNumber: "INV-1",
          extraction: buildVendorExtraction(),
        },
        buildContext(),
      ),
    ).resolves.toEqual({ invoiceId: "invoice-1" });
  });
});

describe("merit adapter invoice creation", () => {
  it("creates purchase invoices, skips non-PDF attachments, and validates returned ids", async () => {
    const { meritProviderAdapter } = await import("./index");

    const invoice = await meritProviderAdapter.createPurchaseInvoice(
      buildCredentials(),
      {
        ...buildInvoiceParams(),
        attachment: {
          filename: "invoice.png",
          mimeType: "image/png",
          fileContentBase64: "ZmFrZQ==",
        },
      },
      buildContext(),
    );

    expect(invoice).toEqual({ invoiceId: "invoice-1", attachedFile: false });
    expect(mocks.meritRequest).toHaveBeenCalledWith(
      "sendpurchinvoice",
      buildCredentials(),
      expect.objectContaining({
        RoundingAmount: 0,
        InvoiceRow: [
          expect.objectContaining({
            Item: expect.objectContaining({ UOMName: "tk" }),
          }),
          expect.objectContaining({
            Item: expect.objectContaining({ UOMName: "tk" }),
          }),
        ],
      }),
    );

    mocks.meritRequest.mockResolvedValueOnce({});
    await expect(
      meritProviderAdapter.createPurchaseInvoice(
        buildCredentials(),
        buildInvoiceParams(),
        buildContext(),
      ),
    ).rejects.toThrow("Merit did not return a purchase invoice id.");
    expect(mocks.clearCachedValuesByPrefix).toHaveBeenCalledTimes(2);

    mocks.meritRequest.mockResolvedValueOnce({ Id: "invoice-id" });
    await expect(
      meritProviderAdapter.createPurchaseInvoice(
        buildCredentials(),
        {
          ...buildInvoiceParams(),
          attachment: {
            filename: "invoice.pdf",
            mimeType: "application/pdf",
            fileContentBase64: "ZmFrZQ==",
          },
        },
        buildContext(),
      ),
    ).resolves.toEqual({ invoiceId: "invoice-id", attachedFile: true });

    mocks.meritRequest.mockResolvedValueOnce({ Id: "invoice-no-units" });
    await expect(
      meritProviderAdapter.createPurchaseInvoice(
        buildCredentials(),
        buildInvoiceParams(),
        {
          ...buildContext(),
          raw: {
            ...buildContext().raw,
            units: undefined,
          },
        },
      ),
    ).resolves.toEqual({ invoiceId: "invoice-no-units", attachedFile: false });
    expect(mocks.clearCachedValuesByPrefix).toHaveBeenCalledTimes(4);
  });
});

describe("merit adapter payment and attachment flows", () => {
  it("throws when no bank or amount is available and falls back to the invoice id for payment ids", async () => {
    const { meritProviderAdapter } = await import("./index");

    await expect(
      meritProviderAdapter.createPayment(
        buildCredentials(),
        buildPaymentParams(),
        {
          ...buildContext(),
          raw: {
            ...buildContext().raw,
            banks: [],
          },
        },
      ),
    ).rejects.toThrow("no usable bank account");

    await expect(
      meritProviderAdapter.createPayment(
        buildCredentials(),
        {
          ...buildPaymentParams(),
          extraction: {
            ...buildPaymentParams().extraction,
            payment: {
              ...buildPaymentParams().extraction.payment,
              paymentAmount: null,
            },
            invoice: {
              ...buildPaymentParams().extraction.invoice,
              totalAmount: null,
              amountExcludingVat: null,
            },
          },
        },
        buildContext(),
      ),
    ).rejects.toThrow("payment amount could not be determined");

    mocks.meritRequest.mockResolvedValueOnce({});
    const payment = await meritProviderAdapter.createPayment(
      buildCredentials(),
      {
        ...buildPaymentParams(),
        invoiceId: "invoice-fallback",
        extraction: {
          ...buildPaymentParams().extraction,
          invoice: {
            ...buildPaymentParams().extraction.invoice,
            currency: "USD",
          },
          payment: {
            ...buildPaymentParams().extraction.payment,
            paymentAmount: 122.456,
          },
        },
      },
      buildContext(),
    );

    expect(payment.paymentId).toBe("invoice-fallback");
    expect(mocks.meritRequest).toHaveBeenCalledWith(
      "sendPaymentV",
      buildCredentials(),
      expect.objectContaining({ Amount: 122.46, CurrencyCode: "USD" }),
    );

    mocks.meritRequest.mockResolvedValueOnce({ Id: "payment-id" });
    await expect(
      meritProviderAdapter.createPayment(
        buildCredentials(),
        {
          ...buildPaymentParams(),
          extraction: {
            ...buildPaymentParams().extraction,
            payment: {
              ...buildPaymentParams().extraction.payment,
              paymentDate: null,
            },
            invoice: {
              ...buildPaymentParams().extraction.invoice,
              currency: null,
              issueDate: null,
              entryDate: "2026-04-15",
            },
          },
        },
        buildContext(),
      ),
    ).resolves.toMatchObject({ paymentId: "payment-id" });
  });

  it("treats attachDocument as a no-op", async () => {
    const { meritProviderAdapter } = await import("./index");

    await expect(
      meritProviderAdapter.attachDocument(
        buildCredentials(),
        {
          invoiceId: "invoice-1",
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          fileContentBase64: "ZmFrZQ==",
        },
        buildContext(),
      ),
    ).resolves.toBeUndefined();
  });
});
