import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreatePurchaseInvoiceParams,
  FindExistingInvoiceParams,
  FindOrCreateVendorParams,
  MeritCredentials,
  ProviderRuntimeContext,
} from "../../accounting-provider-types";
import { clearMeritCachesForTests, meritProviderAdapter } from "./index";

type MeritRuntimeContext = Extract<
  ProviderRuntimeContext,
  { provider: "merit" }
>;

function buildVendorParams(): FindOrCreateVendorParams {
  return {
    extraction: {
      vendor: {
        name: "Vendor OÜ",
        regCode: "12345678",
        vatNumber: null,
        bankAccount: null,
        email: null,
        phone: null,
        countryCode: "EE",
        city: "Tallinn",
        postalCode: null,
        addressLine1: null,
        addressLine2: null,
      },
      invoice: {
        documentType: "invoice",
        invoiceNumber: "INV-1",
        referenceNumber: null,
        currency: "EUR",
        issueDate: "2026-04-14",
        dueDate: "2026-04-21",
        entryDate: "2026-04-14",
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
    },
    rows: [],
    referenceData: {
      accounts: [],
      taxCodes: [],
      paymentAccounts: [],
    },
  };
}

function buildFindInvoiceParams(): FindExistingInvoiceParams {
  return {
    vendorId: "vendor-1",
    invoiceNumber: "INV-1",
    extraction: {
      vendor: {
        name: "Vendor OÜ",
        regCode: "12345678",
        vatNumber: null,
        bankAccount: null,
        email: null,
        phone: null,
        countryCode: "EE",
        city: "Tallinn",
        postalCode: null,
        addressLine1: null,
        addressLine2: null,
      },
      invoice: {
        documentType: "invoice",
        invoiceNumber: "INV-1",
        referenceNumber: null,
        currency: "EUR",
        issueDate: "2026-04-14",
        dueDate: "2026-04-21",
        entryDate: "2026-04-14",
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
    },
  };
}

function buildMeritContext(): MeritRuntimeContext {
  return {
    provider: "merit",
    referenceData: {
      accounts: [{ code: "4000", label: "4000 - Services" }],
      taxCodes: [{ code: "tax-22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [],
    },
    raw: {
      accounts: [],
      taxes: [{ id: "tax-22", code: "22", rate: 22 }],
      banks: [],
      paymentTypes: [],
      units: [{ code: "tk", name: "tk" }],
      vendors: [],
    },
  };
}

const credentials: MeritCredentials = {
  apiId: "merit-id",
  apiKey: "merit-key",
};

afterEach(() => {
  vi.restoreAllMocks();
  clearMeritCachesForTests();
});

describe("merit cache invalidation", () => {
  it("reuses a newly created vendor on the next lookup", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Id: "vendor-1",
          Name: "Vendor OÜ",
        }),
      } as Response);

    const first = await meritProviderAdapter.findOrCreateVendor(
      credentials,
      buildVendorParams(),
      buildMeritContext(),
    );
    const second = await meritProviderAdapter.findOrCreateVendor(
      credentials,
      buildVendorParams(),
      buildMeritContext(),
    );

    expect(first.createdVendor).toBe(true);
    expect(second.createdVendor).toBe(false);
    expect(second.vendorId).toBe("vendor-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears cached invoice searches after creating a purchase invoice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          PIHId: "invoice-1",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            PIHId: "invoice-1",
            BillNo: "INV-1",
            VendorId: "vendor-1",
          },
        ],
      } as Response);

    const beforeCreate = await meritProviderAdapter.findExistingInvoice(
      credentials,
      buildFindInvoiceParams(),
      buildMeritContext(),
    );

    const createParams: CreatePurchaseInvoiceParams = {
      vendorId: "vendor-1",
      extraction: buildFindInvoiceParams().extraction,
      rows: [
        {
          code: "ROW01",
          description: "Consulting services",
          quantity: 1,
          unit: "pcs",
          price: 100,
          sum: 100,
          taxCode: "tax-22",
          accountCode: "4000",
          accountSelectionReason: "Matched services expense account.",
        },
      ],
      referenceData: buildMeritContext().referenceData,
      attachment: undefined,
    };

    await meritProviderAdapter.createPurchaseInvoice(
      credentials,
      createParams,
      buildMeritContext(),
    );

    const afterCreate = await meritProviderAdapter.findExistingInvoice(
      credentials,
      buildFindInvoiceParams(),
      buildMeritContext(),
    );

    expect(beforeCreate).toBeNull();
    expect(afterCreate).toEqual({ invoiceId: "invoice-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("merit context loading", () => {
  it("validates credentials and loads normalized context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/getpaymenttypes?")) {
        return {
          ok: true,
          json: async () => [{ Id: "ptype-1", Name: "Main bank" }],
        } as Response;
      }

      if (url.includes("/getpurchorders?")) {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url.includes("/getaccounts?")) {
        return {
          ok: true,
          json: async () => [
            { AccountID: "1", Code: "4000", Name: "Services" },
          ],
        } as Response;
      }

      if (url.includes("/gettaxes?")) {
        return {
          ok: true,
          json: async () => [
            { Id: "tax-22", Code: "22", Name: "VAT", TaxPct: 22 },
          ],
        } as Response;
      }

      if (url.includes("/getbanks?")) {
        return {
          ok: true,
          json: async () => [
            { BankId: "bank-1", Name: "Main bank", CurrencyCode: "EUR" },
          ],
        } as Response;
      }

      if (url.includes("/getunits?")) {
        return {
          ok: true,
          json: async () => [{ Code: "tk", Name: "tk" }],
        } as Response;
      }

      return {
        ok: true,
        json: async () => [],
      } as Response;
    });

    const summary = await meritProviderAdapter.validateCredentials(credentials);
    const context = await meritProviderAdapter.loadContext(credentials);
    expect(context.provider).toBe("merit");
    if (context.provider !== "merit") {
      throw new Error("Expected Merit provider context.");
    }

    expect(summary.label).toBe("Merit");
    expect(summary.publicId).toBe("merit-id");
    expect(context.referenceData.accounts).toEqual([
      { code: "4000", label: "4000 - Services" },
    ]);
    expect(context.referenceData.taxCodes[0]).toMatchObject({
      code: "tax-22",
      rate: 22,
    });
    expect(context.referenceData.paymentAccounts[0]).toMatchObject({
      id: "bank-1",
      name: "Main bank",
    });
    expect(context.raw.units).toEqual([{ code: "tk", name: "tk" }]);
  });
});

