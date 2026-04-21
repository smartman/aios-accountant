import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import {
  ImportResultCard,
  createBlankRow,
  fieldStyle,
  formatCurrency,
  sectionTitle,
  updateRow,
} from "./InvoiceImportReviewShared";

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
    rows: [
      {
        id: "row-2",
        sourceArticleCode: null,
        description: "Existing row",
        quantity: 1,
        unit: "pcs",
        price: 100,
        sum: 100,
        vatRate: 22,
        taxCode: "VAT22",
        accountCode: "4000",
        accountSelectionReason: "Matched.",
        articleDecision: "existing",
        reviewed: true,
        selectedArticleCode: "ARTICLE-1",
        selectedArticleDescription: "Article",
        articleCandidates: [],
        suggestionStatus: "clear",
        newArticle: {
          code: "ARTICLE-1",
          description: "Article",
          unit: "pcs",
          type: "SERVICE",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
        },
      },
    ],
    warnings: [],
    duplicateInvoiceId: null,
  };
}

it("formats currency values and exposes the shared field style", () => {
  expect(formatCurrency(12.5, "EUR")).toContain("€12.50");
  expect(formatCurrency(Number.NaN)).toBe("N/A");
  expect(fieldStyle()).toMatchObject({
    width: "100%",
    borderRadius: "8px",
  });
});

it("updates only the targeted row and renders a section title", () => {
  const draft = buildDraft();
  draft.rows.push({
    ...draft.rows[0],
    id: "row-4",
    description: "Another row",
  });

  const updatedDraft = updateRow(draft, "row-4", (row) => ({
    ...row,
    description: "Changed row",
  }));

  expect(updatedDraft.rows[0].description).toBe("Existing row");
  expect(updatedDraft.rows[1].description).toBe("Changed row");
  expect(renderToStaticMarkup(sectionTitle("Rows"))).toContain(">Rows<");
});

it("creates monotonic row ids after rows have been deleted", () => {
  const newRow = createBlankRow(buildDraft());

  expect(newRow.id).toBe("row-3");
  expect(newRow.newArticle.code).toBe("NEW_3");
});

it("handles drafts whose existing rows do not follow the row-N pattern", () => {
  const draft = buildDraft();
  draft.rows = [{ ...draft.rows[0], id: "custom-row" }];

  const newRow = createBlankRow(draft);

  expect(newRow.id).toBe("row-1");
  expect(newRow.accountCode).toBe("4000");
});

it("falls back to blank account defaults when no rows exist", () => {
  const draft = buildDraft();
  draft.rows = [];

  const newRow = createBlankRow(draft);

  expect(newRow.accountCode).toBe("");
  expect(newRow.newArticle.purchaseAccountCode).toBe("");
});

it("renders import result badges and invoice fallbacks", () => {
  const markup = renderToStaticMarkup(
    <ImportResultCard
      result={{
        provider: "smartaccounts",
        invoiceId: "invoice-1",
        invoiceNumber: null,
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
        createdVendor: true,
        attachedFile: true,
        createdPayment: true,
        paymentId: "payment-1",
        purchaseAccounts: [],
        paymentAccount: { type: "BANK", name: "Main bank" },
        extraction: {
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
            invoiceNumber: null,
            referenceNumber: null,
            currency: null,
            issueDate: "2026-04-20",
            dueDate: null,
            entryDate: "2026-04-20",
            amountExcludingVat: 100,
            vatAmount: 22,
            totalAmount: 122,
            notes: null,
          },
          payment: {
            isPaid: true,
            paymentDate: "2026-04-20",
            paymentAmount: 122,
            paymentChannelHint: "BANK",
            reason: null,
            paymentAccountName: "Main bank",
          },
          rows: [],
          warnings: [],
        },
        alreadyExisted: true,
      }}
    />,
  );

  expect(markup).toContain("SmartAccounts");
  expect(markup).toContain("Already existed");
  expect(markup).toContain("New vendor created");
  expect(markup).toContain("Payment recorded");
  expect(markup).toContain("invoice-1");
  expect(markup).toContain("€100.00");
  expect(markup).toContain("€122.00");
});

it("renders merit results without optional success badges", () => {
  const markup = renderToStaticMarkup(
    <ImportResultCard
      result={{
        provider: "merit",
        invoiceId: "invoice-2",
        invoiceNumber: "INV-2",
        vendorId: "vendor-2",
        vendorName: "Vendor Two",
        createdVendor: false,
        attachedFile: false,
        createdPayment: false,
        paymentId: null,
        purchaseAccounts: [],
        paymentAccount: null,
        extraction: {
          vendor: {
            name: "Vendor Two",
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
            invoiceNumber: "INV-2",
            referenceNumber: null,
            currency: "EUR",
            issueDate: "2026-04-21",
            dueDate: null,
            entryDate: "2026-04-21",
            amountExcludingVat: 50,
            vatAmount: 11,
            totalAmount: 61,
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
          rows: [],
          warnings: [],
        },
        alreadyExisted: false,
      }}
    />,
  );

  expect(markup).toContain("Merit");
  expect(markup).toContain("INV-2");
  expect(markup).not.toContain("Already existed");
  expect(markup).not.toContain("New vendor created");
  expect(markup).not.toContain("Payment recorded");
});
