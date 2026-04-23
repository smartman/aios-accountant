import { SmartAccountsCredentials } from "../../accounting-provider-types";
import {
  SmartAccountsAccount,
  SmartAccountsArticle,
  SmartAccountsBankAccount,
  SmartAccountsCashAccount,
  SmartAccountsVendor,
} from "../../invoice-import-types";
import {
  CACHE_TTLS,
  accountLabel,
  asRecord,
  cachedValue,
  extractArray,
  namespacedCacheKey,
  normalizeVendor,
  setCachedValue,
  smartAccountsRequest,
  toOptionalString,
} from "./core";
import { getArticles } from "./loaders";

type SmartAccountsPaymentAccount =
  | ({ type: "BANK" } & SmartAccountsBankAccount)
  | ({ type: "CASH" } & SmartAccountsCashAccount);

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

export function chooseUnpaidAccount(
  accounts: SmartAccountsAccount[],
): SmartAccountsAccount | null {
  const keywords = [
    "supplier",
    "suppliers",
    "vendor",
    "vendors",
    "payable",
    "accounts payable",
    "ostuvõlg",
    "ostuvolg",
    "hankija",
    "creditor",
  ];

  const ranked = accounts
    .map((account) => ({
      account,
      score:
        scoreCandidate(`${account.code} ${accountLabel(account)}`, keywords) +
        (account.type?.toUpperCase() === "LIABILITY" ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].account : null;
}

export async function findVendor(
  credentials: SmartAccountsCredentials,
  searchTerm: string,
): Promise<SmartAccountsVendor | null> {
  const cacheKey = namespacedCacheKey(
    credentials,
    `vendor:${normalizeSearchTerm(searchTerm)}`,
  );
  return cachedValue(cacheKey, CACHE_TTLS.vendors, async () => {
    const response = await smartAccountsRequest<unknown>(
      "/purchasesales/vendors",
      "get",
      credentials,
      {
        query: {
          nameOrRegCode: searchTerm,
          pageNumber: 1,
        },
      },
    );

    const vendors = extractArray(response, ["vendors"])
      .map(asRecord)
      .filter(Boolean)
      .map((record) => (record ? normalizeVendor(record) : null))
      .filter((vendor): vendor is SmartAccountsVendor => vendor !== null);
    return vendors[0] ?? null;
  });
}

export async function createVendor(
  credentials: SmartAccountsCredentials,
  vendor: SmartAccountsVendor,
): Promise<{ vendorId: string }> {
  const response = await smartAccountsRequest<Record<string, unknown>>(
    "/purchasesales/vendors",
    "add",
    credentials,
    {
      httpMethod: "POST",
      body: vendor,
    },
  );

  const vendorId = toOptionalString(response.vendorId ?? response.id);
  if (!vendorId) {
    throw new Error("SmartAccounts did not return a vendor id.");
  }

  if (vendor.regCode) {
    setCachedValue(
      namespacedCacheKey(
        credentials,
        `vendor:${normalizeSearchTerm(vendor.regCode)}`,
      ),
      CACHE_TTLS.vendors,
      {
        ...vendor,
        id: vendorId,
      },
    );
  }

  setCachedValue(
    namespacedCacheKey(
      credentials,
      `vendor:${normalizeSearchTerm(vendor.name)}`,
    ),
    CACHE_TTLS.vendors,
    {
      ...vendor,
      id: vendorId,
    },
  );

  return { vendorId };
}

export async function findArticleByCode(
  credentials: SmartAccountsCredentials,
  code: string,
): Promise<SmartAccountsArticle | null> {
  const cachedArticles = await getArticles(credentials);
  const cachedMatch = cachedArticles.find((article) => article.code === code);
  if (cachedMatch) {
    return cachedMatch;
  }

  const response = await smartAccountsRequest<unknown>(
    "/purchasesales/articles",
    "get",
    credentials,
    {
      query: {
        code,
        pageNumber: 1,
      },
    },
  );

  const articles = extractArray(response, ["articles"])
    .map(asRecord)
    .filter(Boolean)
    .map((record): SmartAccountsArticle | null => {
      if (!record) {
        return null;
      }

      const articleCode = toOptionalString(record.code);
      if (!articleCode) {
        return null;
      }

      return {
        code: articleCode,
        description: toOptionalString(record.description),
        unit: toOptionalString(record.unit),
        type: toOptionalString(record.type),
        activePurchase:
          typeof record.activePurchase === "boolean"
            ? record.activePurchase
            : undefined,
        activeSales:
          typeof record.activeSales === "boolean"
            ? record.activeSales
            : undefined,
        accountPurchase: toOptionalString(record.accountPurchase),
        vatPc: toOptionalString(record.vatPc),
      };
    })
    .filter((article): article is SmartAccountsArticle => article !== null);

  const match = articles[0] ?? null;
  if (match) {
    setCachedValue(
      namespacedCacheKey(credentials, "articles"),
      CACHE_TTLS.articles,
      [...cachedArticles, match],
    );
  }

  return match;
}

export async function findExistingVendorInvoice(
  credentials: SmartAccountsCredentials,
  vendorId: string,
  invoiceNumber: string,
  dateFrom: string,
): Promise<{ invoiceId: string } | null> {
  const response = await smartAccountsRequest<unknown>(
    "/purchasesales/vendorinvoices",
    "get",
    credentials,
    {
      query: {
        vendorId,
        invoiceNumber,
        dateFrom,
        pageNumber: 1,
      },
    },
  );

  const invoices = extractArray<Record<string, unknown>>(response, [
    "vendorInvoices",
    "invoices",
  ]);
  const first = invoices[0];
  if (!first) {
    return null;
  }

  const invoiceId = toOptionalString(first.id ?? first.invoiceId);
  return invoiceId ? { invoiceId } : null;
}

export async function createVendorInvoice(
  credentials: SmartAccountsCredentials,
  body: Record<string, unknown>,
): Promise<{ invoiceId: string }> {
  const response = await smartAccountsRequest<Record<string, unknown>>(
    "/purchasesales/vendorinvoices",
    "add",
    credentials,
    {
      httpMethod: "POST",
      body,
    },
  );

  const invoiceId = toOptionalString(response.invoiceId ?? response.id);
  if (!invoiceId) {
    throw new Error("SmartAccounts did not return an invoice id.");
  }

  return { invoiceId };
}

export async function createPayment(
  credentials: SmartAccountsCredentials,
  body: Record<string, unknown>,
): Promise<{ paymentId: string }> {
  const response = await smartAccountsRequest<Record<string, unknown>>(
    "/purchasesales/payments",
    "add",
    credentials,
    {
      httpMethod: "POST",
      body,
    },
  );

  const paymentId = toOptionalString(response.paymentId ?? response.id);
  if (!paymentId) {
    throw new Error("SmartAccounts did not return a payment id.");
  }

  return { paymentId };
}

function paymentAccountSortOrder(order: string | undefined): number {
  if (!order) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Number(order);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function rankPaymentAccount(
  account: SmartAccountsPaymentAccount,
  desiredCurrency: string,
  preferredType: "BANK" | "CASH",
): number {
  let score = 0;

  if (account.type === preferredType) {
    score += 20;
  }

  if (
    (account.currency ?? "EUR").toUpperCase() === desiredCurrency.toUpperCase()
  ) {
    score += 10;
  } else if ((account.currency ?? "").toUpperCase() === "EUR") {
    score += 3;
  }

  if (account.type === "BANK") {
    if (account.forNetting) {
      score += 8;
    }
    if (account.defaultEInvoiceAccount) {
      score += 2;
    }
  }

  score -= paymentAccountSortOrder(account.order) / 1000;
  return score;
}

export function choosePaymentAccount(params: {
  bankAccounts: SmartAccountsBankAccount[];
  cashAccounts: SmartAccountsCashAccount[];
  currency: string;
  channelHint: "BANK" | "CASH" | null;
}): SmartAccountsPaymentAccount | null {
  const preferredType = params.channelHint ?? "BANK";
  const candidates: SmartAccountsPaymentAccount[] = [
    ...params.bankAccounts.map((account) => ({
      ...account,
      type: "BANK" as const,
    })),
    ...params.cashAccounts.map((account) => ({
      ...account,
      type: "CASH" as const,
    })),
  ];

  const ranked = candidates
    .map((account) => ({
      account,
      score: rankPaymentAccount(account, params.currency, preferredType),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.account ?? null;
}

export function findAccountByCode(
  accounts: SmartAccountsAccount[],
  code: string | null | undefined,
): SmartAccountsAccount | null {
  if (!code) {
    return null;
  }
  return accounts.find((account) => account.code === code) ?? null;
}

export function chooseFallbackPurchaseAccount(params: {
  accounts: SmartAccountsAccount[];
  descriptions: string[];
}): SmartAccountsAccount | null {
  const candidateAccounts = params.accounts.filter((account) => {
    const type = account.type?.toUpperCase();
    return type === "EXPENSE" || type === "ASSET" || type === undefined;
  });

  const ranked = candidateAccounts
    .map((account) => ({
      account,
      score: scoreCandidate(
        `${account.code} ${accountLabel(account)}`,
        params.descriptions,
      ),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].account : (candidateAccounts[0] ?? null);
}

export function formatAccountLabel(
  account: SmartAccountsAccount | null,
): string {
  if (!account) {
    return "Unknown account";
  }
  const label = accountLabel(account);
  return label ? `${account.code} - ${label}` : account.code;
}

export function chooseRelevantArticle(params: {
  articles: SmartAccountsArticle[];
  description: string;
  accountPurchase: string;
  unit?: string;
  vatPc?: string;
}): SmartAccountsArticle | null {
  const candidates = params.articles.filter((article) => {
    if (article.activePurchase === false) {
      return false;
    }
    if (
      article.accountPurchase &&
      article.accountPurchase !== params.accountPurchase
    ) {
      return false;
    }
    return true;
  });

  const ranked = candidates
    .map((article) => {
      let score = scoreCandidate(
        `${article.code} ${article.description ?? ""}`,
        [params.description],
      );

      if (article.accountPurchase === params.accountPurchase) {
        score += 20;
      }
      if (params.unit && article.unit === params.unit) {
        score += 5;
      }
      if (params.vatPc && article.vatPc === params.vatPc) {
        score += 5;
      }

      return { article, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].article : null;
}
