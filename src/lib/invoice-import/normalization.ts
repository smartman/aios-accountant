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
  const manualReviewReason = row.manualReviewReason?.trim() || null;

  return {
    ...row,
    price: normalizeNumber(row.price) ?? null,
    sum: normalizeNumber(row.sum) ?? null,
    needsManualReview: Boolean(row.needsManualReview || manualReviewReason),
    manualReviewReason,
  };
}

function normalizeExtractionRow(
  row: InvoiceExtraction["rows"][number],
): InvoiceExtraction["rows"][number] {
  const manualReviewReason = row.manualReviewReason?.trim() || null;

  return {
    ...row,
    price: normalizeNumber(row.price) ?? null,
    sum: normalizeNumber(row.sum) ?? null,
    needsManualReview: Boolean(row.needsManualReview || manualReviewReason),
    manualReviewReason,
  };
}

function amountsClose(
  left: number | null | undefined,
  right: number | null | undefined,
  tolerance = 0.02,
): boolean {
  return (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right) &&
    Math.abs(roundAmount(left)! - roundAmount(right)!) <= tolerance
  );
}

function sumRows(rows: Array<{ sum?: number | null }>): number {
  return roundAmount(
    rows.reduce(
      (total, row) =>
        typeof row.sum === "number" && Number.isFinite(row.sum)
          ? total + row.sum
          : total,
      0,
    ),
  )!;
}

function rowVatMultiplier(row: InvoiceExtraction["rows"][number]) {
  return typeof row.vatRate === "number" &&
    Number.isFinite(row.vatRate) &&
    row.vatRate > 0
    ? 1 + row.vatRate / 100
    : null;
}

function cents(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(roundAmount(value)! * 100)
    : null;
}

function deriveRowVatRoundingAmount(
  invoice: {
    amountExcludingVat?: number | null;
    totalAmount?: number | null;
  },
  rows: Array<{ sum?: number | null; vatRate?: number | null }>,
): number | null {
  if (
    typeof invoice.totalAmount !== "number" ||
    !Number.isFinite(invoice.totalAmount) ||
    !amountsClose(sumRows(rows), invoice.amountExcludingVat)
  ) {
    return null;
  }

  let hasTaxedRows = false;
  const rowVatAmount = roundAmount(
    rows.reduce((total, row) => {
      if (
        typeof row.sum !== "number" ||
        !Number.isFinite(row.sum) ||
        typeof row.vatRate !== "number" ||
        !Number.isFinite(row.vatRate) ||
        row.vatRate <= 0
      ) {
        return total;
      }

      hasTaxedRows = true;
      return total + roundAmount((row.sum * row.vatRate) / 100)!;
    }, 0),
  )!;

  if (!hasTaxedRows) {
    return null;
  }

  const derivedRoundingAmount = roundAmount(
    invoice.totalAmount - sumRows(rows) - rowVatAmount,
  )!;

  return derivedRoundingAmount !== 0 && Math.abs(derivedRoundingAmount) <= 0.02
    ? derivedRoundingAmount
    : null;
}

function reconcileConvertedReceiptRows(params: {
  originalRows: InvoiceExtraction["rows"];
  convertedRows: InvoiceExtraction["rows"];
  targetNetAmount: number | null | undefined;
}): InvoiceExtraction["rows"] {
  const targetCents = cents(params.targetNetAmount)!;
  const convertedCents = cents(sumRows(params.convertedRows))!;

  const centsDelta = targetCents - convertedCents;
  if (centsDelta === 0) {
    return params.convertedRows;
  }

  const candidates = params.originalRows
    .map((row, index) => {
      const vatMultiplier = rowVatMultiplier(row);
      const convertedSum = params.convertedRows[index]?.sum;
      if (
        !vatMultiplier ||
        typeof row.sum !== "number" ||
        !Number.isFinite(row.sum) ||
        typeof convertedSum !== "number" ||
        !Number.isFinite(convertedSum)
      ) {
        return null;
      }

      return {
        index,
        residual: row.sum / vatMultiplier - convertedSum,
      };
    })
    .filter((candidate): candidate is { index: number; residual: number } =>
      Boolean(candidate),
    )
    .sort((left, right) =>
      centsDelta > 0
        ? right.residual - left.residual
        : left.residual - right.residual,
    );

  if (!candidates.length || Math.abs(centsDelta) > candidates.length) {
    return params.convertedRows;
  }

  const nextRows = params.convertedRows.map((row) => ({ ...row }));
  const centsStep = centsDelta > 0 ? 0.01 : -0.01;
  for (let index = 0; index < Math.abs(centsDelta); index += 1) {
    const row = nextRows[candidates[index]!.index];
    row.sum = roundAmount((row.sum ?? 0) + centsStep)!;
    row.price =
      typeof row.quantity === "number" &&
      Number.isFinite(row.quantity) &&
      row.quantity !== 0
        ? roundAmount(row.sum / row.quantity)!
        : row.sum;
  }

  return nextRows;
}

