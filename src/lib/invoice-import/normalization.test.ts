import { expect, it } from "vitest";
import {
  normalizeExtractionWarnings,
  normalizeInvoiceExtraction,
  normalizeInvoiceImportDraft,
  roundAmount,
} from "./normalization";
import type {
  InvoiceExtraction,
  InvoiceImportDraft,
} from "../invoice-import-types";

function buildExtraction(): InvoiceExtraction {
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
      amountExcludingVat: 10,
      vatAmount: 2.2,
      totalAmount: 12.2,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 12.2,
      paymentChannelHint: "BANK",
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: null,
        description: "Consulting",
        quantity: 1,
        unit: null,
        price: 10,
        sum: 10,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4000",
        accountSelectionReason: "Matched services account.",
      },
    ],
    warnings: [],
  };
}

function buildDraft(): InvoiceImportDraft {
  return {
    provider: "merit",
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
      selectionMode: "create",
      existingVendorId: null,
      existingVendorName: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 10,
      vatAmount: 2.2,
      totalAmount: 12.2,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 12.2,
      paymentChannelHint: "BANK",
      reason: null,
      paymentAccountName: "Main bank",
    },
    actions: {
      createVendor: true,
      recordPayment: true,
    },
    rows: [
      {
        id: "row-1",
        sourceArticleCode: null,
        description: "Consulting",
        quantity: 1,
        unit: null,
        price: 10,
        sum: 10,
        vatRate: 22,
        taxCode: "VAT22",
        accountCode: "4000",
        accountSelectionReason: "Matched services account.",
        reviewed: true,
        selectedArticleCode: "A1",
        selectedArticleDescription: "Consulting",
        articleCandidates: [],
        suggestionStatus: "clear",
      },
    ],
    warnings: [],
    duplicateInvoice: null,
  };
}

it("rounds amounts and preserves non-negative zero", () => {
  expect(roundAmount(1.239)).toBe(1.24);
  expect(roundAmount(null)).toBeNull();
  expect(roundAmount(undefined)).toBeUndefined();
  expect(Object.is(roundAmount(-0.001), 0)).toBe(true);
});

it("suppresses non-actionable vendor warnings and keeps actionable ones", () => {
  const extraction = buildExtraction();
  extraction.warnings = [
    "  ",
    "Buyer block at top left is labeled 'Maksja', vendor was taken from the separately grouped supplier block.",
    "Vendor extraction is unclear because the supplier block is cut off.",
    "Vendor extraction relied on the supplier block.",
    "Vendor extraction relied on the supplier block.",
  ];

  expect(normalizeExtractionWarnings(extraction)).toEqual([
    "Vendor extraction is unclear because the supplier block is cut off.",
  ]);
});

it("suppresses explanatory vendor-extraction warnings even without a resolved vendor", () => {
  const extraction = buildExtraction();
  extraction.vendor.name = null;
  extraction.warnings = ["Recipient details ignored for vendor extraction"];

  expect(normalizeExtractionWarnings(extraction)).toEqual([]);
});

it("normalizes extraction amounts and coerces missing numeric values to null", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = undefined as unknown as number | null;
  extraction.invoice.vatAmount = undefined as unknown as number | null;
  extraction.invoice.totalAmount = undefined as unknown as number | null;
  extraction.payment.paymentAmount = undefined as unknown as number | null;
  extraction.rows[0].price = undefined as unknown as number | null;
  extraction.rows[0].sum = undefined as unknown as number | null;
  extraction.rows[0].manualReviewReason =
    "  Description is partially unreadable.  ";

  expect(normalizeInvoiceExtraction(extraction)).toMatchObject({
    invoice: {
      amountExcludingVat: null,
      vatAmount: null,
      totalAmount: null,
    },
    payment: {
      paymentAmount: null,
    },
    rows: [
      {
        price: null,
        sum: null,
        needsManualReview: true,
        manualReviewReason: "Description is partially unreadable.",
      },
    ],
  });
});

it("preserves exact extraction amounts while normalizing nulls", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 181.294;
  extraction.invoice.vatAmount = 39.884;
  extraction.invoice.totalAmount = 221.178;
  extraction.payment.paymentAmount = 221.178;
  extraction.rows[0].price = 0.3333;
  extraction.rows[0].sum = 1.239;

  expect(normalizeInvoiceExtraction(extraction)).toMatchObject({
    invoice: {
      amountExcludingVat: 181.294,
      vatAmount: 39.884,
      totalAmount: 221.178,
    },
    payment: {
      paymentAmount: 221.178,
    },
    rows: [
      {
        price: 0.3333,
        sum: 1.239,
      },
    ],
  });
});

