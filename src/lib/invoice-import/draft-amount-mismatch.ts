import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "../invoice-import-types";

const amountFormatter = new Intl.NumberFormat("et-EE", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  useGrouping: false,
});

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundAmount(value: number): number {
  return Number(value.toFixed(2));
}

function formatAmount(value: number): string {
  return amountFormatter.format(value);
}

function resolveRowNetAmount(row: InvoiceImportDraftRow): number {
  if (isFiniteNumber(row.sum)) {
    return roundAmount(row.sum);
  }

  if (isFiniteNumber(row.price)) {
    return roundAmount(row.price * row.quantity);
  }

  return 0;
}

function resolveRowVatRate(
  row: InvoiceImportDraftRow,
  taxRateByCode: Map<string, number>,
): number {
  if (row.taxCode) {
    const taxRate = taxRateByCode.get(row.taxCode);
    if (isFiniteNumber(taxRate)) {
      return taxRate;
    }
  }

  return isFiniteNumber(row.vatRate) ? row.vatRate : 0;
}

function compareAmount(
  label: string,
  invoiceAmount: number | null,
  rowAmount: number,
): string | null {
  if (!isFiniteNumber(invoiceAmount)) {
    return null;
  }

  const normalizedInvoiceAmount = roundAmount(invoiceAmount);
  const normalizedRowAmount = roundAmount(rowAmount);
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
        isFiniteNumber(taxCode.rate),
      )
      .map((taxCode) => [taxCode.code, taxCode.rate]),
  );

  const rowNetAmount = roundAmount(
    params.draft.rows.reduce((sum, row) => sum + resolveRowNetAmount(row), 0),
  );
  const rowVatAmount = roundAmount(
    params.draft.rows.reduce((sum, row) => {
      const rowNet = resolveRowNetAmount(row);
      const rowVatRate = resolveRowVatRate(row, taxRateByCode);

      return sum + roundAmount((rowNet * rowVatRate) / 100);
    }, 0),
  );
  const rowTotalAmount = roundAmount(rowNetAmount + rowVatAmount);

  const mismatches = [
    compareAmount(
      "Net amount",
      params.draft.invoice.amountExcludingVat,
      rowNetAmount,
    ),
    compareAmount("VAT amount", params.draft.invoice.vatAmount, rowVatAmount),
    compareAmount(
      "Total amount",
      params.draft.invoice.totalAmount,
      rowTotalAmount,
    ),
  ].filter((mismatch): mismatch is string => Boolean(mismatch));

  if (!mismatches.length) {
    return [];
  }

  return [
    `Invoice header amounts do not match the invoice rows: ${mismatches.join("; ")}.`,
  ];
}