function convertTaxIncludedReceiptRows(
  extraction: InvoiceExtraction,
): InvoiceExtraction["rows"] {
  if (
    !amountsClose(sumRows(extraction.rows), extraction.invoice.totalAmount) ||
    amountsClose(
      sumRows(extraction.rows),
      extraction.invoice.amountExcludingVat,
    )
  ) {
    return extraction.rows;
  }

  const canConvertRows = extraction.rows.every(
    (row) => typeof row.sum !== "number" || rowVatMultiplier(row),
  );
  if (!canConvertRows) {
    return extraction.rows;
  }

  const convertedRows = extraction.rows.map((row) => {
    const vatMultiplier = rowVatMultiplier(row);
    if (!vatMultiplier) {
      return row;
    }

    const convertedSum =
      typeof row.sum === "number" && Number.isFinite(row.sum)
        ? roundAmount(row.sum / vatMultiplier)!
        : row.sum;
    const convertedPrice =
      typeof convertedSum === "number" &&
      Number.isFinite(convertedSum) &&
      typeof row.quantity === "number" &&
      Number.isFinite(row.quantity) &&
      row.quantity !== 0
        ? roundAmount(convertedSum / row.quantity)!
        : typeof row.price === "number" && Number.isFinite(row.price)
          ? roundAmount(row.price / vatMultiplier)!
          : row.price;

    return {
      ...row,
      price: convertedPrice,
      sum: convertedSum,
    };
  });

  if (
    !amountsClose(
      sumRows(convertedRows),
      extraction.invoice.amountExcludingVat,
      0.05,
    )
  ) {
    return convertedRows;
  }

  return reconcileConvertedReceiptRows({
    originalRows: extraction.rows,
    convertedRows,
    targetNetAmount: extraction.invoice.amountExcludingVat,
  });
}

function normalizeDimension<
  TDimension extends
    | {
        code?: string | null;
        name?: string | null;
        reason?: string | null;
      }
    | null
    | undefined,
>(dimension: TDimension) {
  return {
    code: dimension?.code?.trim() || null,
    name: dimension?.name?.trim() || null,
    reason: dimension?.reason?.trim() || null,
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
>(
  invoice: TInvoice,
  rows?: Array<{ sum?: number | null; vatRate?: number | null }>,
): TInvoice {
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
      normalizeNumber(
        rows ? deriveRowVatRoundingAmount(invoice, rows) : null,
      ) ??
      null,
    notes: remainingNotes.join("\n") || null,
  };
}

export function normalizeInvoiceExtraction(
  extraction: InvoiceExtraction,
): InvoiceExtraction {
  const invoice = normalizeInvoiceFields(extraction.invoice);
  const amountNormalizedExtraction = {
    ...extraction,
    invoice,
    rows: extraction.rows.map(normalizeExtractionRow),
  };
  const rows = convertTaxIncludedReceiptRows(amountNormalizedExtraction);
  const normalizedExtraction: InvoiceExtraction = {
    ...amountNormalizedExtraction,
    invoice: normalizeInvoiceFields(invoice, rows),
    payment: {
      ...extraction.payment,
      paymentAmount: normalizeNumber(extraction.payment.paymentAmount) ?? null,
    },
    dimension: normalizeDimension(extraction.dimension),
    rows,
  };

  return {
    ...normalizedExtraction,
    warnings: normalizeExtractionWarnings(normalizedExtraction),
  };
}

export function normalizeInvoiceImportDraft(
  draft: InvoiceImportDraft,
): InvoiceImportDraft {
  const rows = draft.rows.map(normalizeDraftRowAmounts);

  return {
    ...draft,
    invoice: normalizeInvoiceFields(draft.invoice, rows),
    payment: {
      ...draft.payment,
      paymentAmount: normalizeNumber(draft.payment.paymentAmount) ?? null,
    },
    dimension: normalizeDimension(draft.dimension),
    rows,
  };
}
