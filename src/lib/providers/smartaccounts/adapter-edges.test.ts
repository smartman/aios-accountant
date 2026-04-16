import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreatePurchaseInvoiceParams,
  FindOrCreateVendorParams,
  ProviderRuntimeContext,
  SmartAccountsCredentials,
} from "../../accounting-provider-types";

const mocks = vi.hoisted(() => ({
  choosePaymentAccount: vi.fn(),
  chooseRelevantArticle: vi.fn(),
  chooseUnpaidAccount: vi.fn(),
  createArticle: vi.fn(),
  createPayment: vi.fn(),
  createVendor: vi.fn(),
  createVendorInvoice: vi.fn(),
  findExistingVendorInvoice: vi.fn(),
  findVendor: vi.fn(),
  formatAccountLabel: vi.fn(
    (account: { code: string; description?: string }) =>
      `${account.code} - ${account.description ?? "Label"}`,
  ),
  getAccounts: vi.fn(),
  getArticles: vi.fn(),
  getBankAccounts: vi.fn(),
  getCashAccounts: vi.fn(),
  getVatPcs: vi.fn(),
  uploadDocumentAttachment: vi.fn(),
}));

vi.mock("./index", () => mocks);

function buildCredentials(): SmartAccountsCredentials {
  return {
    apiKey: "smart-api",
    secretKey: "smart-secret",
  };
}

function buildContext(): Extract<
  ProviderRuntimeContext,
  { provider: "smartaccounts" }
> {
  return {
    provider: "smartaccounts",
    referenceData: {
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
      taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [{ type: "BANK", name: "Main bank", currency: "EUR" }],
    },
    raw: {
      accounts: [{ code: "4000", type: "EXPENSE", description: "Services" }],
      vatPcs: [{ vatPc: "VAT22", percent: 22, description: "22% VAT" }],
      bankAccounts: [
        {
          name: "Main bank",
          currency: "EUR",
          account: "1020",
          forNetting: true,
        },
      ],
      cashAccounts: [{ name: "Cash desk", currency: "EUR", account: "1000" }],
      articles: [],
    },
  };
}

function buildVendorParams(): FindOrCreateVendorParams {
  return {
    extraction: {
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
    },
    rows: [],
    referenceData: buildContext().referenceData,
  };
}

function buildInvoiceParams(): CreatePurchaseInvoiceParams {
  return {
    vendorId: "vendor-1",
    extraction: buildVendorParams().extraction,
    rows: [
      {
        code: "ROW01",
        description: "Consulting",
        quantity: 1,
        unit: "pcs",
        price: 100,
        sum: 100,
        taxCode: "VAT22",
        accountCode: "4000",
        accountSelectionReason: "Matched services account.",
      },
    ],
    referenceData: buildContext().referenceData,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.choosePaymentAccount.mockReturnValue({
    type: "BANK",
    name: "Main bank",
    currency: "EUR",
    account: "1020",
  });
  mocks.chooseRelevantArticle.mockReturnValue(null);
  mocks.chooseUnpaidAccount.mockReturnValue({ code: "2000" });
  mocks.createArticle.mockResolvedValue({ code: "ROW01" });
  mocks.createPayment.mockResolvedValue({ paymentId: "payment-1" });
  mocks.createVendor.mockResolvedValue({ vendorId: "vendor-1" });
  mocks.createVendorInvoice.mockResolvedValue({ invoiceId: "invoice-1" });
  mocks.findExistingVendorInvoice.mockResolvedValue({ invoiceId: "invoice-1" });
  mocks.findVendor.mockResolvedValue(null);
  mocks.getAccounts.mockResolvedValue([
    { code: "4000", type: "EXPENSE", description: "Services" },
  ]);
  mocks.getArticles.mockResolvedValue([]);
  mocks.getBankAccounts.mockResolvedValue([
    { name: "Main bank", currency: "EUR", account: "1020" },
  ]);
  mocks.getCashAccounts.mockResolvedValue([
    { name: "Cash desk", currency: "EUR", account: "1000" },
  ]);
  mocks.getVatPcs.mockResolvedValue([
    { vatPc: "VAT22", percent: 22, description: "22% VAT" },
  ]);
  mocks.uploadDocumentAttachment.mockResolvedValue(undefined);
});

