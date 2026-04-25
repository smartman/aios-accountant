import { describe, expect, it, vi } from "vitest";
import {
  chooseFallbackPurchaseAccount,
  fallbackRowFromInvoice,
  findReferenceAccountByCode,
  generateFallbackInvoiceNumber,
  resolvePurchaseRows,
  resolveTaxCode,
  uniqueAccounts,
} from "./provider-import-helpers";
import { InvoiceExtraction } from "./invoice-import-types";

function buildExtraction(rows: InvoiceExtraction["rows"]): InvoiceExtraction {
  return {
    vendor: {
      name: "ARVUTITARK OÜ",
      regCode: "12494674",
      vatNumber: "EE101646813",
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: "EE",
      city: "Tallinn",
      postalCode: "13520",
      addressLine1: "Järveotsa tee 50C",
      addressLine2: null,
    },
    invoice: {
      documentType: "receipt",
      invoiceNumber: "104026820",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-07",
      dueDate: null,
      entryDate: "2026-04-07",
      amountExcludingVat: 181.29,
      vatAmount: 43.51,
      totalAmount: 224.8,
      notes: "Paid by card",
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-07",
      paymentAmount: 224.8,
      paymentChannelHint: "BANK",
      reason: "Card payment shown on receipt",
    },
    rows,
    warnings: [],
  };
}

describe("resolvePurchaseRows account selection", () => {
  it("corrects a generic resale account to a low-value asset account for a monitor", () => {
    const [resolved] = resolvePurchaseRows({
      extraction: buildExtraction([
        {
          description:
            'MSI MAG 275QF E20 27" LED WQHD mängurimonitor 200 Hz (Serial number: CAAM036102052)',
          quantity: 1,
          unit: "tk",
          price: 145.08,
          sum: 145.08,
          vatRate: 24,
          vatPc: "24",
          accountPurchase: "4000",
          accountSelectionReason:
            "Retail hardware item; posting to generic goods account.",
        },
      ]),
      referenceData: {
        accounts: [
          {
            code: "4000",
            type: "EXPENSE",
            label: "4000 - Müüdud kaubad soetushinnas",
          },
          {
            code: "4004",
            type: "EXPENSE",
            label: "4004 - Väheväärtuslik põhivara",
          },
          {
            code: "4320",
            type: "EXPENSE",
            label: "4320 - IT teenused, arvutitarvikud",
          },
          { code: "4020", type: "EXPENSE", label: "4020 - Kütus" },
        ],
        taxCodes: [{ code: "24", rate: 24, description: "24% käibemaks" }],
        paymentAccounts: [],
      },
    });

    expect(resolved.accountCode).toBe("4004");
    expect(resolved.accountSelectionReason).toContain("Adjusted account");
    expect(resolved.accountSelectionReason).toContain(
      "4004 - Väheväärtuslik põhivara",
    );
  });

  it("keeps computer accessories on the IT supplies account when it fits better", () => {
    const [resolved] = resolvePurchaseRows({
      extraction: buildExtraction([
        {
          description:
            'Gembird MA-DA2-06 must monitori alus/jalg kuni 32", kahele',
          quantity: 1,
          unit: "tk",
          price: 36.21,
          sum: 36.21,
          vatRate: 24,
          vatPc: "24",
          accountPurchase: "4000",
          accountSelectionReason:
            "Retail hardware item; posting to generic goods account.",
        },
      ]),
      referenceData: {
        accounts: [
          {
            code: "4000",
            type: "EXPENSE",
            label: "4000 - Müüdud kaubad soetushinnas",
          },
          {
            code: "4004",
            type: "EXPENSE",
            label: "4004 - Väheväärtuslik põhivara",
          },
          {
            code: "4320",
            type: "EXPENSE",
            label: "4320 - IT teenused, arvutitarvikud",
          },
          { code: "4020", type: "EXPENSE", label: "4020 - Kütus" },
        ],
        taxCodes: [{ code: "24", rate: 24, description: "24% käibemaks" }],
        paymentAccounts: [],
      },
    });

    expect(resolved.accountCode).toBe("4320");
    expect(resolved.accountSelectionReason).toContain(
      "4320 - IT teenused, arvutitarvikud",
    );
  });
});

