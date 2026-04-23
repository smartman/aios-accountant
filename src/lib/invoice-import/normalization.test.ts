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

  expect(normalizeInvoiceExtraction(extraction)).toMatchObject({
    invoice: {
      amountExcludingVat: null,
      vatAmount: null,
      totalAmount: null,
    },
    payment: {
      paymentAmount: null,
    },
    rows: [{ price: null, sum: null }],
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

  expect(normalizeInvoiceImportDraft(draft)).toMatchObject({
    invoice: {
      amountExcludingVat: null,
      vatAmount: null,
      totalAmount: null,
    },
    payment: {
      paymentAmount: null,
    },
    rows: [{ price: null, sum: null }],
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