describe("smartaccounts adapter validation and context", () => {
  it("validates credentials and keeps short secrets unmasked", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    const summary = await smartAccountsProviderAdapter.validateCredentials({
      apiKey: "public",
      secretKey: "abc",
    });

    expect(summary.secretMasked).toBe("abc");
  });

  it("throws when SmartAccounts returns no accounts and normalizes the loaded context", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");
    mocks.getAccounts.mockResolvedValueOnce([]);

    await expect(
      smartAccountsProviderAdapter.validateCredentials(buildCredentials()),
    ).rejects.toThrow(
      "SmartAccounts returned no chart of accounts for these credentials.",
    );

    const context =
      await smartAccountsProviderAdapter.loadContext(buildCredentials());
    expect(context.referenceData.paymentAccounts).toEqual([
      { type: "BANK", name: "Main bank", currency: "EUR", accountCode: "1020" },
      { type: "CASH", name: "Cash desk", currency: "EUR", accountCode: "1000" },
    ]);
  });

  it("keeps optional account and VAT metadata undefined when SmartAccounts omits it", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");
    mocks.getAccounts.mockResolvedValueOnce([
      { code: "4999", description: "Misc" },
    ]);
    mocks.getVatPcs.mockResolvedValueOnce([{ vatPc: "VAT0" }]);
    mocks.getBankAccounts.mockResolvedValueOnce([]);
    mocks.getCashAccounts.mockResolvedValueOnce([]);

    const context =
      await smartAccountsProviderAdapter.loadContext(buildCredentials());

    expect(context.referenceData.accounts).toEqual([
      { code: "4999", type: undefined, label: "4999 - Misc" },
    ]);
    expect(context.referenceData.taxCodes).toEqual([
      {
        code: "VAT0",
        rate: undefined,
        description: undefined,
        purchaseAccountCode: undefined,
      },
    ]);
  });
});

describe("smartaccounts adapter vendor flows", () => {
  it("rejects invoices without a usable vendor search term", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    await expect(
      smartAccountsProviderAdapter.findOrCreateVendor(
        buildCredentials(),
        {
          ...buildVendorParams(),
          extraction: {
            ...buildVendorParams().extraction,
            vendor: {
              ...buildVendorParams().extraction.vendor,
              name: null,
              regCode: null,
              vatNumber: null,
            },
          },
        },
        buildContext(),
      ),
    ).rejects.toThrow("usable vendor name or registry code");
  });

  it("returns existing vendors and creates missing vendors with normalized payloads", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");
    mocks.findVendor.mockResolvedValueOnce({
      id: "vendor-existing",
      name: "Vendor OÜ",
    });

    const existing = await smartAccountsProviderAdapter.findOrCreateVendor(
      buildCredentials(),
      buildVendorParams(),
      buildContext(),
    );

    mocks.findVendor.mockResolvedValueOnce(null);
    const created = await smartAccountsProviderAdapter.findOrCreateVendor(
      buildCredentials(),
      {
        ...buildVendorParams(),
        extraction: {
          ...buildVendorParams().extraction,
          vendor: {
            ...buildVendorParams().extraction.vendor,
            name: null,
            countryCode: null,
            city: null,
            postalCode: null,
            addressLine1: null,
            addressLine2: null,
          },
        },
      },
      buildContext(),
    );

    expect(existing).toMatchObject({
      vendorId: "vendor-existing",
      createdVendor: false,
    });
    expect(created).toMatchObject({
      vendorId: "vendor-1",
      vendorName: "Unknown vendor",
      createdVendor: true,
    });
    expect(mocks.createVendor).toHaveBeenCalledWith(
      buildCredentials(),
      expect.objectContaining({
        name: "Unknown vendor",
        accountUnpaid: "2000",
        address: undefined,
      }),
    );
  });
});