it("converts VAT-inclusive receipt rows to net amounts", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 39.19;
  extraction.invoice.vatAmount = 9.41;
  extraction.invoice.totalAmount = 48.6;
  extraction.rows = [
    {
      ...extraction.rows[0],
      description: "Pelmeenid kodused Valgusfoor",
      quantity: 1,
      price: 7.9,
      sum: 7.9,
      vatRate: 24,
    },
    {
      ...extraction.rows[0],
      description: "Burger KANA",
      quantity: 1,
      price: 15.9,
      sum: 15.9,
      vatRate: 24,
    },
    {
      ...extraction.rows[0],
      description: "Kanatefteelid Maagilised",
      quantity: 1,
      price: 7.9,
      sum: 7.9,
      vatRate: 24,
    },
    {
      ...extraction.rows[0],
      description: "Soe kanafilee salat",
      quantity: 1,
      price: 12.9,
      sum: 12.9,
      vatRate: 24,
    },
    {
      ...extraction.rows[0],
      description: "Vesi kann",
      quantity: 1,
      price: 4,
      sum: 4,
      vatRate: 24,
    },
  ];

  expect(normalizeInvoiceExtraction(extraction).rows).toMatchObject([
    { price: 6.37, sum: 6.37 },
    { price: 12.82, sum: 12.82 },
    { price: 6.37, sum: 6.37 },
    { price: 10.4, sum: 10.4 },
    { price: 3.23, sum: 3.23 },
  ]);
});

it("reconciles VAT-inclusive receipt row rounding to the stated net total", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 190.46;
  extraction.invoice.vatAmount = 45.72;
  extraction.invoice.totalAmount = 236.18;
  extraction.rows = [
    2.99, 1, 8.97, 7.98, 7.99, 11.97, 17.99, 15.99, 12.99, 74.99, 4.99, 3.99,
    3.99, 12.99, 0.99, 4.99, 1.49, 1.99, 0.99, 3.99, 6.99, 4.49, 5.99, 2.49,
    3.49, 5.98, -1, 4.49,
  ].map((grossAmount, index) => ({
    ...extraction.rows[0],
    description: `Receipt row ${index + 1}`,
    quantity: 1,
    price: grossAmount,
    sum: grossAmount,
    vatRate: 24,
  }));

  const rows = normalizeInvoiceExtraction(extraction).rows;
  const rowNetTotal = roundAmount(
    rows.reduce((total, row) => total + (row.sum ?? 0), 0),
  );

  expect(rowNetTotal).toBe(190.46);
  expect(rows[7]).toMatchObject({ price: 12.89, sum: 12.89 });
});

it("skips gross-to-net conversion when a numeric gross row has no VAT rate", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 8.06;
  extraction.invoice.vatAmount = 1.94;
  extraction.invoice.totalAmount = 10;
  extraction.rows[0].price = 10;
  extraction.rows[0].sum = 10;
  extraction.rows[0].vatRate = null;

  expect(normalizeInvoiceExtraction(extraction).rows[0]).toMatchObject({
    price: 10,
    sum: 10,
  });
});

it("keeps converted receipt rows when invoice net is not a rounding match", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 10;
  extraction.invoice.vatAmount = 2.2;
  extraction.invoice.totalAmount = 12.2;
  extraction.rows[0].price = 12.2;
  extraction.rows[0].sum = 12.2;
  extraction.rows[0].vatRate = 24;

  expect(normalizeInvoiceExtraction(extraction).rows[0]).toMatchObject({
    price: 9.84,
    sum: 9.84,
  });
});

it("does not over-adjust receipt row rounding beyond one cent per row", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 0.84;
  extraction.invoice.vatAmount = 0.16;
  extraction.invoice.totalAmount = 1;
  extraction.rows[0].price = 1;
  extraction.rows[0].sum = 1;
  extraction.rows[0].vatRate = 24;

  expect(normalizeInvoiceExtraction(extraction).rows[0]).toMatchObject({
    price: 0.81,
    sum: 0.81,
  });
});

