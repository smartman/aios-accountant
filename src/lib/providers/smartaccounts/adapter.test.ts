import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  FindExistingInvoiceParams,
  FindOrCreateVendorParams,
  ProviderRuntimeContext,
  SmartAccountsCredentials,
} from "../../accounting-provider-types";
import { smartAccountsProviderAdapter } from "./adapter";

function responseJson(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function buildCredentials(seed: string): SmartAccountsCredentials {
  return {
    apiKey: `smart-api-${seed}`,
    secretKey: `smart-secret-${seed}`,
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
    referenceData: {
      accounts: [],
      taxCodes: [],
      paymentAccounts: [],
    },
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("smartAccountsProviderAdapter credential handling", () => {
  it("validates credentials and loads normalized context", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("/settings/accounts:get")) {
          return responseJson({
            accounts: [
              {
                code: "4000",
                descriptionEt: "Teenused",
                descriptionEn: "Services",
                type: "EXPENSE",
              },
            ],
          });
        }
        if (url.includes("/settings/vatpcs:get")) {
          return responseJson({
            vatPcs: [{ vatPc: "VAT22", percent: 22, descriptionEn: "22% VAT" }],
          });
        }
        if (url.includes("/settings/bankaccounts:get")) {
          return responseJson({
            bankAccounts: [
              {
                name: "Main bank",
                currency: "EUR",
                account: "1020",
                forNetting: true,
              },
            ],
          });
        }
        if (url.includes("/settings/cashaccounts:get")) {
          return responseJson({
            cashAccounts: [
              { name: "Cash desk", currency: "EUR", account: "1000" },
            ],
          });
        }
        if (url.includes("/purchasesales/articles:get")) {
          return responseJson({ articles: [] });
        }

        return responseJson({});
      });

    const credentials = buildCredentials("validate");
    const summary =
      await smartAccountsProviderAdapter.validateCredentials(credentials);
    const context = await smartAccountsProviderAdapter.loadContext(credentials);

    expect(summary).toMatchObject({
      provider: "smartaccounts",
      label: "SmartAccounts",
      publicId: credentials.apiKey,
    });
    expect(context.referenceData.accounts[0].label).toContain("Services");
    expect(context.referenceData.paymentAccounts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("smartAccountsProviderAdapter vendor operations", () => {
  it("finds or creates vendors through SmartAccounts APIs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        responseJson({ vendors: [{ id: "vendor-1", name: "Vendor OÜ" }] }),
      )
      .mockResolvedValueOnce(responseJson({ vendors: [] }))
      .mockResolvedValueOnce(responseJson({ vendorId: "vendor-2" }));

    const existing = await smartAccountsProviderAdapter.findOrCreateVendor(
      buildCredentials("existing"),
      buildVendorParams(),
      buildContext(),
    );
    const created = await smartAccountsProviderAdapter.findOrCreateVendor(
      buildCredentials("create"),
      buildVendorParams(),
      buildContext(),
    );

    expect(existing).toMatchObject({
      vendorId: "vendor-1",
      createdVendor: false,
    });
    expect(created).toMatchObject({
      vendorId: "vendor-2",
      createdVendor: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("smartAccountsProviderAdapter invoice flows", () => {
  it("creates purchase invoices, payments, and attachments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(responseJson({ code: "ROW01" }))
      .mockResolvedValueOnce(responseJson({ invoiceId: "invoice-1" }))
      .mockResolvedValueOnce(responseJson({ paymentId: "payment-1" }))
      .mockResolvedValueOnce(responseJson({ ok: true }));

    const invoiceParams: CreatePurchaseInvoiceParams = {
      vendorId: "vendor-1",
      extraction: buildVendorParams().extraction,
      rows: [
        {
          code: "ROW01",
          description: "Consulting services",
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
      attachment: undefined,
    };
    const paymentParams: CreatePaymentParams = {
      invoiceId: "invoice-1",
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
      extraction: buildVendorParams().extraction,
      referenceData: buildContext().referenceData,
    };

    const invoice = await smartAccountsProviderAdapter.createPurchaseInvoice(
      buildCredentials("invoice"),
      invoiceParams,
      buildContext(),
    );
    const payment = await smartAccountsProviderAdapter.createPayment(
      buildCredentials("payment"),
      paymentParams,
      buildContext(),
    );
    await smartAccountsProviderAdapter.attachDocument(
      buildCredentials("attach"),
      {
        invoiceId: "invoice-1",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "ZmFrZQ==",
      },
      buildContext(),
    );

    expect(invoice).toEqual({
      invoiceId: "invoice-1",
      attachedFile: false,
    });
    expect(payment).toEqual({
      paymentId: "payment-1",
      paymentAccount: {
        type: "BANK",
        name: "Main bank",
        currency: "EUR",
        accountCode: "1020",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("smartAccountsProviderAdapter payment guards", () => {
  it("looks up existing invoices and surfaces payment preconditions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      responseJson({
        vendorInvoices: [{ invoiceId: "invoice-1" }],
      }),
    );

    const existing = await smartAccountsProviderAdapter.findExistingInvoice(
      buildCredentials("lookup"),
      {
        vendorId: "vendor-1",
        invoiceNumber: "INV-1",
        extraction: buildVendorParams().extraction,
      } satisfies FindExistingInvoiceParams,
      buildContext(),
    );

    expect(existing).toEqual({ invoiceId: "invoice-1" });

    await expect(
      smartAccountsProviderAdapter.createPayment(
        buildCredentials("no-account"),
        {
          invoiceId: "invoice-1",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          extraction: {
            ...buildVendorParams().extraction,
            payment: {
              ...buildVendorParams().extraction.payment,
              paymentAmount: null,
            },
            invoice: {
              ...buildVendorParams().extraction.invoice,
              totalAmount: null,
              amountExcludingVat: null,
            },
          },
          referenceData: buildContext().referenceData,
        },
        {
          ...buildContext(),
          raw: {
            ...buildContext().raw,
            bankAccounts: [],
            cashAccounts: [],
          },
        },
      ),
    ).rejects.toThrow("SmartAccounts has no usable bank or cash account");

    await expect(
      smartAccountsProviderAdapter.createPayment(
        buildCredentials("no-amount"),
        {
          invoiceId: "invoice-1",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          extraction: {
            ...buildVendorParams().extraction,
            payment: {
              ...buildVendorParams().extraction.payment,
              paymentAmount: null,
            },
            invoice: {
              ...buildVendorParams().extraction.invoice,
              totalAmount: null,
              amountExcludingVat: null,
            },
          },
          referenceData: buildContext().referenceData,
        },
        buildContext(),
      ),
    ).rejects.toThrow("payment amount could not be determined");
  });
});
