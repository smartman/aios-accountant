import { beforeEach, expect, it, vi } from "vitest";
import type {
  CreatePaymentParams,
  MeritCredentials,
  ProviderRuntimeContext,
} from "../../accounting-provider-types";

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
vi.mock("./data", () => ({
  createVendor: mocks.createVendor,
  findExistingPurchaseInvoice: mocks.findExistingPurchaseInvoice,
  findVendor: mocks.findVendor,
}));

function buildCredentials(): MeritCredentials {
  return {
    apiId: "merit-id",
    apiKey: "merit-key",
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
    },
  };
}

function buildPaymentParams(): CreatePaymentParams {
  return {
    invoiceId: "invoice-1",
    vendorId: "vendor-1",
    vendorName: "Vendor OÜ",
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
    referenceData: buildContext().referenceData,
    paymentAccountName: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.meritRequest.mockResolvedValue({
    PIHId: "invoice-1",
    PaymentId: "payment-1",
  });
});

it("uses an explicitly selected Merit payment account when provided", async () => {
  const { meritProviderAdapter } = await import("./index");
  const context = buildContext();
  context.raw.banks = [
    {
      id: "bank-1",
      name: "Main bank",
      currencyCode: "EUR",
      accountCode: "1020",
    },
    {
      id: "bank-2",
      name: "Reserve bank",
      currencyCode: "EUR",
      accountCode: "1030",
    },
  ];
  context.raw.paymentTypes = [
    { id: "ptype-1", name: "Main bank" },
    { id: "ptype-2", name: "Reserve bank" },
  ];

  await meritProviderAdapter.createPayment(
    buildCredentials(),
    {
      ...buildPaymentParams(),
      paymentAccountName: "Reserve bank",
    },
    context,
  );

  expect(mocks.meritRequest).toHaveBeenCalledWith(
    "sendPaymentV",
    buildCredentials(),
    expect.objectContaining({
      BankId: "bank-2",
    }),
  );
});

it("falls back to the default Merit bank when the selected account is missing", async () => {
  const { meritProviderAdapter } = await import("./index");

  await meritProviderAdapter.createPayment(
    buildCredentials(),
    {
      ...buildPaymentParams(),
      paymentAccountName: "Missing bank",
    },
    buildContext(),
  );

  expect(mocks.meritRequest).toHaveBeenCalledWith(
    "sendPaymentV",
    buildCredentials(),
    expect.objectContaining({
      BankId: "bank-1",
    }),
  );
});
