import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import { buildDuplicateConfirmationMessage } from "./InvoiceImportDuplicatePrompt";

function buildDraft(): InvoiceImportDraft {
  return {
    provider: "merit",
    vendor: {
      name: "ARVUTITARK OÜ",
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
      invoiceNumber: "104026820",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
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
    rows: [],
    warnings: [],
    duplicateInvoice: {
      invoiceId: "invoice-dup",
      vendorName: "ARVUTITARK OÜ",
      invoiceNumber: "104026820",
    },
  };
}

it("builds a confirm dialog message when the draft still matches a duplicate", () => {
  expect(buildDuplicateConfirmationMessage(buildDraft())).toBe(
    'Possible duplicate found for vendor "ARVUTITARK OÜ" and invoice "104026820". Do you want to proceed anyway?',
  );
});

it("does not prompt when the draft no longer matches the duplicate hint", () => {
  const draft = buildDraft();
  draft.invoice.invoiceNumber = "104026821";

  expect(buildDuplicateConfirmationMessage(draft)).toBeNull();
});
