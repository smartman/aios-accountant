interface RowAmountLike {
  quantity?: number | null;
  price?: number | null;
  sum?: number | null;
}

interface InvoiceAmountLike {
  amountExcludingVat?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  roundingAmount?: number | null;
}

export function isFiniteAmount(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function roundCurrencyAmount(value: number): number {
  return Number(value.toFixed(2));
}

function roundAmountToScale(value: number, maxFractionDigits: number): number {
  return Number(value.toFixed(maxFractionDigits));
}

export function resolveAuthoritativeRowNetAmount(
  row: RowAmountLike,
): number | undefined {
  if (isFiniteAmount(row.sum)) {
    return roundCurrencyAmount(row.sum);
  }

  if (isFiniteAmount(row.price)) {
    const quantity = isFiniteAmount(row.quantity) ? row.quantity : 1;
    return roundCurrencyAmount(row.price * quantity);
  }

  return undefined;
}

export function derivePreciseUnitPrice(
  row: RowAmountLike,
  maxFractionDigits = 7,
): number | undefined {
  const quantity = isFiniteAmount(row.quantity) ? row.quantity : 1;

  if (quantity === 0) {
    if (isFiniteAmount(row.price)) {
      return roundAmountToScale(row.price, maxFractionDigits);
    }

    if (isFiniteAmount(row.sum)) {
      return roundAmountToScale(row.sum, maxFractionDigits);
    }

    return undefined;
  }

  if (isFiniteAmount(row.sum)) {
    return roundAmountToScale(row.sum / quantity, maxFractionDigits);
  }

  if (isFiniteAmount(row.price)) {
    return roundAmountToScale(row.price, maxFractionDigits);
  }

  return undefined;
}

export function deriveInvoiceRoundingAmount(
  invoice: InvoiceAmountLike,
): number {
  if (isFiniteAmount(invoice.roundingAmount)) {
    return roundCurrencyAmount(invoice.roundingAmount);
  }

  if (
    !isFiniteAmount(invoice.amountExcludingVat) ||
    !isFiniteAmount(invoice.vatAmount) ||
    !isFiniteAmount(invoice.totalAmount)
  ) {
    return 0;
  }

  return roundCurrencyAmount(
    invoice.totalAmount - invoice.amountExcludingVat - invoice.vatAmount,
  );
}
