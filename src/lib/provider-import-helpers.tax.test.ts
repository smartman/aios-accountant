import { expect, it } from "vitest";
import { resolvePurchaseRows } from "./provider-import-helpers";
import { InvoiceExtraction } from "./invoice-import-types";

function buildExtractionWithMissingRowTax(): InvoiceExtraction {
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
    rows: [
      {
        description:
          'MSI MAG 275QF E20 27" LED WQHD mängurimonitor 200 Hz (Serial number: CAAM036102052)',
        quantity: 1,
        unit: "tk",
        price: 145.08,
        sum: 145.08,
        vatRate: null,
        vatPc: null,
        accountPurchase: "4000",
        accountSelectionReason:
          "Retail hardware item; posting to generic goods account.",
      },
      {
        description:
          'Gembird MA-DA2-06 must monitori alus/jalg kuni 32", kahele',
        quantity: 1,
        unit: "tk",
        price: 36.21,
        sum: 36.21,
        vatRate: null,
        vatPc: null,
        accountPurchase: "4000",
        accountSelectionReason:
          "Retail hardware item; posting to generic goods account.",
      },
    ],
    warnings: [],
  };
}

it("infers the invoice VAT code when row tax details are missing", () => {
  const resolved = resolvePurchaseRows({
    extraction: buildExtractionWithMissingRowTax(),
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
      ],
      taxCodes: [
        { code: "0", rate: 0, description: "Maksuvaba" },
        { code: "24", rate: 24, description: "24% käibemaks" },
      ],
      paymentAccounts: [],
    },
  });

  expect(resolved).toHaveLength(2);
  expect(resolved[0]?.taxCode).toBe("24");
  expect(resolved[1]?.taxCode).toBe("24");
});
