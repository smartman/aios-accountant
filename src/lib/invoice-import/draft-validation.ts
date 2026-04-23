import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "../invoice-import-types";
import { formatInvoiceImportRowLabel } from "./row-label";

function validateHeader(draft: InvoiceImportDraft, errors: string[]): void {
  if (!draft.vendor.name?.trim()) {
    errors.push("Vendor name is required.");
  }

  if (!draft.invoice.invoiceNumber?.trim()) {
    errors.push("Invoice number is required.");
  }

  if (!draft.invoice.issueDate?.trim()) {
    errors.push("Invoice date is required.");
  }

  if (!draft.rows.length) {
    errors.push("Invoice must contain at least one row.");
  }
}

function normalizeDuplicateValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function draftMatchesDuplicateInvoice(
  draft: InvoiceImportDraft,
): boolean {
  if (!draft.duplicateInvoice) {
    return false;
  }

  const duplicateVendorName = normalizeDuplicateValue(
    draft.duplicateInvoice.vendorName,
  );
  const draftVendorName = normalizeDuplicateValue(draft.vendor.name);
  const duplicateInvoiceNumber = normalizeDuplicateValue(
    draft.duplicateInvoice.invoiceNumber,
  );
  const draftInvoiceNumber = normalizeDuplicateValue(
    draft.invoice.invoiceNumber,
  );

  return (
    duplicateVendorName === draftVendorName &&
    duplicateInvoiceNumber === draftInvoiceNumber
  );
}

function validateExistingArticleRow(
  row: InvoiceImportDraftRow,
  errors: string[],
): void {
  if (!row.selectedArticleCode?.trim()) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} must select an accounting article.`,
    );
  }

  const selectedArticle = row.selectedArticleCode
    ? (row.articleCandidates.find(
        (candidate) => candidate.code === row.selectedArticleCode,
      ) ?? null)
    : null;
  const selectedArticleUnit = selectedArticle?.unit?.trim();
  const rowUnit = row.unit?.trim() ?? "";

  if (selectedArticleUnit && rowUnit !== selectedArticleUnit) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} must use unit ${selectedArticleUnit} for article ${row.selectedArticleCode}.`,
    );
  }
}

function shouldCreateArticle(row: InvoiceImportDraftRow): boolean {
  return row.articleDecision === "create";
}

function validateRow(row: InvoiceImportDraftRow, errors: string[]): void {
  if (!row.description.trim()) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} is missing a description.`,
    );
  }

  if (!row.accountCode.trim()) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} is missing a purchase account.`,
    );
  }

  if (!row.reviewed) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} must be reviewed before confirming.`,
    );
  }

  if (shouldCreateArticle(row)) {
    errors.push(
      `${formatInvoiceImportRowLabel(row.id)} must select an accounting article. In-app article creation is no longer supported.`,
    );
    return;
  }

  validateExistingArticleRow(row, errors);
}

function validatePayment(draft: InvoiceImportDraft, errors: string[]): void {
  if (!draft.actions.recordPayment) {
    return;
  }

  if (!draft.payment.paymentDate?.trim()) {
    errors.push("Payment date is required when recording payment.");
  }

  if (
    typeof draft.payment.paymentAmount !== "number" ||
    !Number.isFinite(draft.payment.paymentAmount)
  ) {
    errors.push("Payment amount is required when recording payment.");
  }
}

export function validateDraft(draft: InvoiceImportDraft): string[] {
  const errors: string[] = [];

  validateHeader(draft, errors);
  draft.rows.forEach((row) => validateRow(row, errors));
  validatePayment(draft, errors);

  return errors;
}