describe("resolvePurchaseRows fallback helpers", () => {
  it("builds fallback invoice numbers and summarized rows when AI rows are missing", () => {
    const extraction = buildExtraction([]);

    expect(
      generateFallbackInvoiceNumber({
        extraction,
        fingerprint: "abcdef1234567890",
      }),
    ).toBe("AUTO-20260407-ABCDEF12");
    expect(fallbackRowFromInvoice(extraction)).toMatchObject({
      sourceArticleCode: null,
      description: "Paid by card",
      quantity: 1,
      unit: null,
      price: 181.29,
      sum: 224.8,
      vatRate: null,
      vatPc: null,
      accountPurchase: null,
      needsManualReview: true,
    });
  });

  it("falls back to entry dates, current dates, vendor names, and invoice numbers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    expect(
      generateFallbackInvoiceNumber({
        extraction: buildExtraction([
          {
            description: "Service",
            quantity: 1,
            unit: "pcs",
            price: 10,
            sum: 10,
            vatRate: null,
            vatPc: null,
            accountPurchase: null,
            accountSelectionReason: "Matched.",
          },
        ]),
        fingerprint: "abcdef1234567890",
      }),
    ).toBe("AUTO-20260407-ABCDEF12");
    expect(
      generateFallbackInvoiceNumber({
        extraction: buildExtraction([]),
        fingerprint: "fedcba0987654321",
      }),
    ).toBe("AUTO-20260407-FEDCBA09");
    expect(
      generateFallbackInvoiceNumber({
        extraction: {
          ...buildExtraction([]),
          invoice: {
            ...buildExtraction([]).invoice,
            issueDate: null,
            entryDate: null,
          },
        },
        fingerprint: "1122334455667788",
      }),
    ).toBe("AUTO-20260501-11223344");

    expect(
      fallbackRowFromInvoice({
        ...buildExtraction([]),
        invoice: {
          ...buildExtraction([]).invoice,
          notes: null,
          amountExcludingVat: null,
          totalAmount: 224.8,
        },
      }).description,
    ).toBe("ARVUTITARK OÜ");
    expect(
      fallbackRowFromInvoice({
        ...buildExtraction([]),
        invoice: {
          ...buildExtraction([]).invoice,
          notes: null,
          invoiceNumber: "INV-FALLBACK",
        },
        vendor: {
          ...buildExtraction([]).vendor,
          name: null,
        },
      }).description,
    ).toBe("INV-FALLBACK");
    expect(
      fallbackRowFromInvoice({
        ...buildExtraction([]),
        invoice: {
          ...buildExtraction([]).invoice,
          notes: null,
          invoiceNumber: null,
        },
        vendor: {
          ...buildExtraction([]).vendor,
          name: null,
        },
      }).description,
    ).toBe("Imported invoice");

    vi.useRealTimers();
  });
});

describe("resolvePurchaseRows reference matching", () => {
  it("finds accounts, tax codes, and unique chosen accounts", () => {
    const accounts = [
      { code: "4000", type: "EXPENSE", label: "4000 - Services" },
      { code: "5000", type: "EXPENSE", label: "5000 - Goods" },
    ];
    const rows = [
      {
        code: "ROW01",
        description: "Services",
        quantity: 1,
        unit: "pcs",
        price: 10,
        sum: 10,
        accountCode: "4000",
        accountSelectionReason: "Matched service account",
      },
      {
        code: "ROW02",
        description: "More services",
        quantity: 1,
        unit: "pcs",
        price: 15,
        sum: 15,
        accountCode: "4000",
        accountSelectionReason: "Matched service account",
      },
    ];

    expect(findReferenceAccountByCode(accounts, "4000")?.label).toBe(
      "4000 - Services",
    );
    expect(findReferenceAccountByCode(accounts, null)).toBeNull();
    expect(
      resolveTaxCode(
        {
          description: "Service",
          quantity: 1,
          unit: "pcs",
          price: 10,
          sum: 10,
          vatRate: 24,
          vatPc: "24",
          accountPurchase: "4000",
          accountSelectionReason: "Matched service account",
        },
        [{ code: "24", rate: 24, description: "24% käibemaks" }],
      ),
    ).toBe("24");
    expect(
      resolveTaxCode(
        {
          description: "Service",
          quantity: 1,
          unit: "pcs",
          price: 10,
          sum: 10,
          vatRate: 24,
          vatPc: "UNKNOWN",
          accountPurchase: "4000",
          accountSelectionReason: "Matched service account",
        },
        [{ code: "24", rate: 24, description: "24% käibemaks" }],
      ),
    ).toBe("24");
    expect(
      resolveTaxCode(
        {
          description: "Service",
          quantity: 1,
          unit: "pcs",
          price: 10,
          sum: 10,
          vatRate: 9,
          vatPc: null,
          accountPurchase: "4000",
          accountSelectionReason: "Matched service account",
        },
        [{ code: "24", rate: 24, description: "24% käibemaks" }],
      ),
    ).toBeUndefined();
    expect(uniqueAccounts(rows, accounts)).toEqual([
      {
        code: "4000",
        label: "4000 - Services",
        reason: "Matched service account",
      },
    ]);
  });
});

