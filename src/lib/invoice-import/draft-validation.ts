import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "../invoice-import-types";

function normalizeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function computeRowNet(row: InvoiceImportDraftRow): number {
  if (typeof row.sum === "number" && Number.isFinite(row.sum)) {
    return row.sum;
  }

  if (
    typeof row.price === "number" &&
    Number.isFinite(row.price) &&
    typeof row.quantity === "number" &&
    Number.isFinite(row.quantity)
  ) {
    return Number((row.price * row.quantity).toFixed(2));
  }

  return 0;
}

export function computeDraftNetTotal(rows: InvoiceImportDraftRow[]): number {
  return Number(
    rows.reduce((sum, row) => sum + computeRowNet(row), 0).toFixed(2),
  );
}

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

  const draftNet = computeDraftNetTotal(draft.rows);
  const headerNet = normalizeNumber(draft.invoice.amountExcludingVat);
  if (Math.abs(draftNet - headerNet) > 0.01) {
    errors.push("Invoice header net amount must match the sum of row amounts.");
  }
}

function validateExistingArticleRow(
  row: InvoiceImportDraftRow,
  errors: string[],
): void {
  if (!row.selectedArticleCode?.trim()) {
    errors.push(`Row ${row.id} must select an accounting article.`);
  }
}

function validateNewArticleRow(
  row: InvoiceImportDraftRow,
  errors: string[],
): void {
  if (!row.newArticle.code.trim() || !row.newArticle.description.trim()) {
    errors.push(`Row ${row.id} must define the new accounting article.`);
  }
}

function validateRow(row: InvoiceImportDraftRow, errors: string[]): void {
  if (!row.description.trim()) {
    errors.push(`Row ${row.id} is missing a description.`);
  }

  if (!row.accountCode.trim()) {
    errors.push(`Row ${row.id} is missing a purchase account.`);
  }

  if (!row.reviewed) {
    errors.push(`Row ${row.id} must be reviewed before confirming.`);
  }

  if (row.articleDecision === "existing") {
    validateExistingArticleRow(row, errors);
    return;
  }

  validateNewArticleRow(row, errors);
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
