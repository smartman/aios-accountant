import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "../invoice-import-types";
import { buildDraftAmountMismatchWarnings } from "./draft-amount-mismatch";

function buildDraft(): InvoiceImportDraft {
  return {
    provider: "smartaccounts",
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
      selectionMode: "existing",
      existingVendorId: "vendor-1",
      existingVendorName: "Vendor OÜ",
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 145.08,
      vatAmount: 34.82,
      totalAmount: 179.9,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
      paymentAccountName: null,
    },
    actions: {
      createVendor: false,
      recordPayment: false,
    },
    rows: [
      {
        id: "row-1",
        sourceArticleCode: null,
        description: "Monitor",
        quantity: 1,
        unit: "pcs",
        price: 145.08,
        sum: 145.08,
        vatRate: 24,
        taxCode: "VAT24",
        accountCode: "4000",
        accountSelectionReason: "Matched account.",
        reviewed: true,
        selectedArticleCode: "ART-1",
        selectedArticleDescription: "Monitor",
        articleCandidates: [],
        suggestionStatus: "clear",
      },
    ],
    warnings: [],
    duplicateInvoice: null,
  };
}

it("returns no warning when invoice amounts match the rows", () => {
  expect(
    buildDraftAmountMismatchWarnings({
      draft: buildDraft(),
      taxCodes: [{ code: "VAT24", rate: 24 }],
    }),
  ).toEqual([]);
});

it("returns a single warning with all mismatching amount groups", () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = 120;
  draft.invoice.vatAmount = 26.4;
  draft.invoice.totalAmount = 146.4;

  expect(
    buildDraftAmountMismatchWarnings({
      draft,
      taxCodes: [{ code: "VAT24", rate: 24 }],
    }),
  ).toEqual([
    "Invoice header amounts do not match the invoice rows: Net amount 120,00 vs rows 145,08; VAT amount 26,40 vs rows 34,82; Total amount 146,40 vs rows 179,90.",
  ]);
});

it("uses price times quantity when the row net sum is empty", () => {
  const draft = buildDraft();
  draft.rows[0].sum = null;
  draft.rows[0].price = 10;
  draft.rows[0].quantity = 2;
  draft.rows[0].taxCode = "VAT22";
  draft.rows[0].vatRate = null;
  draft.invoice.amountExcludingVat = 20;
  draft.invoice.vatAmount = 4.4;
  draft.invoice.totalAmount = 24.4;

  expect(
    buildDraftAmountMismatchWarnings({
      draft,
      taxCodes: [{ code: "VAT22", rate: 22 }],
    }),
  ).toEqual([]);
});

it("treats missing row net values as zero and skips null invoice amounts", () => {
  const draft = buildDraft();
  draft.rows[0].sum = null;
  draft.rows[0].price = null;
  draft.rows[0].vatRate = null;
  draft.rows[0].taxCode = null;
  draft.invoice.amountExcludingVat = 0;
  draft.invoice.vatAmount = null;
  draft.invoice.totalAmount = 0;

  expect(
    buildDraftAmountMismatchWarnings({
      draft,
      taxCodes: [],
    }),
  ).toEqual([]);
});

it("falls back to the row vat rate when the selected tax code has no mapped rate", () => {
  const draft = buildDraft();
  draft.rows[0].taxCode = "VAT-UNKNOWN";

  expect(
    buildDraftAmountMismatchWarnings({
      draft,
      taxCodes: [],
    }),
  ).toEqual([]);
});

it("returns no amount warning when the draft has no rows", () => {
  const draft = buildDraft();
  draft.rows = [];

  expect(
    buildDraftAmountMismatchWarnings({
      draft,
      taxCodes: [{ code: "VAT24", rate: 24 }],
    }),
  ).toEqual([]);
});