it("keeps the cent rounding on the invoice when VAT-inclusive net rounds down", () => {
  const extraction = buildExtraction();
  Object.assign(extraction.invoice, {
    amountExcludingVat: 0.52,
    vatAmount: 0.13,
    totalAmount: 0.65,
  });
  Object.assign(extraction.rows[0], { price: 0.65, sum: 0.65, vatRate: 24 });

  expect(normalizeInvoiceExtraction(extraction)).toMatchObject({
    invoice: { roundingAmount: 0.01 },
    rows: [{ price: 0.52, sum: 0.52 }],
  });
});

it("preserves non-amount rows while converting VAT-inclusive receipt rows", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 0.81;
  extraction.invoice.vatAmount = 0.19;
  extraction.invoice.totalAmount = 1;
  extraction.rows = [
    {
      ...extraction.rows[0],
      description: "Receipt note",
      price: null,
      sum: null,
      vatRate: null,
    },
    {
      ...extraction.rows[0],
      description: "Receipt item",
      price: 1,
      sum: 1,
      vatRate: 24,
    },
  ];

  expect(normalizeInvoiceExtraction(extraction).rows).toMatchObject([
    { description: "Receipt note", price: null, sum: null },
    { description: "Receipt item", price: 0.81, sum: 0.81 },
  ]);
});

it("ignores non-amount rows while reconciling receipt row rounding", () => {
  const extraction = buildExtraction();
  extraction.invoice.amountExcludingVat = 0.8;
  extraction.invoice.vatAmount = 0.2;
  extraction.invoice.totalAmount = 1;
  extraction.rows = [
    {
      ...extraction.rows[0],
      description: "Receipt note",
      price: null,
      sum: null,
      vatRate: null,
    },
    {
      ...extraction.rows[0],
      description: "Receipt item",
      price: 1,
      sum: 1,
      vatRate: 24,
    },
  ];

  expect(normalizeInvoiceExtraction(extraction).rows).toMatchObject([
    { description: "Receipt note", price: null, sum: null },
    { description: "Receipt item", price: 0.8, sum: 0.8 },
  ]);
});

it("moves standalone rounding notes into the rounding amount field", () => {
  const extraction = buildExtraction();
  extraction.invoice.notes = "Ümardus: 0,01";

  expect(normalizeInvoiceExtraction(extraction).invoice).toMatchObject({
    roundingAmount: 0.01,
    notes: null,
  });
});

it("normalizes draft amounts and coerces missing numeric values to null", () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = undefined as unknown as number | null;
  draft.invoice.vatAmount = undefined as unknown as number | null;
  draft.invoice.totalAmount = undefined as unknown as number | null;
  draft.payment.paymentAmount = undefined as unknown as number | null;
  draft.rows[0].price = null;
  draft.rows[0].sum = null;
  draft.rows[0].manualReviewReason = "  Amount needs checking.  ";

  expect(normalizeInvoiceImportDraft(draft)).toMatchObject({
    invoice: {
      amountExcludingVat: null,
      vatAmount: null,
      totalAmount: null,
    },
    payment: {
      paymentAmount: null,
    },
    rows: [
      {
        price: null,
        sum: null,
        needsManualReview: true,
        manualReviewReason: "Amount needs checking.",
      },
    ],
  });
});

it("preserves exact draft amounts while normalizing nulls", () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = 181.294;
  draft.invoice.vatAmount = 39.884;
  draft.invoice.totalAmount = 221.178;
  draft.payment.paymentAmount = 221.178;
  draft.rows[0].price = 0.3333;
  draft.rows[0].sum = 1.239;

  expect(normalizeInvoiceImportDraft(draft)).toMatchObject({
    invoice: {
      amountExcludingVat: 181.294,
      vatAmount: 39.884,
      totalAmount: 221.178,
    },
    payment: {
      paymentAmount: 221.178,
    },
    rows: [
      {
        price: 0.3333,
        sum: 1.239,
      },
    ],
  });
});

it("moves draft rounding notes into the separate rounding amount field", () => {
  const draft = buildDraft();
  draft.invoice.notes = "Rounding amount: 0.01";

  expect(normalizeInvoiceImportDraft(draft).invoice).toMatchObject({
    roundingAmount: 0.01,
    notes: null,
  });
});
