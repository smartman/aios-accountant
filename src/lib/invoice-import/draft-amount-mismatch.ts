import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "../invoice-import-types";
import {
  deriveInvoiceRoundingAmount,
  isFiniteAmount,
  resolveAuthoritativeRowNetAmount,
  roundCurrencyAmount,
} from "./amounts";

const amountFormatter = new Intl.NumberFormat("et-EE", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  useGrouping: false,
});

function formatAmount(value: number): string {
  return amountFormatter.format(value);
}

function resolveRowNetAmount(row: InvoiceImportDraftRow): number {
  return resolveAuthoritativeRowNetAmount(row) ?? 0;
}

function resolveRowVatRate(
  row: InvoiceImportDraftRow,
  taxRateByCode: Map<string, number>,
): number {
  if (row.taxCode) {
    const taxRate = taxRateByCode.get(row.taxCode);
    if (isFiniteAmount(taxRate)) {
      return taxRate;
    }
  }

  return isFiniteAmount(row.vatRate) ? row.vatRate : 0;
}

function compareAmount(
  label: string,
  invoiceAmount: number | null,
  rowAmount: number,
): string | null {
  if (!isFiniteAmount(invoiceAmount)) {
    return null;
  }

  const normalizedInvoiceAmount = roundCurrencyAmount(invoiceAmount);
  const normalizedRowAmount = roundCurrencyAmount(rowAmount);
  if (normalizedInvoiceAmount === normalizedRowAmount) {
    return null;
  }

  return `${label} ${formatAmount(normalizedInvoiceAmount)} vs rows ${formatAmount(normalizedRowAmount)}`;
}

export function buildDraftAmountMismatchWarnings(params: {
  draft: InvoiceImportDraft;
  taxCodes: Array<{ code: string; rate?: number | null }>;
}): string[] {
  if (!params.draft.rows.length) {
    return [];
  }

  const taxRateByCode = new Map(
    params.taxCodes
      .filter((taxCode): taxCode is { code: string; rate: number } =>
        isFiniteAmount(taxCode.rate),
      )
      .map((taxCode) => [taxCode.code, taxCode.rate]),
  );

  const rowNetAmount = roundCurrencyAmount(
    params.draft.rows.reduce((sum, row) => sum + resolveRowNetAmount(row), 0),
  );
  const rowVatAmount = roundCurrencyAmount(
    params.draft.rows.reduce((sum, row) => {
      const rowNet = resolveRowNetAmount(row);
      const rowVatRate = resolveRowVatRate(row, taxRateByCode);

      return sum + roundCurrencyAmount((rowNet * rowVatRate) / 100);
    }, 0),
  );
  const roundingAmount = deriveInvoiceRoundingAmount(params.draft.invoice);
  const rowTotalAmount = roundCurrencyAmount(
    rowNetAmount + rowVatAmount + roundingAmount,
  );
  const totalMismatch = compareAmount(
    "Total amount",
    params.draft.invoice.totalAmount,
    rowTotalAmount,
  );
  const vatMismatch = compareAmount(
    "VAT amount",
    params.draft.invoice.vatAmount,
    rowVatAmount,
  );
  const vatMismatchExplainedByRounding =
    !totalMismatch &&
    isFiniteAmount(params.draft.invoice.vatAmount) &&
    roundingAmount !== 0 &&
    roundCurrencyAmount(rowVatAmount + roundingAmount) ===
      roundCurrencyAmount(params.draft.invoice.vatAmount);

  const mismatches = [
    compareAmount(
      "Net amount",
      params.draft.invoice.amountExcludingVat,
      rowNetAmount,
    ),
    vatMismatchExplainedByRounding ? null : vatMismatch,
    totalMismatch,
  ].filter((mismatch): mismatch is string => Boolean(mismatch));

  if (!mismatches.length) {
    return [];
  }

  return [
    `Invoice header amounts do not match the invoice rows: ${mismatches.join("; ")}.`,
  ];
}