describe("merit vendor and invoice operations", () => {
  it("creates a new vendor when no existing match is found", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Id: "vendor-2",
          Name: "Vendor OÜ",
        }),
      } as Response);

    const result = await meritProviderAdapter.findOrCreateVendor(
      credentials,
      buildVendorParams(),
      buildMeritContext(),
    );

    expect(result).toMatchObject({
      vendorId: "vendor-2",
      createdVendor: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates purchase invoices and reuses the payment id fallback", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          BillId: "invoice-2",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          PaymentId: "payment-2",
        }),
      } as Response);

    const invoice = await meritProviderAdapter.createPurchaseInvoice(
      credentials,
      {
        ...buildFindInvoiceParams(),
        vendorId: "vendor-1",
        rows: [
          {
            code: "ROW01",
            description: "Consulting services",
            quantity: 1,
            unit: "pcs",
            price: 100,
            sum: 100,
            taxCode: "tax-22",
            accountCode: "4000",
            accountSelectionReason: "Matched services expense account.",
          },
        ],
        referenceData: buildMeritContext().referenceData,
        attachment: {
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          fileContentBase64: "ZmFrZQ==",
        },
      },
      buildMeritContext(),
    );

    const payment = await meritProviderAdapter.createPayment(
      credentials,
      {
        invoiceId: "invoice-2",
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
        extraction: buildVendorParams().extraction,
        referenceData: buildMeritContext().referenceData,
      },
      {
        ...buildMeritContext(),
        raw: {
          ...buildMeritContext().raw,
          banks: [{ id: "bank-1", name: "Main bank", currencyCode: "EUR" }],
          paymentTypes: [{ id: "ptype-1", name: "Main bank" }],
        },
      },
    );

    expect(invoice).toEqual({
      invoiceId: "invoice-2",
      attachedFile: true,
    });
    expect(payment).toEqual({
      paymentId: "payment-2",
      paymentAccount: {
        id: "bank-1",
        name: "Main bank",
        type: "BANK",
        currency: "EUR",
        accountCode: undefined,
      },
    });
  });
});

describe("merit payment guards", () => {
  it("throws when payment cannot be recorded without a bank account or amount", async () => {
    await expect(
      meritProviderAdapter.createPayment(
        credentials,
        {
          invoiceId: "invoice-3",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          extraction: buildExtractionWithoutPaymentAmount(),
          referenceData: buildMeritContext().referenceData,
        },
        buildMeritContext(),
      ),
    ).rejects.toThrow("Merit has no usable bank account");

    await expect(
      meritProviderAdapter.createPayment(
        credentials,
        {
          invoiceId: "invoice-3",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          extraction: buildExtractionWithoutPaymentAmount(),
          referenceData: buildMeritContext().referenceData,
        },
        {
          ...buildMeritContext(),
          raw: {
            ...buildMeritContext().raw,
            banks: [{ id: "bank-1", name: "Main bank", currencyCode: "EUR" }],
            paymentTypes: [{ id: "ptype-1", name: "Main bank" }],
          },
        },
      ),
    ).rejects.toThrow("payment amount could not be determined");
  });
});

function buildExtractionWithoutPaymentAmount() {
  return {
    ...buildVendorParams().extraction,
    invoice: {
      ...buildVendorParams().extraction.invoice,
      totalAmount: null,
      amountExcludingVat: null,
    },
    payment: {
      ...buildVendorParams().extraction.payment,
      isPaid: true,
      paymentAmount: null,
    },
  };
}
