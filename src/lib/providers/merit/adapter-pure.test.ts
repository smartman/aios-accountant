import { describe, expect, it } from "vitest";
import { __test__ } from "./adapter";

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

describe("merit adapter pure vendor payload builders", () => {
  it("builds vendor payloads and grouped tax amounts", () => {
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
  });
});

describe("merit adapter pure invoice unit matching", () => {
  it("matches units and uses row totals for purchase invoices", () => {
    const invoiceBody = __test__.buildPurchaseInvoiceBody(
      {
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
      },
      [{ code: "tk", name: "tk" }],
    );

    expect(invoiceBody.DueDate).toBe("20260414");
    expect(invoiceBody.RoundingAmount).toBe(0);
    expect(invoiceBody.TotalAmount).toBe(100);
    expect(invoiceBody.InvoiceRow).toEqual([
      expect.objectContaining({
        Price: 100,
        TaxId: undefined,
        Item: expect.objectContaining({ UOMName: null }),
      }),
    ]);
    expect(
      __test__.selectMeritUnitName([{ code: "tk", name: "tk" }], "pcs"),
    ).toBe("tk");
    expect(
      __test__.selectMeritUnitName([{ code: "tundi", name: "tund" }], "hours"),
    ).toBe("tund");
    expect(
      __test__.selectMeritUnitName([{ code: "kuud", name: "kuu" }], "months"),
    ).toBe("kuu");
    expect(
      __test__.selectMeritUnitName([{ code: "ltr", name: "ltr" }], "litres"),
    ).toBe("ltr");
    expect(
      __test__.selectMeritUnitName([{ code: "km", name: "km" }], "km"),
    ).toBe("km");
    expect(__test__.selectMeritUnitName([], "pcs")).toBeNull();
  });
});

describe("merit adapter pure invoice rounding", () => {
  it("derives precise unit prices and infers missing invoice rounding", () => {
    const invoiceBody = __test__.buildPurchaseInvoiceBody(
      {
        ...buildInvoiceParams(),
        extraction: {
          ...buildInvoiceParams().extraction,
          invoice: {
            ...buildInvoiceParams().extraction.invoice,
            amountExcludingVat: 62.92,
            vatAmount: 13.84,
            totalAmount: 76.77,
          },
        },
        rows: [
          {
            ...buildInvoiceParams().rows[0],
            quantity: 37,
            price: 0.16,
            sum: 6.06,
            taxCode: "tax-22",
          },
        ],
      },
      [{ code: "tk", name: "tk" }],
    );

    expect(invoiceBody.RoundingAmount).toBe(0.01);
    expect(invoiceBody.TotalAmount).toBe(6.06);
    expect(invoiceBody.InvoiceRow).toEqual([
      expect.objectContaining({
        Quantity: 37,
        Price: 0.1637838,
      }),
    ]);
  });

  it("does not turn larger invoice header deltas into rounding", () => {
    const invoiceBody = __test__.buildPurchaseInvoiceBody(
      {
        ...buildInvoiceParams(),
        extraction: {
          ...buildInvoiceParams().extraction,
          invoice: {
            ...buildInvoiceParams().extraction.invoice,
            amountExcludingVat: 62.92,
            vatAmount: 13.84,
            totalAmount: 76.79,
          },
        },
        rows: [
          {
            ...buildInvoiceParams().rows[0],
            quantity: 37,
            price: 0.16,
            sum: 6.06,
            taxCode: "tax-22",
          },
        ],
      },
      [{ code: "tk", name: "tk" }],
    );

    expect(invoiceBody.RoundingAmount).toBe(0);
  });
});

describe("merit adapter pure invoice total helpers", () => {
  it("calculates net row totals from summed and derived row values", () => {
    expect(
      __test__.buildMeritRowNetTotal([
        {
          ...buildInvoiceParams().rows[0],
          sum: 145.08,
          quantity: 1,
          price: 145.08,
        },
        {
          ...buildInvoiceParams().rows[1],
          sum: 36.21,
          quantity: 1,
          price: 36.21,
        },
      ]),
    ).toBe(181.29);
    expect(
      __test__.buildMeritRowNetTotal([
        {
          ...buildInvoiceParams().rows[0],
          sum: undefined,
          price: 50,
          quantity: 2,
        },
      ]),
    ).toBe(100);
    expect(
      __test__.buildMeritRowNetTotal([
        {
          ...buildInvoiceParams().rows[0],
          sum: undefined,
          price: undefined,
          quantity: undefined,
        },
      ]),
    ).toBeUndefined();
  });
});

describe("merit adapter pure invoice total fallbacks", () => {
  it("falls back from row totals to extracted invoice totals", () => {
    expect(
      __test__.buildPurchaseInvoiceBody(
        {
          ...buildInvoiceParams(),
          rows: [],
          extraction: {
            ...buildInvoiceParams().extraction,
            invoice: {
              ...buildInvoiceParams().extraction.invoice,
              amountExcludingVat: 181.29,
              totalAmount: 224.8,
            },
          },
        },
        [],
      ).TotalAmount,
    ).toBe(181.29);
    expect(
      __test__.buildPurchaseInvoiceBody(
        {
          ...buildInvoiceParams(),
          rows: [],
          extraction: {
            ...buildInvoiceParams().extraction,
            invoice: {
              ...buildInvoiceParams().extraction.invoice,
              amountExcludingVat: 181.294,
              totalAmount: 224.804,
            },
          },
        },
        [],
      ).TotalAmount,
    ).toBe(181.29);
    expect(
      __test__.buildPurchaseInvoiceBody(
        {
          ...buildInvoiceParams(),
          rows: [],
          extraction: {
            ...buildInvoiceParams().extraction,
            invoice: {
              ...buildInvoiceParams().extraction.invoice,
              amountExcludingVat: null,
              totalAmount: 224.8,
            },
          },
        },
        [],
      ).TotalAmount,
    ).toBe(224.8);
    expect(
      __test__.buildPurchaseInvoiceBody(
        {
          ...buildInvoiceParams(),
          rows: [],
          extraction: {
            ...buildInvoiceParams().extraction,
            invoice: {
              ...buildInvoiceParams().extraction.invoice,
              currency: null,
              amountExcludingVat: null,
              totalAmount: null,
            },
          },
        },
        [],
      ),
    ).toEqual(
      expect.objectContaining({
        CurrencyCode: "EUR",
        TotalAmount: undefined,
      }),
    );
  });
});

describe("merit adapter pure payment payload builders", () => {
  it("adds selected Merit dimensions to invoice and rows", () => {
    const params = buildInvoiceParams();
    const invoiceBody = __test__.buildPurchaseInvoiceBody(
      {
        ...params,
        extraction: {
          ...params.extraction,
          dimension: {
            code: "OBJ",
            name: "Object",
            reason: "Matched project",
          },
        },
        referenceData: {
          ...params.referenceData,
          dimensions: [
            {
              code: "OBJ",
              name: "Object",
              dimId: 1,
              dimValueId: "value-1",
              dimCode: "OBJ",
            },
          ],
        },
      },
      [],
    );

    expect(invoiceBody.Dimensions).toEqual([
      {
        DimId: 1,
        DimValueId: "value-1",
        DimCode: "OBJ",
      },
    ]);
    expect(
      (invoiceBody.InvoiceRow as Array<Record<string, unknown>>)[0].Dimensions,
    ).toEqual(invoiceBody.Dimensions);
  });

  it("builds payment payloads for EUR and foreign-currency invoices", () => {
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
    );
    const foreignPayment = __test__.buildPaymentBody(
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
    );

    expect(foreignPayment.CurrencyCode).toBe("USD");
  });
});
