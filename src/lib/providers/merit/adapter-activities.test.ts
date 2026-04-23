import { beforeEach, expect, it, vi } from "vitest";
import type { ProviderRuntimeContext } from "../../accounting-provider-types";

const mocks = vi.hoisted(() => ({
  clearCachedValuesByPrefix: vi.fn(),
  getAccounts: vi.fn(),
  getBanks: vi.fn(),
  getPaymentTypes: vi.fn(),
  getTaxes: vi.fn(),
  getUnits: vi.fn(),
  meritRequest: vi.fn(),
  namespacedCacheKey: vi.fn(() => "cache:key"),
  validateMeritV2Access: vi.fn(),
  createVendor: vi.fn(),
  findExistingPurchaseInvoice: vi.fn(),
  findVendor: vi.fn(),
  getVendorInvoiceHistory: vi.fn(),
  listItems: vi.fn(),
}));

vi.mock("./core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./core")>();
  return {
    ...actual,
    clearCachedValuesByPrefix: mocks.clearCachedValuesByPrefix,
    getAccounts: mocks.getAccounts,
    getBanks: mocks.getBanks,
    getPaymentTypes: mocks.getPaymentTypes,
    getTaxes: mocks.getTaxes,
    getUnits: mocks.getUnits,
    meritRequest: mocks.meritRequest,
    namespacedCacheKey: mocks.namespacedCacheKey,
    validateMeritV2Access: mocks.validateMeritV2Access,
  };
});

vi.mock("./data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./data")>();
  return {
    ...actual,
    createVendor: mocks.createVendor,
    findExistingPurchaseInvoice: mocks.findExistingPurchaseInvoice,
    findVendor: mocks.findVendor,
    getVendorInvoiceHistory: mocks.getVendorInvoiceHistory,
    listItems: mocks.listItems,
  };
});

function buildContext(): Extract<
  ProviderRuntimeContext,
  { provider: "merit" }
> {
  return {
    provider: "merit",
    referenceData: { accounts: [], taxCodes: [], paymentAccounts: [] },
    raw: {
      accounts: [],
      taxes: [],
      banks: [],
      paymentTypes: [],
      units: [],
      items: [],
      vendors: [],
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
  mocks.validateMeritV2Access.mockResolvedValue(undefined);
  mocks.findVendor.mockResolvedValue({ id: "vendor-1", name: "Vendor OÜ" });
  mocks.createVendor.mockResolvedValue({ id: "vendor-2", name: "Vendor OÜ" });
  mocks.listItems.mockResolvedValue([
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
  mocks.getAccounts.mockResolvedValue([]);
  mocks.getTaxes.mockResolvedValue([]);
  mocks.getBanks.mockResolvedValue([]);
  mocks.getPaymentTypes.mockResolvedValue([]);
  mocks.getUnits.mockResolvedValue([]);
});

it("exposes merit vendor activities for the shared workflow", async () => {
  const { meritProviderAdapter } = await import("./adapter");

  await expect(
    meritProviderAdapter.findVendor(
      { apiId: "id", apiKey: "key" },
      { extraction: buildExtraction() },
      buildContext(),
    ),
  ).resolves.toEqual({ vendorId: "vendor-1", vendorName: "Vendor OÜ" });

  await expect(
    meritProviderAdapter.createVendor(
      { apiId: "id", apiKey: "key" },
      {
        extraction: buildExtraction(),
        referenceData: buildContext().referenceData,
      },
      buildContext(),
    ),
  ).resolves.toEqual({ vendorId: "vendor-2", vendorName: "Vendor OÜ" });
});

it("throws when merit createVendor does not return an id", async () => {
  const { meritProviderAdapter } = await import("./adapter");
  mocks.createVendor.mockResolvedValueOnce({ name: "Vendor OÜ" });

  await expect(
    meritProviderAdapter.createVendor(
      { apiId: "id", apiKey: "key" },
      {
        extraction: buildExtraction(),
        referenceData: buildContext().referenceData,
      },
      buildContext(),
    ),
  ).rejects.toThrow("Merit did not return a vendor id.");
});

it("returns null when merit vendor lookup does not find an id", async () => {
  const { meritProviderAdapter } = await import("./adapter");
  mocks.findVendor.mockResolvedValueOnce({ name: "Vendor OÜ" });
  mocks.findVendor.mockResolvedValueOnce(null);

  await expect(
    meritProviderAdapter.findVendor(
      { apiId: "id", apiKey: "key" },
      { extraction: buildExtraction() },
      buildContext(),
    ),
  ).resolves.toBeNull();
});

it("exposes merit article lookup activities for the shared workflow", async () => {
  const { meritProviderAdapter } = await import("./adapter");

  await expect(
    meritProviderAdapter.listArticles(
      { apiId: "id", apiKey: "key" },
      buildContext(),
    ),
  ).resolves.toHaveLength(1);
  await expect(
    meritProviderAdapter.getVendorArticleHistory(
      { apiId: "id", apiKey: "key" },
      {
        vendorId: "vendor-1",
        extraction: buildExtraction(),
      },
      buildContext(),
    ),
  ).resolves.toHaveLength(1);
});