describe("smartaccounts adapter invoice creation", () => {
  it("reuses exact and relevant article codes, creates missing ones, and validates invoice dates", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    const exactContext = {
      ...buildContext(),
      raw: {
        ...buildContext().raw,
        articles: [
          { code: "ROW01", description: "Consulting", activePurchase: true },
        ],
      },
    };
    await smartAccountsProviderAdapter.createPurchaseInvoice(
      buildCredentials(),
      buildInvoiceParams(),
      exactContext,
    );
    expect(mocks.createArticle).not.toHaveBeenCalled();

    mocks.chooseRelevantArticle.mockReturnValueOnce({ code: "ARTICLE01" });
    await smartAccountsProviderAdapter.createPurchaseInvoice(
      buildCredentials(),
      {
        ...buildInvoiceParams(),
        rows: [{ ...buildInvoiceParams().rows[0], code: "NEWROW" }],
      },
      buildContext(),
    );
    expect(mocks.createArticle).not.toHaveBeenCalled();

    await smartAccountsProviderAdapter.createPurchaseInvoice(
      buildCredentials(),
      {
        ...buildInvoiceParams(),
        rows: [{ ...buildInvoiceParams().rows[0], code: "CREATE01" }],
      },
      buildContext(),
    );
    expect(mocks.createArticle).toHaveBeenCalledOnce();

    await expect(
      smartAccountsProviderAdapter.createPurchaseInvoice(
        buildCredentials(),
        {
          ...buildInvoiceParams(),
          extraction: {
            ...buildInvoiceParams().extraction,
            invoice: {
              ...buildInvoiceParams().extraction.invoice,
              issueDate: null,
              entryDate: null,
            },
          },
        },
        buildContext(),
      ),
    ).rejects.toThrow("invoice date could not be extracted");
  });
});

describe("smartaccounts adapter invoice lookup", () => {
  it("looks up existing invoices with the default date fallback", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    await smartAccountsProviderAdapter.findExistingInvoice(
      buildCredentials(),
      {
        vendorId: "vendor-1",
        invoiceNumber: "INV-1",
        extraction: {
          ...buildVendorParams().extraction,
          invoice: {
            ...buildVendorParams().extraction.invoice,
            issueDate: null,
            entryDate: null,
          },
        },
      },
      buildContext(),
    );

    expect(mocks.findExistingVendorInvoice).toHaveBeenCalledWith(
      buildCredentials(),
      "vendor-1",
      "INV-1",
      "01.01.2000",
    );
  });

  it("passes through issue dates when they are already available", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    await smartAccountsProviderAdapter.findExistingInvoice(
      buildCredentials(),
      {
        vendorId: "vendor-1",
        invoiceNumber: "INV-2",
        extraction: buildVendorParams().extraction,
      },
      buildContext(),
    );

    expect(mocks.findExistingVendorInvoice).toHaveBeenLastCalledWith(
      buildCredentials(),
      "vendor-1",
      "INV-2",
      "14.04.2026",
    );
  });

  it("falls back to the entry date when the issue date is missing", async () => {
    const { smartAccountsProviderAdapter } = await import("./adapter");

    await smartAccountsProviderAdapter.findExistingInvoice(
      buildCredentials(),
      {
        vendorId: "vendor-1",
        invoiceNumber: "INV-3",
        extraction: {
          ...buildVendorParams().extraction,
          invoice: {
            ...buildVendorParams().extraction.invoice,
            issueDate: null,
            entryDate: "2026-04-15",
          },
        },
      },
      buildContext(),
    );

    expect(mocks.findExistingVendorInvoice).toHaveBeenLastCalledWith(
      buildCredentials(),
      "vendor-1",
      "INV-3",
      "15.04.2026",
    );
  });
});
