import {
  ProviderReferenceAccount,
  ProviderReferenceData,
  ProviderReferenceTaxCode,
  ProviderResolvedRow,
} from "./accounting-provider-types";
import {
  InvoiceExtraction,
  InvoiceExtractionRow,
} from "./invoice-import-types";
import {
  COMPUTER_ACCOUNT_HINTS,
  DURABLE_IT_KEYWORDS,
  FUEL_AND_CAR_HINTS,
  IT_ACCESSORY_KEYWORDS,
  IT_SUPPLIES_HINTS,
  LOW_VALUE_ASSET_HINTS,
  NON_PURCHASE_HINTS,
  RESALE_HINTS,
} from "./provider-import-keywords";

function normalizeNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function compactDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const compact = value.replace(/[^0-9]/g, "");
  return compact || null;
}

function normalizeSearchTerm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreCandidate(haystack: string, needles: string[]): number {
  const normalizedHaystack = normalizeSearchTerm(haystack);
  let score = 0;

  for (const needle of needles) {
    const normalizedNeedle = normalizeSearchTerm(needle);
    if (!normalizedNeedle) {
      continue;
    }

    if (normalizedHaystack.includes(normalizedNeedle)) {
      score += normalizedNeedle.length;
    }
  }

  return score;
}

function tokenize(value: string): string[] {
  return normalizeSearchTerm(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

function containsAnyTerm(haystack: string, terms: string[]): boolean {
  const normalizedHaystack = normalizeSearchTerm(haystack)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  return terms.some((term) =>
    normalizedHaystack.includes(
      normalizeSearchTerm(term)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, ""),
    ),
  );
}

function scoreTokenOverlap(haystack: string, needles: string[]): number {
  const haystackTokens = new Set(tokenize(haystack));
  const needleTokens = needles.flatMap((needle) => tokenize(needle));
  let score = 0;

  for (const token of needleTokens) {
    if (haystackTokens.has(token)) {
      score += token.length;
    }
  }

  return score;
}

function scoreBaseAccountFit(label: string, hints: string[]): number {
  return scoreCandidate(label, hints) + scoreTokenOverlap(label, hints);
}

function scoreItPurchaseAdjustments(params: {
  label: string;
  rowText: string;
  amount: number;
  accountSelectionReason: string;
}): number {
  const { label, rowText, amount, accountSelectionReason } = params;
  const hasDurableItKeyword = containsAnyTerm(rowText, DURABLE_IT_KEYWORDS);
  const hasAccessoryKeyword = containsAnyTerm(rowText, IT_ACCESSORY_KEYWORDS);
  const hasSerialNumber = containsAnyTerm(rowText, [
    "serial",
    "serial number",
    "seerianumber",
  ]);
  const looksLikeResalePurchase =
    containsAnyTerm(rowText, [
      "inventory",
      "resale",
      "stock",
      "edasimüük",
      "edasi müük",
    ]) || containsAnyTerm(accountSelectionReason, RESALE_HINTS);

  if (!hasDurableItKeyword && !hasAccessoryKeyword && !hasSerialNumber) {
    return 0;
  }

  let score = 0;
  score += scorePreferredItAccounts(label, hasAccessoryKeyword, amount);
  score += scorePurchasePenalties(label, looksLikeResalePurchase);

  return score;
}

function scorePreferredItAccounts(
  label: string,
  hasAccessoryKeyword: boolean,
  amount: number,
): number {
  let score = 0;

  if (containsAnyTerm(label, LOW_VALUE_ASSET_HINTS)) {
    score += 26;
    if (amount > 0 && amount <= 500) {
      score += 6;
    }
  }

  if (containsAnyTerm(label, COMPUTER_ACCOUNT_HINTS)) {
    score += hasAccessoryKeyword ? 14 : 22;
  }

  if (containsAnyTerm(label, IT_SUPPLIES_HINTS)) {
    score += hasAccessoryKeyword ? 24 : 4;
  }

  return score;
}

function scorePurchasePenalties(
  label: string,
  looksLikeResalePurchase: boolean,
): number {
  let score = 0;

  if (!looksLikeResalePurchase && containsAnyTerm(label, RESALE_HINTS)) {
    score -= 24;
  }

  if (containsAnyTerm(label, FUEL_AND_CAR_HINTS)) {
    score -= 28;
  }

  if (containsAnyTerm(label, NON_PURCHASE_HINTS)) {
    score -= 18;
  }

  return score;
}

function scoreAccountFit(params: {
  account: ProviderReferenceAccount;
  row: InvoiceExtractionRow;
  extraction: InvoiceExtraction;
}): number {
  const label = `${params.account.code} ${params.account.label}`;
  const hints = [
    params.row.description,
    params.extraction.vendor.name ?? "",
    params.extraction.invoice.notes ?? "",
    params.row.accountSelectionReason,
  ];
  const rowText = `${params.row.description} ${params.extraction.invoice.notes ?? ""}`;
  const amount =
    normalizeNumber(params.row.sum) ?? normalizeNumber(params.row.price) ?? 0;

  return (
    scoreBaseAccountFit(label, hints) +
    scoreItPurchaseAdjustments({
      label,
      rowText,
      amount,
      accountSelectionReason: params.row.accountSelectionReason,
    })
  );
}

function chooseBestPurchaseAccount(params: {
  accounts: ProviderReferenceAccount[];
  extraction: InvoiceExtraction;
  row: InvoiceExtractionRow;
}): { account: ProviderReferenceAccount | null; score: number } {
  const candidateAccounts = params.accounts.filter((account) => {
    const type = account.type?.toUpperCase();
    return type === "EXPENSE" || type === "ASSET" || type === undefined;
  });

  const ranked = candidateAccounts
    .map((account) => ({
      account,
      score: scoreAccountFit({
        account,
        extraction: params.extraction,
        row: params.row,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  return {
    account: best?.account ?? candidateAccounts[0] ?? null,
    score: best?.score ?? Number.NEGATIVE_INFINITY,
  };
}

function buildRowCode(
  row: { description: string; accountCode: string },
  index: number,
): string {
  const base =
    row.description
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 8) ||
    row.accountCode.replace(/[^A-Z0-9]+/g, "").slice(0, 8) ||
    "IMPORT";

  return `${base}${String(index + 1).padStart(2, "0")}`;
}

export function generateFallbackInvoiceNumber(params: {
  extraction: InvoiceExtraction;
  fingerprint: string;
}): string {
  const datePart =
    compactDate(params.extraction.invoice.issueDate) ??
    compactDate(params.extraction.invoice.entryDate) ??
    new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return `AUTO-${datePart}-${params.fingerprint.slice(0, 8).toUpperCase()}`;
}

export function fallbackRowFromInvoice(
  extraction: InvoiceExtraction,
): InvoiceExtractionRow {
  return {
    sourceArticleCode: null,
    description:
      extraction.invoice.notes ??
      extraction.vendor.name ??
      extraction.invoice.invoiceNumber ??
      "Imported invoice",
    quantity: 1,
    unit: null,
    price:
      extraction.invoice.amountExcludingVat ??
      extraction.invoice.totalAmount ??
      null,
    sum:
      extraction.invoice.totalAmount ??
      extraction.invoice.amountExcludingVat ??
      null,
    vatRate: null,
    vatPc: null,
    accountPurchase: null,
    accountSelectionReason:
      "Fallback summarized row created because the AI response did not include rows.",
    needsManualReview: true,
    manualReviewReason:
      "AI did not extract individual rows; verify this fallback row manually.",
  };
}

export function findReferenceAccountByCode(
  accounts: ProviderReferenceAccount[],
  code: string | null | undefined,
): ProviderReferenceAccount | null {
  if (!code) {
    return null;
  }

  return accounts.find((account) => account.code === code) ?? null;
}

export function chooseFallbackPurchaseAccount(params: {
  accounts: ProviderReferenceAccount[];
  descriptions: string[];
}): ProviderReferenceAccount | null {
  const candidateAccounts = params.accounts.filter((account) => {
    const type = account.type?.toUpperCase();
    return type === "EXPENSE" || type === "ASSET" || type === undefined;
  });

  const ranked = candidateAccounts
    .map((account) => ({
      account,
      score:
        scoreCandidate(
          `${account.code} ${account.label}`,
          params.descriptions,
        ) +
        scoreTokenOverlap(
          `${account.code} ${account.label}`,
          params.descriptions,
        ),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].account : (candidateAccounts[0] ?? null);
}

export function resolveTaxCode(
  row: InvoiceExtractionRow,
  taxCodes: ProviderReferenceTaxCode[],
  fallbackTaxCode?: string,
): string | undefined {
  if (row.vatPc && taxCodes.some((taxCode) => taxCode.code === row.vatPc)) {
    return row.vatPc;
  }

  if (row.vatRate === null || row.vatRate === undefined) {
    return fallbackTaxCode;
  }

  const match = taxCodes.find((taxCode) => taxCode.rate === row.vatRate);
  return match?.code ?? fallbackTaxCode;
}

function inferInvoiceLevelTaxCode(
  extraction: InvoiceExtraction,
  taxCodes: ProviderReferenceTaxCode[],
): string | undefined {
  const vatAmount = normalizeNumber(extraction.invoice.vatAmount);
  const amountExcludingVat = normalizeNumber(
    extraction.invoice.amountExcludingVat,
  );
  const hasExplicitRowTax = extraction.rows.some(
    (row) => row.vatPc || (row.vatRate !== null && row.vatRate !== undefined),
  );

  if (
    !vatAmount ||
    vatAmount <= 0 ||
    !amountExcludingVat ||
    amountExcludingVat <= 0 ||
    hasExplicitRowTax
  ) {
    return undefined;
  }

  const effectiveRate = (vatAmount / amountExcludingVat) * 100;
  const rankedMatches = taxCodes
    .filter(
      (taxCode): taxCode is ProviderReferenceTaxCode & { rate: number } =>
        typeof taxCode.rate === "number" && taxCode.rate > 0,
    )
    .map((taxCode) => ({
      code: taxCode.code,
      distance: Math.abs(taxCode.rate - effectiveRate),
    }))
    .filter((match) => match.distance <= 0.6)
    .sort((left, right) => left.distance - right.distance);

  return rankedMatches[0]?.code;
}

export function resolvePurchaseRows(params: {
  extraction: InvoiceExtraction;
  referenceData: ProviderReferenceData;
}): ProviderResolvedRow[] {
  const sourceRows = params.extraction.rows.length
    ? params.extraction.rows
    : [fallbackRowFromInvoice(params.extraction)];
  const inferredInvoiceTaxCode = inferInvoiceLevelTaxCode(
    params.extraction,
    params.referenceData.taxCodes,
  );

  return sourceRows.map((row, index) => {
    const matchedAccount = findReferenceAccountByCode(
      params.referenceData.accounts,
      row.accountPurchase,
    );
    const bestAccountMatch = chooseBestPurchaseAccount({
      accounts: params.referenceData.accounts,
      extraction: params.extraction,
      row,
    });
    const matchedScore = matchedAccount
      ? scoreAccountFit({
          account: matchedAccount,
          extraction: params.extraction,
          row,
        })
      : Number.NEGATIVE_INFINITY;
    const shouldOverrideMatchedAccount =
      matchedAccount &&
      bestAccountMatch.account &&
      bestAccountMatch.account.code !== matchedAccount.code &&
      bestAccountMatch.score >= matchedScore + 12;
    const chosenAccount = shouldOverrideMatchedAccount
      ? bestAccountMatch.account
      : (matchedAccount ?? bestAccountMatch.account);

    if (!chosenAccount) {
      throw new Error(
        `Could not find a purchase account for row "${row.description}".`,
      );
    }

    return {
      code: buildRowCode(
        {
          description: row.description,
          accountCode: chosenAccount.code,
        },
        index,
      ),
      description: row.description,
      quantity: normalizeNumber(row.quantity) ?? 1,
      unit: row.unit ?? undefined,
      price: normalizeNumber(row.price),
      sum: normalizeNumber(row.sum),
      taxCode: resolveTaxCode(
        row,
        params.referenceData.taxCodes,
        inferredInvoiceTaxCode,
      ),
      accountCode: chosenAccount.code,
      accountSelectionReason:
        shouldOverrideMatchedAccount && matchedAccount
          ? `${row.accountSelectionReason} Adjusted account from ${matchedAccount.label} to ${chosenAccount.label} because the row text matches ${chosenAccount.label} much better.`
          : matchedAccount
            ? row.accountSelectionReason
            : `${row.accountSelectionReason} Fallback selected ${chosenAccount.label} based on row/vendor text overlap.`,
    };
  });
}

export function uniqueAccounts(
  rows: ProviderResolvedRow[],
  accounts: ProviderReferenceAccount[],
) {
  const seen = new Map<
    string,
    { code: string; label: string; reason: string }
  >();

  for (const row of rows) {
    if (seen.has(row.accountCode)) {
      continue;
    }

    const account = findReferenceAccountByCode(accounts, row.accountCode);
    seen.set(row.accountCode, {
      code: row.accountCode,
      label: account?.label ?? row.accountCode,
      reason: row.accountSelectionReason,
    });
  }

  return [...seen.values()];
}
