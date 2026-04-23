import {
  InvoiceExtraction,
  InvoiceExtractionRow,
} from "../invoice-import-types";

const BILLING_PERIOD_PATTERN =
  /\b(?:jaanuar|veebruar|märts|marts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember|january|february|march|april|may|june|july|august|september|october|november|december)\b/giu;
const DELIMITED_SEGMENT_PATTERN = /\s*(?:;|\n)+\s*/u;
const NUMBERED_SEGMENT_PATTERN = /(?:^|[\s;])\d+[.)]\s+\S/gu;

function roundToCents(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountsClose(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  const normalizedLeft = roundToCents(left);
  const normalizedRight = roundToCents(right);

  if (normalizedLeft === null || normalizedRight === null) {
    return false;
  }

  return Math.abs(normalizedLeft - normalizedRight) <= 0.05;
}

function countDelimitedSegments(description: string): number {
  const semicolonOrLineSegments = description
    .split(DELIMITED_SEGMENT_PATTERN)
    .map((segment) => segment.trim())
    .filter(Boolean).length;
  const numberedSegments =
    description.match(NUMBERED_SEGMENT_PATTERN)?.length ?? 0;

  return Math.max(semicolonOrLineSegments, numberedSegments);
}

function countBillingPeriodMentions(description: string): number {
  return description.match(BILLING_PERIOD_PATTERN)?.length ?? 0;
}

function rowLooksLikeInvoiceSummary(
  row: InvoiceExtractionRow,
  extraction: InvoiceExtraction,
): boolean {
  return (
    amountsClose(row.sum, extraction.invoice.amountExcludingVat) ||
    amountsClose(row.sum, extraction.invoice.totalAmount) ||
    amountsClose(row.price, extraction.invoice.amountExcludingVat) ||
    amountsClose(row.price, extraction.invoice.totalAmount)
  );
}

export function shouldRepairMergedInvoiceRows(
  extraction: InvoiceExtraction,
): boolean {
  if (extraction.rows.length !== 1) {
    return false;
  }

  const row = extraction.rows[0];
  const description = row?.description.trim();

  if (!description) {
    return false;
  }

  const hasMultipleDelimitedSegments = countDelimitedSegments(description) > 1;
  const hasRepeatedBillingPeriods = countBillingPeriodMentions(description) > 1;
  const hasLongSummaryDescription =
    description.length >= 80 && rowLooksLikeInvoiceSummary(row, extraction);

  return (
    hasMultipleDelimitedSegments ||
    hasRepeatedBillingPeriods ||
    hasLongSummaryDescription
  );
}

export function shouldUseSeparatedRows(
  extraction: InvoiceExtraction,
  candidateRows: InvoiceExtraction["rows"],
): boolean {
  const nonEmptyRows = candidateRows.filter((row) => row.description.trim());
  return nonEmptyRows.length > extraction.rows.length;
}

export const __test__ = {
  countBillingPeriodMentions,
  countDelimitedSegments,
};
