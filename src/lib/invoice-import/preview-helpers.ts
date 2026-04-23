import { ProviderCatalogArticle } from "../accounting-provider-activities";
import { ProviderRuntimeContext } from "../accounting-provider-types";

export function createRowId(index: number): string {
  return `row-${index + 1}`;
}

function rankPaymentAccount(params: {
  account: {
    type: "BANK" | "CASH";
    currency?: string;
  };
  desiredCurrency: string;
  preferredType: "BANK" | "CASH";
}) {
  let score = 0;

  if (params.account.type === params.preferredType) {
    score += 20;
  }

  if (
    (params.account.currency ?? "EUR").toUpperCase() ===
    params.desiredCurrency.toUpperCase()
  ) {
    score += 10;
  } else if ((params.account.currency ?? "").toUpperCase() === "EUR") {
    score += 3;
  }

  if (params.account.type === "BANK") {
    score += 1;
  }

  return score;
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
  const rankedAccounts = paymentAccounts
    .map((account) => ({
      account,
      score: rankPaymentAccount({
        account,
        desiredCurrency: currency,
        preferredType,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  return rankedAccounts[0]?.account.name ?? null;
}

export function buildPreviewArticleOptions(catalog: ProviderCatalogArticle[]) {
  return [...catalog]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((article) => ({
      code: article.code,
      description: article.description ?? null,
      unit: article.unit ?? null,
      purchaseAccountCode: article.purchaseAccountCode ?? null,
      taxCode: article.taxCode ?? null,
      type: article.type ?? null,
    }));
}

function appendUnitOption(
  options: Set<string>,
  value: string | null | undefined,
) {
  const normalized = value?.trim();
  if (normalized) {
    options.add(normalized);
  }
}

export function buildPreviewUnitOptions(params: {
  catalog: ProviderCatalogArticle[];
  context: ProviderRuntimeContext;
}): string[] {
  const units = new Set<string>();

  appendUnitOption(units, "pcs");

  for (const article of params.catalog) {
    appendUnitOption(units, article.unit);
  }

  if (params.context.provider === "smartaccounts") {
    for (const article of params.context.raw?.articles ?? []) {
      appendUnitOption(units, article.unit);
    }
  } else {
    for (const unit of params.context.raw?.units ?? []) {
      appendUnitOption(units, unit.name);
      appendUnitOption(units, unit.code);
    }

    for (const item of params.context.raw?.items ?? []) {
      appendUnitOption(units, item.unit);
    }
  }

  return [...units].sort((left, right) => left.localeCompare(right));
}

export function buildPreviewDuplicateInvoice(params: {
  duplicateInvoiceId: string | null;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  invoiceNumber: string | null;
}) {
  if (
    !params.duplicateInvoiceId ||
    !params.vendorMatch ||
    !params.invoiceNumber
  ) {
    return null;
  }

  return {
    invoiceId: params.duplicateInvoiceId,
    vendorName: params.vendorMatch.vendorName.trim(),
    invoiceNumber: params.invoiceNumber.trim(),
  };
}
