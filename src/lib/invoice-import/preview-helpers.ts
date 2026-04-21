import { ProviderCatalogArticle } from "../accounting-provider-activities";
import { ProviderRuntimeContext } from "../accounting-provider-types";

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

export function buildPreviewArticleTypeOptions(
  catalog: ProviderCatalogArticle[],
): string[] {
  const uniqueTypes = new Set(
    catalog
      .map((article) => article.type?.trim())
      .filter((type): type is string => Boolean(type)),
  );

  return uniqueTypes.size ? [...uniqueTypes].sort() : ["SERVICE"];
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
