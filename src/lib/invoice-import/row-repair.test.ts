import { expect, it } from "vitest";
import {
  __test__,
  shouldRepairMergedInvoiceRows,
  shouldUseSeparatedRows,
} from "./row-repair";
import type { InvoiceExtraction } from "../invoice-import-types";

function buildExtraction(
  overrides?: Partial<InvoiceExtraction>,
): InvoiceExtraction {
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
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 62.92,
      vatAmount: 13.84,
      totalAmount: 76.76,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: null,
        description:
          "Elekter öine jaanuar 2025; Elekter päevane jaanuar 2025; Üldelekter öine jaanuar 2025",
        quantity: 1,
        unit: null,
        price: 62.92,
        sum: 62.92,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4030",
        accountSelectionReason: "Matched electricity account.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

it("detects summarized one-row line-item lists", () => {
  expect(shouldRepairMergedInvoiceRows(buildExtraction())).toBe(true);
});

it("does not retry genuine single-row invoices", () => {
  expect(
    shouldRepairMergedInvoiceRows(
      buildExtraction({
        invoice: {
          ...buildExtraction().invoice,
          amountExcludingVat: 10,
          totalAmount: 12.2,
        },
        rows: [
          {
            ...buildExtraction().rows[0],
            description: "Monthly accounting service",
            price: 10,
            sum: 10,
          },
        ],
      }),
    ),
  ).toBe(false);
});

it("does not retry rows with an empty description", () => {
  expect(
    shouldRepairMergedInvoiceRows(
      buildExtraction({
        rows: [
          {
            ...buildExtraction().rows[0],
            description: "   ",
          },
        ],
      }),
    ),
  ).toBe(false);
});

it("does not treat long descriptions without comparable amounts as summaries", () => {
  expect(
    shouldRepairMergedInvoiceRows(
      buildExtraction({
        rows: [
          {
            ...buildExtraction().rows[0],
            description:
              "Quarterly facilities maintenance contract covering inspections, scheduled servicing, and emergency support visits",
            price: null,
            sum: null,
          },
        ],
      }),
    ),
  ).toBe(false);
});

it("prefers repaired rows only when they produce more non-empty rows", () => {
  const extraction = buildExtraction();

  expect(
    shouldUseSeparatedRows(extraction, [
      {
        ...extraction.rows[0],
        description: "Elekter öine jaanuar 2025",
      },
      {
        ...extraction.rows[0],
        description: "Elekter päevane jaanuar 2025",
      },
    ]),
  ).toBe(true);
  expect(shouldUseSeparatedRows(extraction, extraction.rows)).toBe(false);
});

it("counts delimited segments and repeated billing periods", () => {
  expect(
    __test__.countDelimitedSegments(
      "1. Elekter öine jaanuar 2025 2. Elekter päevane jaanuar 2025",
    ),
  ).toBe(2);
  expect(
    __test__.countBillingPeriodMentions(
      "Elekter jaanuar 2025; Elekter veebruar 2025",
    ),
  ).toBe(2);
});
