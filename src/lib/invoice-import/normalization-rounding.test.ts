import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "../invoice-import-types";
import { normalizeInvoiceImportDraft } from "./normalization";

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
      amountExcludingVat: 0.52,
      vatAmount: 0.13,
      totalAmount: 0.65,
      roundingAmount: 0.02,
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
        description: "Small item",
        quantity: 1,
        unit: null,
        price: 0.52,
        sum: 0.52,
        vatRate: 24,
        taxCode: "VAT24",
        accountCode: "4000",
        accountSelectionReason: "Matched account.",
        reviewed: true,
        selectedArticleCode: "ART-1",
        selectedArticleDescription: "Small item",
        articleCandidates: [],
        suggestionStatus: "clear",
      },
    ],
    warnings: [],
    duplicateInvoice: null,
  };
}

it("keeps explicit invoice rounding instead of deriving row VAT rounding", () => {
  expect(normalizeInvoiceImportDraft(buildDraft()).invoice.roundingAmount).toBe(
    0.02,
  );
});
