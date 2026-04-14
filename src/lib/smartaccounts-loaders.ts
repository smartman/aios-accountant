import { SmartAccountsCredentials } from "./accounting-provider-types";
import {
  SmartAccountsAccount,
  SmartAccountsArticle,
  SmartAccountsBankAccount,
  SmartAccountsCashAccount,
  SmartAccountsVatPc,
} from "./invoice-import-types";
import {
  asRecord,
  CACHE_TTLS,
  cachedValue,
  extractArray,
  isNonNull,
  namespacedCacheKey,
  smartAccountsRequest,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalString,
} from "./smartaccounts-core";

function normalizeAccount(
  record: Record<string, unknown>,
): SmartAccountsAccount | null {
  const code = toOptionalString(record.code);
  if (!code) {
    return null;
  }

  return {
    code,
    type: toOptionalString(record.type),
    name: toOptionalString(record.name),
    nameEt: toOptionalString(record.nameEt),
    nameEn: toOptionalString(record.nameEn),
    description:
      toOptionalString(record.description) ??
      toOptionalString(record.descriptionEn) ??
      toOptionalString(record.descriptionEt),
    descriptionEt: toOptionalString(record.descriptionEt),
    descriptionEn: toOptionalString(record.descriptionEn),
  };
}

function normalizeBankAccount(
  record: Record<string, unknown>,
): SmartAccountsBankAccount | null {
  const name = toOptionalString(record.name);
  if (!name) {
    return null;
  }

  return {
    name,
    account: toOptionalString(record.account),
    currency: toOptionalString(record.currency),
    iban: toOptionalString(record.iban),
    swift: toOptionalString(record.swift),
    forNetting: toOptionalBoolean(record.forNetting),
    defaultEInvoiceAccount: toOptionalBoolean(record.defaultEInvoiceAccount),
    order: toOptionalString(record.order),
  };
}

function normalizeCashAccount(
  record: Record<string, unknown>,
): SmartAccountsCashAccount | null {
  const name = toOptionalString(record.name);
  if (!name) {
    return null;
  }

  return {
    name,
    account: toOptionalString(record.account),
    currency: toOptionalString(record.currency),
    order: toOptionalString(record.order),
  };
}

function normalizeVatPc(
  record: Record<string, unknown>,
): SmartAccountsVatPc | null {
  const vatPc = toOptionalString(record.vatPc);
  if (!vatPc) {
    return null;
  }

  return {
    vatPc,
    percent: toOptionalNumber(
      record.percent ?? record.pc ?? record.vat ?? record.vatPercent,
    ),
    description:
      toOptionalString(record.description) ??
      toOptionalString(record.descriptionEn) ??
      toOptionalString(record.descriptionEt),
    descriptionEt: toOptionalString(record.descriptionEt),
    descriptionEn: toOptionalString(record.descriptionEn),
    accountPurchase: toOptionalString(record.accountPurchase),
    accountSales: toOptionalString(record.accountSales),
  };
}

function normalizeArticle(
  record: Record<string, unknown>,
): SmartAccountsArticle | null {
  const code = toOptionalString(record.code);
  if (!code) {
    return null;
  }

  return {
    code,
    description: toOptionalString(record.description),
    unit: toOptionalString(record.unit),
    type: toOptionalString(record.type),
    activePurchase: toOptionalBoolean(record.activePurchase),
    activeSales: toOptionalBoolean(record.activeSales),
    accountPurchase: toOptionalString(record.accountPurchase),
    vatPc: toOptionalString(record.vatPc),
  };
}

export async function getAccounts(
  credentials: SmartAccountsCredentials,
): Promise<SmartAccountsAccount[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "accounts"),
    CACHE_TTLS.accounts,
    async () => {
      const response = await smartAccountsRequest<unknown>(
        "/settings/accounts",
        "get",
        credentials,
      );
      return extractArray(response, ["accounts"])
        .map(asRecord)
        .filter(isNonNull)
        .map(normalizeAccount)
        .filter(isNonNull);
    },
  );
}

export async function getVatPcs(
  credentials: SmartAccountsCredentials,
): Promise<SmartAccountsVatPc[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "vatPcs"),
    CACHE_TTLS.vatPcs,
    async () => {
      const response = await smartAccountsRequest<unknown>(
        "/settings/vatpcs",
        "get",
        credentials,
      );
      return extractArray(response, ["vatpcs", "vatPcs"])
        .map(asRecord)
        .filter(isNonNull)
        .map(normalizeVatPc)
        .filter(isNonNull);
    },
  );
}

export async function getBankAccounts(
  credentials: SmartAccountsCredentials,
): Promise<SmartAccountsBankAccount[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "bankAccounts"),
    CACHE_TTLS.bankAccounts,
    async () => {
      const response = await smartAccountsRequest<unknown>(
        "/settings/bankaccounts",
        "get",
        credentials,
      );
      return extractArray(response, ["bankAccounts", "bankaccounts"])
        .map(asRecord)
        .filter(isNonNull)
        .map(normalizeBankAccount)
        .filter(isNonNull);
    },
  );
}

export async function getCashAccounts(
  credentials: SmartAccountsCredentials,
): Promise<SmartAccountsCashAccount[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "cashAccounts"),
    CACHE_TTLS.cashAccounts,
    async () => {
      const response = await smartAccountsRequest<unknown>(
        "/settings/cashaccounts",
        "get",
        credentials,
      );
      return extractArray(response, ["cashAccounts", "cashaccounts"])
        .map(asRecord)
        .filter(isNonNull)
        .map(normalizeCashAccount)
        .filter(isNonNull);
    },
  );
}

export async function getArticles(
  credentials: SmartAccountsCredentials,
): Promise<SmartAccountsArticle[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "articles"),
    CACHE_TTLS.articles,
    async () => {
      const response = await smartAccountsRequest<unknown>(
        "/purchasesales/articles",
        "get",
        credentials,
        {
          query: {
            pageNumber: 1,
          },
        },
      );

      return extractArray(response, ["articles"])
        .map(asRecord)
        .filter(isNonNull)
        .map(normalizeArticle)
        .filter(isNonNull);
    },
  );
}
