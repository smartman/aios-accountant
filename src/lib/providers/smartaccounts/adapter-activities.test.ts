import { beforeEach, expect, it, vi } from "vitest";
import type { ProviderRuntimeContext } from "../../accounting-provider-types";

const mocks = vi.hoisted(() => ({
  choosePaymentAccount: vi.fn(),
  chooseUnpaidAccount: vi.fn(),
  createArticle: vi.fn(),
  createPayment: vi.fn(),
  createVendor: vi.fn(),
  createVendorInvoice: vi.fn(),
  findExistingVendorInvoice: vi.fn(),
  findVendor: vi.fn(),
  formatAccountLabel: vi.fn(() => "4000 - Services"),
  getAccounts: vi.fn(),
  getArticles: vi.fn(),
  getBankAccounts: vi.fn(),
  getCashAccounts: vi.fn(),
  getVatPcs: vi.fn(),
  getVendorInvoiceHistory: vi.fn(),
  listCatalogArticles: vi.fn(),
  uploadDocumentAttachment: vi.fn(),
}));

vi.mock("./index", () => mocks);

function buildContext(): Extract<
  ProviderRuntimeContext,
  { provider: "smartaccounts" }
> {
  return {
    provider: "smartaccounts",
    referenceData: { accounts: [], taxCodes: [], paymentAccounts: [] },
    raw: {
      accounts: [{ code: "4000", type: "EXPENSE", description: "Services" }],
      vatPcs: [],
      bankAccounts: [],
      cashAccounts: [],
      articles: [],
    },
  };
}

function buildExtraction() {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice" as const,
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [],
    warnings: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findVendor.mockResolvedValue({ id: "vendor-1", name: "Vendor OÜ" });
  mocks.createVendor.mockResolvedValue({ vendorId: "vendor-2" });
  mocks.listCatalogArticles.mockResolvedValue([
    { code: "FURNITURE", description: "Furniture" },
  ]);
  mocks.getVendorInvoiceHistory.mockResolvedValue([
    {
      invoiceId: "hist-1",
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
      description: "Office chair",
      articleCode: "FURNITURE",
    },
  ]);
  mocks.createArticle.mockResolvedValue({ code: "FURNITURE" });
  mocks.chooseUnpaidAccount.mockReturnValue({ code: "2000" });
});

it("exposes SmartAccounts vendor activities for the shared workflow", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");

  await expect(
    smartAccountsProviderAdapter.findVendor(
      { apiKey: "public", secretKey: "secret" },
      { extraction: buildExtraction() },
      buildContext(),
    ),
  ).resolves.toEqual({ vendorId: "vendor-1", vendorName: "Vendor OÜ" });

  await expect(
    smartAccountsProviderAdapter.createVendor(
      { apiKey: "public", secretKey: "secret" },
      {
        extraction: buildExtraction(),
        referenceData: buildContext().referenceData,
      },
      buildContext(),
    ),
  ).resolves.toEqual({ vendorId: "vendor-2", vendorName: "Vendor OÜ" });
});

it("returns null when SmartAccounts vendor lookup has no usable search term", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");
  const extraction = buildExtraction();
  extraction.vendor.name = "";

  await expect(
    smartAccountsProviderAdapter.findVendor(
      { apiKey: "public", secretKey: "secret" },
      { extraction },
      buildContext(),
    ),
  ).resolves.toBeNull();
});

it("exposes SmartAccounts article activities for the shared workflow", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");

  await expect(
    smartAccountsProviderAdapter.listArticles(
      { apiKey: "public", secretKey: "secret" },
      buildContext(),
    ),
  ).resolves.toHaveLength(1);
  await expect(
    smartAccountsProviderAdapter.getVendorArticleHistory(
      { apiKey: "public", secretKey: "secret" },
      {
        vendorId: "vendor-1",
        extraction: buildExtraction(),
      },
      buildContext(),
    ),
  ).resolves.toHaveLength(1);
  await expect(
    smartAccountsProviderAdapter.createArticle(
      { apiKey: "public", secretKey: "secret" },
      {
        code: "FURNITURE",
        description: "Furniture",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
        type: "SERVICE",
      },
      buildContext(),
    ),
  ).resolves.toEqual(
    expect.objectContaining({
      code: "FURNITURE",
      description: "Furniture",
    }),
  );
});
