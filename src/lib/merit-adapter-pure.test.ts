import { describe, expect, it } from "vitest";
import { __test__ } from "./merit-adapter";

function buildInvoiceParams() {
  return {
    vendorId: "vendor-1",
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
        documentType: "invoice" as const,
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
        paymentChannelHint: "BANK" as const,
        reason: "Card payment",
      },
      rows: [],
      warnings: [],
    },
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
    referenceData: {
      accounts: [{ code: "4000", label: "4000 - Services" }],
      taxCodes: [{ code: "tax-22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [
        {
          id: "bank-1",
          type: "BANK" as const,
          name: "Main bank",
          currency: "EUR",
        },
      ],
    },
  };
}

function buildPaymentParams() {
  return {
    invoiceId: "invoice-1",
    vendorId: "vendor-1",
    vendorName: "Vendor OÜ",
    extraction: buildInvoiceParams().extraction,
    referenceData: buildInvoiceParams().referenceData,
  };
}

describe("merit adapter pure helper primitives", () => {
  it("covers tax, bank, vendor, invoice, and payment helper branches", () => {
    expect(__test__.maskSecret(" abc ")).toBe("abc");
    expect(
      __test__.computeTaxAmountForRow(buildInvoiceParams().rows[0], undefined),
    ).toBe(0);
    expect(
      __test__.computeTaxAmountForRow(
        {
          ...buildInvoiceParams().rows[0],
          price: undefined,
          quantity: undefined,
          sum: undefined,
        },
        { id: "tax-22", code: "22", rate: 22 },
      ),
    ).toBe(0);
    expect(
      __test__.computeTaxAmountForRow(
        {
          ...buildInvoiceParams().rows[0],
          sum: undefined,
          price: 50,
          quantity: 2,
        },
        { id: "tax-22", code: "22", rate: 22 },
      ),
    ).toBe(22);

    expect(
      __test__.pickMeritBank(
        [{ id: "bank-2", name: "Secondary", currencyCode: "USD" }],
        [{ id: "ptype-1", name: "Secondary" }],
        "EUR",
      ),
    )?.toMatchObject({ id: "bank-2", currency: "USD" });
    expect(__test__.pickMeritBank([], [], "EUR")).toBeNull();
    expect(
      __test__.pickMeritBank(
        [
          {
            id: "bank-1",
            name: "EUR bank",
            currencyCode: "EUR",
            accountCode: "1020",
          },
          {
            id: "bank-2",
            name: "USD bank",
            currencyCode: "USD",
            accountCode: "1030",
          },
        ],
        [{ id: "ptype-1", name: "EUR bank" }],
        "EUR",
      ),
    )?.toMatchObject({ id: "bank-1", currency: "EUR" });
  });
});

describe("merit adapter pure payload builders", () => {
  it("covers vendor, invoice, and payment payload builder branches", () => {
    expect(
      __test__.buildMeritVendorPayload({
        ...buildInvoiceParams(),
        extraction: {
          ...buildInvoiceParams().extraction,
          vendor: {
            ...buildInvoiceParams().extraction.vendor,
            name: null,
            regCode: null,
            countryCode: null,
            addressLine1: null,
            addressLine2: null,
          },
        },
      }).countryCode,
    ).toBe("EE");
    expect(
      __test__.buildTaxAmounts(buildInvoiceParams(), [
        { id: "tax-22", code: "22", rate: 22 },
      ]),
    ).toEqual([{ TaxId: "tax-22", Amount: 22 }]);

    const invoiceBody = __test__.buildPurchaseInvoiceBody({
      ...buildInvoiceParams(),
      extraction: {
        ...buildInvoiceParams().extraction,
        invoice: {
          ...buildInvoiceParams().extraction.invoice,
          dueDate: null,
          issueDate: null,
          invoiceNumber: null,
          referenceNumber: null,
          totalAmount: null,
        },
      },
      rows: [
        {
          ...buildInvoiceParams().rows[0],
          unit: undefined,
          price: undefined,
          sum: 100,
          taxCode: undefined,
        },
      ],
    });

    expect(invoiceBody.DueDate).toBe("20260414");
    expect(invoiceBody.InvoiceRow).toEqual([
      expect.objectContaining({
        Price: 100,
        TaxId: undefined,
        Item: expect.objectContaining({ UOMName: "pcs" }),
      }),
    ]);

    expect(
      __test__.buildPaymentBody(
        {
          ...buildPaymentParams(),
          extraction: {
            ...buildPaymentParams().extraction,
            payment: {
              ...buildPaymentParams().extraction.payment,
              paymentDate: null,
            },
          },
        },
        { id: "bank-1", name: "Main bank", type: "BANK", currency: "EUR" },
        122,
      ).CurrencyCode,
    ).toBeUndefined();
    expect(
      __test__.buildPaymentBody(
        {
          ...buildPaymentParams(),
          extraction: {
            ...buildPaymentParams().extraction,
            invoice: {
              ...buildPaymentParams().extraction.invoice,
              currency: "USD",
              invoiceNumber: null,
              referenceNumber: null,
            },
          },
        },
        { id: "bank-1", name: "Main bank", type: "BANK", currency: "EUR" },
        122,
      ),
    ).toEqual(
      expect.objectContaining({
        CurrencyCode: "USD",
        BillNo: undefined,
        RefNo: undefined,
      }),
    );
  });
});