describe("resolvePurchaseRows fallback accounts", () => {
  it("prefers the best scoring fallback account and creates fallback rows when needed", () => {
    expect(
      chooseFallbackPurchaseAccount({
        accounts: [
          { code: "1000", type: "ASSET", label: "1000 - Misc asset" },
          {
            code: "4000",
            type: "EXPENSE",
            label: "4000 - Consulting services",
          },
        ],
        descriptions: ["", "consulting services"],
      }),
    )?.toMatchObject({ code: "4000" });

    const [resolved] = resolvePurchaseRows({
      extraction: buildExtraction([]),
      referenceData: {
        accounts: [
          {
            code: "4000",
            type: "EXPENSE",
            label: "4000 - Consulting services",
          },
        ],
        taxCodes: [],
        paymentAccounts: [],
      },
    });

    expect(resolved.accountCode).toBe("4000");
    expect(resolved.accountSelectionReason).toContain(
      "Fallback selected 4000 - Consulting services",
    );
  });

  it("falls back to the first expense-like account when nothing matches", () => {
    const fallback = chooseFallbackPurchaseAccount({
      accounts: [
        { code: "1000", type: "ASSET", label: "1000 - Misc asset" },
        { code: "2000", type: "LIABILITY", label: "2000 - Liability" },
      ],
      descriptions: ["Unknown thing"],
    });

    expect(fallback?.code).toBe("1000");
    expect(
      chooseFallbackPurchaseAccount({
        accounts: [
          { code: "2000", type: "LIABILITY", label: "2000 - Liability" },
        ],
        descriptions: ["Unknown thing"],
      }),
    ).toBeNull();
  });
});

describe("resolvePurchaseRows error and normalization handling", () => {
  it("penalizes clearly non-purchase accounts when a better expense account exists", () => {
    const [resolved] = resolvePurchaseRows({
      extraction: buildExtraction([
        {
          description: "Laptop serial number consulting bundle",
          quantity: 1,
          unit: "pcs",
          price: 10,
          sum: 10,
          vatRate: null,
          vatPc: null,
          accountPurchase: "7000",
          accountSelectionReason: "AI matched a tax account.",
        },
      ]),
      referenceData: {
        accounts: [
          { code: "7000", type: "EXPENSE", label: "7000 - Telefon expense" },
          { code: "4000", type: "EXPENSE", label: "4000 - Laptop services" },
        ],
        taxCodes: [],
        paymentAccounts: [],
      },
    });

    expect(resolved.accountCode).toBe("4000");
  });

  it("throws when no usable account can be resolved", () => {
    expect(() =>
      resolvePurchaseRows({
        extraction: buildExtraction([
          {
            description: "Unknown purchase",
            quantity: 1,
            unit: "pcs",
            price: 10,
            sum: 10,
            vatRate: null,
            vatPc: null,
            accountPurchase: null,
            accountSelectionReason: "No account available.",
          },
        ]),
        referenceData: {
          accounts: [],
          taxCodes: [],
          paymentAccounts: [],
        },
      }),
    ).toThrow('Could not find a purchase account for row "Unknown purchase".');
  });

  it("keeps the matched account when no stronger override exists and normalizes empty numeric fields", () => {
    const [resolved] = resolvePurchaseRows({
      extraction: buildExtraction([
        {
          description: "Generic service line",
          quantity: Number.NaN,
          unit: null,
          price: Number.NaN,
          sum: Number.NaN,
          vatRate: null,
          vatPc: null,
          accountPurchase: "4000",
          accountSelectionReason: "AI matched service account.",
        },
      ]),
      referenceData: {
        accounts: [
          { code: "4000", type: "EXPENSE", label: "4000 - Services" },
          {
            code: "4004",
            type: "EXPENSE",
            label: "4004 - Väheväärtuslik põhivara",
          },
        ],
        taxCodes: [],
        paymentAccounts: [],
      },
    });

    expect(resolved.accountCode).toBe("4000");
    expect(resolved.accountSelectionReason).toBe("AI matched service account.");
    expect(resolved.quantity).toBe(1);
    expect(resolved.unit).toBeUndefined();
    expect(resolved.price).toBeUndefined();
    expect(resolved.sum).toBeUndefined();
  });
});
