import { describe, expect, it } from "vitest";
import { __test__ } from "./adapter";

function buildExtraction() {
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
  };
}

function buildInvoiceParams() {
  return {
    vendorId: "vendor-1",
    extraction: buildExtraction(),
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
    referenceData: {
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
      taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [
        { type: "BANK" as const, name: "Main bank", currency: "EUR" },
      ],
    },
  };
}

describe("smartaccounts adapter pure helper primitives", () => {
  it("covers date parsing, vendor payloads, and invoice payload normalization", () => {
    expect(__test__.maskSecret(" abc ")).toBe("abc");
    expect(__test__.normalizeNumber(Number.NaN)).toBeUndefined();
    expect(__test__.firstNonEmpty(null, " ", "value")).toBe("value");
    expect(__test__.firstNonEmpty(null, undefined)).toBeNull();
    expect(__test__.toSmartAccountsDate(undefined)).toBeUndefined();
    expect(__test__.toSmartAccountsDate("2026-04-14")).toBe("14.04.2026");
    expect(__test__.toSmartAccountsDate("14.04.2026")).toBe("14.04.2026");
    expect(__test__.toSmartAccountsDate("2026-04-14T12:00:00.000Z")).toBe(
      "14.04.2026",
    );
    expect(__test__.toSmartAccountsDate("not-a-date")).toBeUndefined();

    expect(
      __test__.buildVendorAddress({
        ...buildExtraction(),
        vendor: {
          ...buildExtraction().vendor,
          countryCode: null,
          city: null,
          postalCode: null,
          addressLine1: null,
          addressLine2: null,
        },
      }),
    ).toBeUndefined();
    expect(__test__.buildVendorAddress(buildExtraction())).toEqual({
      country: "EE",
      city: "Tallinn",
      postalCode: "10111",
      address1: "Tartu mnt 1",
      address2: undefined,
    });
    expect(
      __test__.buildVendorAddress({
        ...buildExtraction(),
        vendor: {
          ...buildExtraction().vendor,
          countryCode: "EE",
          city: null,
          postalCode: null,
          addressLine1: "Tartu mnt 1",
          addressLine2: null,
        },
      }),
    ).toEqual({
      country: "EE",
      city: undefined,
      postalCode: undefined,
      address1: "Tartu mnt 1",
      address2: undefined,
    });
  });
});

describe("smartaccounts adapter pure payload builders", () => {
  it("covers vendor and invoice payload normalization branches", () => {
    expect(
      __test__.buildVendorPayload(
        {
          ...buildExtraction(),
          vendor: {
            ...buildExtraction().vendor,
            name: null,
            regCode: null,
            vatNumber: "EE123",
            bankAccount: null,
          },
        },
        [],
      ),
    ).toEqual(
      expect.objectContaining({
        name: "Unknown vendor",
        regCode: undefined,
        vatNumber: "EE123",
        bankAccount: undefined,
        accountUnpaid: undefined,
      }),
    );

    expect(
      __test__.buildInvoicePayload({
        ...buildInvoiceParams(),
        extraction: {
          ...buildInvoiceParams().extraction,
          invoice: {
            ...buildInvoiceParams().extraction.invoice,
            dueDate: null,
            referenceNumber: null,
            amountExcludingVat: null,
            vatAmount: null,
            totalAmount: null,
            notes: null,
          },
        },
        rows: [
          {
            ...buildInvoiceParams().rows[0],
            unit: undefined,
            price: undefined,
            sum: undefined,
            taxCode: undefined,
          },
        ],
      }).rows,
    ).toEqual([
      expect.objectContaining({
        unit: undefined,
        price: undefined,
        vatPc: undefined,
      }),
    ]);
    expect(
      __test__.buildInvoicePayload({
        ...buildInvoiceParams(),
        extraction: {
          ...buildInvoiceParams().extraction,
          invoice: {
            ...buildInvoiceParams().extraction.invoice,
            currency: null,
            issueDate: null,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        currency: "EUR",
        date: "14.04.2026",
        roundAmount: 0,
      }),
    );
  });
});

describe("smartaccounts adapter pure invoice rounding", () => {
  it("derives row prices from authoritative net sums and always sends rounding", () => {
    const payload = __test__.buildInvoicePayload({
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
        },
      ],
    });

    expect(payload).toEqual(
      expect.objectContaining({
        roundAmount: 0.01,
      }),
    );
    expect(payload.rows).toEqual([
      expect.objectContaining({
        quantity: 37,
        price: 0.1637838,
      }),
    ]);
  });

  it("rounds invoice header amounts only when building the SmartAccounts payload", () => {
    const payload = __test__.buildInvoicePayload({
      ...buildInvoiceParams(),
      extraction: {
        ...buildInvoiceParams().extraction,
        invoice: {
          ...buildInvoiceParams().extraction.invoice,
          amountExcludingVat: 181.294,
          vatAmount: 39.884,
          totalAmount: 221.178,
        },
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        amount: 181.29,
        vatAmount: 39.88,
        totalAmount: 221.18,
      }),
    );
  });
});
