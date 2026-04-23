import { describe, expect, it } from "vitest";
import type { InvoiceImportDraft } from "../invoice-import-types";
import {
  draftMatchesDuplicateInvoice,
  validateDraft,
} from "./draft-validation";

function buildDraft(): InvoiceImportDraft {
  return {
    provider: "merit" as const,
    vendor: {
      name: "Office Supplies OU",
      regCode: "12345678",
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: "EE",
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
      selectionMode: "create" as const,
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
      amountExcludingVat: 120,
      vatAmount: 26.4,
      totalAmount: 146.4,
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
      createVendor: true,
      recordPayment: false,
    },
    rows: [
      {
        id: "row-1",
        sourceArticleCode: "CHAIR-XL-001",
        description: "Office chair ergonomic",
        quantity: 1,
        unit: "pcs",
        price: 120,
        sum: null,
        vatRate: 22,
        taxCode: "VAT22",
        accountCode: "4004",
        accountSelectionReason: "Matched low-value asset account.",
        reviewed: true,
        selectedArticleCode: "vv",
        selectedArticleDescription: "Väikevahendid kuluks",
        articleCandidates: [],
        suggestionStatus: "clear" as const,
      },
    ],
    warnings: [],
    duplicateInvoice: null,
  };
}

describe("draft validation", () => {
  it("returns no errors for a valid reviewed draft", () => {
    expect(validateDraft(buildDraft())).toEqual([]);
  });

  it("requires at least one invoice row", () => {
    const draft = buildDraft();
    draft.rows = [];
    draft.invoice.amountExcludingVat = 0;

    expect(validateDraft(draft)).toContain(
      "Invoice must contain at least one row.",
    );
  });

  it("reports missing vendor, invoice, and payment fields", () => {
    const draft = buildDraft();
    draft.vendor.name = "";
    draft.invoice.invoiceNumber = "";
    draft.invoice.issueDate = "";
    draft.actions.recordPayment = true;

    expect(validateDraft(draft)).toEqual(
      expect.arrayContaining([
        "Vendor name is required.",
        "Invoice number is required.",
        "Invoice date is required.",
        "Payment date is required when recording payment.",
        "Payment amount is required when recording payment.",
      ]),
    );
  });

  it("reports row-level review and article issues", () => {
    const draft = buildDraft();
    draft.rows[0].description = "";
    draft.rows[0].accountCode = "";
    draft.rows[0].reviewed = false;
    draft.rows[0].selectedArticleCode = "";

    expect(validateDraft(draft)).toEqual(
      expect.arrayContaining([
        "Row 1 is missing a description.",
        "Row 1 is missing a purchase account.",
        "Row 1 must be reviewed before confirming.",
        "Row 1 must select an accounting article.",
      ]),
    );
  });

  it("allows article units to be overridden during review", () => {
    const draft = buildDraft();
    draft.rows[0].unit = null;
    draft.rows[0].articleCandidates = [
      {
        code: "vv",
        description: "Väikevahendid kuluks",
        unit: "tk",
        purchaseAccountCode: "4004",
        taxCode: "VAT22",
        type: "SERVICE",
        score: 100,
        reasons: ["Exact article match."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ];

    expect(validateDraft(draft)).toEqual([]);
  });

  it("treats duplicate matches as confirm-time prompts instead of validation errors", () => {
    const draft = buildDraft();
    draft.duplicateInvoice = {
      invoiceId: "invoice-dup",
      vendorName: "Office Supplies OU",
      invoiceNumber: "INV-1",
    };

    expect(draftMatchesDuplicateInvoice(draft)).toBe(true);
    expect(validateDraft(draft)).toEqual([]);
  });

  it("ignores duplicate hints after the user changes vendor or invoice values", () => {
    const draft = buildDraft();
    draft.duplicateInvoice = {
      invoiceId: "invoice-dup",
      vendorName: "Office Supplies OU",
      invoiceNumber: "INV-1",
    };
    draft.invoice.invoiceNumber = "INV-2";

    expect(draftMatchesDuplicateInvoice(draft)).toBe(false);
  });
});
