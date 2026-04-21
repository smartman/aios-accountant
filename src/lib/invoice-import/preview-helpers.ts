export function createRowId(index: number): string {
  return `row-${index + 1}`;
}

export function defaultNewArticleCode(row: {
  sourceArticleCode: string | null | undefined;
  description: string;
  accountCode: string;
}): string {
  const direct = row.sourceArticleCode?.trim();
  if (direct) {
    return direct.slice(0, 20).toUpperCase();
  }

  const derived =
    row.description
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || row.accountCode;
  return derived;
}

export function chooseDefaultPaymentAccount(
  paymentAccounts: Array<{
    name: string;
    type: "BANK" | "CASH";
    currency?: string;
  }>,
  currency: string,
  channelHint: "BANK" | "CASH" | null,
): string | null {
  const preferredType = channelHint ?? "BANK";
  return (
    paymentAccounts.find(
      (account) =>
        account.type === preferredType &&
        (account.currency ?? "EUR").toUpperCase() === currency.toUpperCase(),
    )?.name ??
    paymentAccounts.find((account) => account.type === preferredType)?.name ??
    paymentAccounts[0]?.name ??
    null
  );
}
