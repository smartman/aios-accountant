import {
  InvoiceExtraction,
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "../invoice-import-types";

const NON_ACTIONABLE_VENDOR_ROLE_WARNING =
  /\b(vendor extraction|vendor was taken from|buyer block|supplier block|invoice recipient|recipient details|bill[- ]to|bill to|arve saaja|ostja|maksja)\b/i;
const ACTIONABLE_VENDOR_AMBIGUITY_WARNING =
  /\b(unclear|uncertain|ambigu(?:ous|ity)|not sure|cannot determine|can't determine|could not determine|conflict|possible)\b/i;
const VENDOR_BANK_WARNING =
  /\b(vendor|supplier).*\b(bank|iban)\b|\b(bank|iban)\b.*\b(vendor|supplier)\b|\bmultiple\b.*\b(bank accounts?|ibans?)\b/i;

export function roundAmount(
  value: number | null | undefined,
): number | null | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeNumber(
  value: number | null | undefined,
): number | null | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }

  return Object.is(value, -0) ? 0 : value;
}

function hasResolvedVendor(extraction: InvoiceExtraction): boolean {
  return Boolean(
    extraction.vendor.name?.trim() ||
    extraction.vendor.regCode?.trim() ||
    extraction.vendor.vatNumber?.trim(),
  );
}

function shouldSuppressWarning(
  warning: string,
  extraction: InvoiceExtraction,
): boolean {
  if (VENDOR_BANK_WARNING.test(warning)) {
    return true;
  }

  return (
    NON_ACTIONABLE_VENDOR_ROLE_WARNING.test(warning) &&
    !ACTIONABLE_VENDOR_AMBIGUITY_WARNING.test(warning) &&
    (hasResolvedVendor(extraction) || /vendor extraction/i.test(warning))
  );
}

export function normalizeExtractionWarnings(
  extraction: InvoiceExtraction,
): string[] {
  const warnings = new Set<string>();

  for (const warning of extraction.warnings) {
    const normalizedWarning = warning.trim();
    if (
      !normalizedWarning ||
      shouldSuppressWarning(normalizedWarning, extraction)
    ) {
      continue;
    }

    warnings.add(normalizedWarning);
  }

  return [...warnings];
}

function normalizeDraftRowAmounts(
  row: InvoiceImportDraftRow,
): InvoiceImportDraftRow {
  return {
    ...row,
    price: normalizeNumber(row.price) ?? null,
    sum: normalizeNumber(row.sum) ?? null,
  };
}

const ROUNDING_NOTE_LINE =
  /^\s*(?:rounding(?: amount)?|ümardus)\s*[:\-]\s*([+-]?\d+(?:[.,]\d+)?)\s*$/iu;

function normalizeInvoiceFields<
  TInvoice extends {
    amountExcludingVat?: number | null;
    vatAmount?: number | null;
    totalAmount?: number | null;
    roundingAmount?: number | null;
    notes?: string | null;
  },
>(invoice: TInvoice): TInvoice {
  let extractedRoundingAmount: number | null = null;
  const noteLines = (invoice.notes ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const remainingNotes = noteLines.filter((line) => {
    const match = line.match(ROUNDING_NOTE_LINE);
    if (!match) {
      return true;
    }

    if (extractedRoundingAmount === null) {
      const normalized = match[1]?.replace(",", ".");
      const parsedAmount = normalized ? Number(normalized) : Number.NaN;
      if (Number.isFinite(parsedAmount)) {
        extractedRoundingAmount = parsedAmount;
      }
    }

    return false;
  });

  return {
    ...invoice,
    amountExcludingVat: normalizeNumber(invoice.amountExcludingVat) ?? null,
    vatAmount: normalizeNumber(invoice.vatAmount) ?? null,
    totalAmount: normalizeNumber(invoice.totalAmount) ?? null,
    roundingAmount:
      normalizeNumber(invoice.roundingAmount) ??
      normalizeNumber(extractedRoundingAmount) ??
      null,
    notes: remainingNotes.join("\n") || null,
  };
}

export function normalizeInvoiceExtraction(
  extraction: InvoiceExtraction,
): InvoiceExtraction {
  const normalizedExtraction: InvoiceExtraction = {
    ...extraction,
    invoice: normalizeInvoiceFields(extraction.invoice),
    payment: {
      ...extraction.payment,
      paymentAmount: normalizeNumber(extraction.payment.paymentAmount) ?? null,
    },
    rows: extraction.rows.map((row) => ({
      ...row,
      price: normalizeNumber(row.price) ?? null,
      sum: normalizeNumber(row.sum) ?? null,
    })),
  };

  return {
    ...normalizedExtraction,
    warnings: normalizeExtractionWarnings(normalizedExtraction),
  };
}

export function normalizeInvoiceImportDraft(
  draft: InvoiceImportDraft,
): InvoiceImportDraft {
  return {
    ...draft,
    invoice: normalizeInvoiceFields(draft.invoice),
    payment: {
      ...draft.payment,
      paymentAmount: normalizeNumber(draft.payment.paymentAmount) ?? null,
    },
    rows: draft.rows.map(normalizeDraftRowAmounts),
  };
}
