import { beforeEach, expect, it, vi } from "vitest";
import type {
  CreatePaymentParams,
  ProviderRuntimeContext,
  SmartAccountsCredentials,
} from "../../accounting-provider-types";

const mocks = vi.hoisted(() => ({
  choosePaymentAccount: vi.fn(),
  chooseRelevantArticle: vi.fn(),
  chooseUnpaidAccount: vi.fn(),
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
  mocks.choosePaymentAccount.mockReturnValue({
    type: "BANK",
    name: "Main bank",
    currency: "EUR",
    account: "1020",
  });
  mocks.createPayment.mockResolvedValue({ paymentId: "payment-1" });
  mocks.uploadDocumentAttachment.mockResolvedValue(undefined);
});

it("throws when no payment account or amount can be resolved", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");
  mocks.choosePaymentAccount.mockReturnValueOnce(null);

  await expect(
    smartAccountsProviderAdapter.createPayment(
      buildCredentials(),
      buildPaymentParams(),
      buildContext(),
    ),
  ).rejects.toThrow("no usable bank or cash account");

  mocks.choosePaymentAccount.mockReturnValueOnce({
    type: "BANK",
    name: "Main bank",
    currency: "EUR",
    account: "1020",
  });

  await expect(
    smartAccountsProviderAdapter.createPayment(
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
});

it("uses an explicitly selected SmartAccounts payment account when provided", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");
  mocks.choosePaymentAccount
    .mockReturnValueOnce({
      type: "CASH",
      name: "Cash desk",
      currency: "EUR",
      account: "1000",
    })
    .mockReturnValueOnce({
      type: "BANK",
      name: "Main bank",
      currency: "EUR",
      account: "1020",
    });

  const payment = await smartAccountsProviderAdapter.createPayment(
    buildCredentials(),
    {
      ...buildPaymentParams(),
      paymentAccountName: "Cash desk",
    },
    buildContext(),
  );

  expect(mocks.choosePaymentAccount).toHaveBeenNthCalledWith(1, {
    bankAccounts: [],
    cashAccounts: [{ name: "Cash desk", currency: "EUR", account: "1000" }],
    currency: "EUR",
    channelHint: "BANK",
  });
  expect(mocks.createPayment).toHaveBeenCalledWith(
    buildCredentials(),
    expect.objectContaining({
      accountType: "CASH",
      accountName: "Cash desk",
    }),
  );
  expect(payment.paymentAccount).toMatchObject({
    type: "CASH",
    name: "Cash desk",
    accountCode: "1000",
  });
});

it("maps payment payloads and document uploads through the SmartAccounts helpers", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");

  const payment = await smartAccountsProviderAdapter.createPayment(
    buildCredentials(),
    {
      ...buildPaymentParams(),
      extraction: {
        ...buildPaymentParams().extraction,
        invoice: {
          ...buildPaymentParams().extraction.invoice,
          currency: "USD",
          invoiceNumber: null,
        },
        payment: {
          ...buildPaymentParams().extraction.payment,
          paymentAmount: 122.456,
        },
      },
    },
    buildContext(),
  );

  await smartAccountsProviderAdapter.attachDocument(
    buildCredentials(),
    {
      invoiceId: "invoice-1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "ZmFrZQ==",
    },
    buildContext(),
  );

  expect(mocks.createPayment).toHaveBeenCalledWith(
    buildCredentials(),
    expect.objectContaining({
      accountName: "Main bank",
      currency: "USD",
      amount: 122.46,
      document: undefined,
      rows: [
        expect.objectContaining({
          amount: 122.46,
        }),
      ],
    }),
  );
  expect(payment).toEqual({
    paymentId: "payment-1",
    paymentAccount: {
      type: "BANK",
      name: "Main bank",
      currency: "EUR",
      accountCode: "1020",
    },
  });
  expect(mocks.uploadDocumentAttachment).toHaveBeenCalledOnce();
});

it("defaults missing payment dates and currency values in payment payloads", async () => {
  const { smartAccountsProviderAdapter } = await import("./adapter");

  await smartAccountsProviderAdapter.createPayment(
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
          entryDate: null,
          invoiceNumber: null,
        },
      },
    },
    buildContext(),
  );

  expect(mocks.createPayment).toHaveBeenCalledWith(
    buildCredentials(),
    expect.objectContaining({
      date: undefined,
      currency: "EUR",
      document: undefined,
      rows: [
        expect.objectContaining({
          description: "Imported invoice payment",
        }),
      ],
    }),
  );
});
