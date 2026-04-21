import type { InvoiceImportDraft } from "../invoice-import-types";

export function buildDraft(): InvoiceImportDraft {
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
      invoiceNumber: "INV-CHAIR-2026-001",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: "2026-05-04",
      entryDate: "2026-04-20",
      amountExcludingVat: 120,
      vatAmount: 26.4,
      totalAmount: 146.4,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 146.4,
      paymentChannelHint: "BANK" as const,
      reason: null,
      paymentAccountName: "LHV",
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
        sum: 120,
        vatRate: 22,
        taxCode: "VAT22",
        accountCode: "4004",
        accountSelectionReason: "Matched low-value asset account.",
        articleDecision: "existing" as const,
        reviewed: true,
        selectedArticleCode: "vv",
        selectedArticleDescription: "Väikevahendid kuluks",
        articleCandidates: [],
        suggestionStatus: "ambiguous" as const,
        newArticle: {
          code: "vv",
          description: "Väikevahendid kuluks",
          unit: "pcs",
          type: "SERVICE",
          purchaseAccountCode: "4004",
          taxCode: "VAT22",
        },
      },
    ],
    warnings: [],
    duplicateInvoiceId: null,
  };
}

export function buildSavedConnection() {
  return {
    workosUserId: "user-1",
    provider: "merit" as const,
    credentials: {
      provider: "merit" as const,
      credentials: { apiId: "merit-id", apiKey: "merit-key" },
    },
    summary: {
      provider: "merit" as const,
      label: "Merit",
      detail: "Verified",
      verifiedAt: new Date().toISOString(),
    },
    verifiedAt: new Date(),
  };
}
