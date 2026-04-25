import crypto from "node:crypto";
import {
  MeritAccount,
  MeritBank,
  MeritCredentials,
  MeritItem,
  MeritPaymentType,
  MeritTax,
  MeritUnit,
} from "../../accounting-provider-types";
import { inflightCache, memoryCache } from "./core-cache";
export const CACHE_TTLS = {
  accounts: 10 * 60 * 1000,
  taxes: 10 * 60 * 1000,
  banks: 10 * 60 * 1000,
  paymentTypes: 10 * 60 * 1000,
  units: 10 * 60 * 1000,
  dimensions: 10 * 60 * 1000,
  items: 10 * 60 * 1000,
  vendors: 5 * 60 * 1000,
  purchaseInvoices: 2 * 60 * 1000,
} as const;
const MERIT_API_ROOT = "https://aktiva.merit.ee";

const MERIT_ENDPOINT_VERSIONS = {
  getaccounts: "v1",
  gettaxes: "v1",
  getbanks: "v1",
  getvendors: "v1",
  getpaymenttypes: "v2",
  getunits: "v1",
  getdimensions: "v2",
  getitems: "v1",
  sendvendor: "v2",
  getpurchorders: "v2",
  getpurchorder: "v2",
  sendpurchinvoice: "v2",
  sendPaymentV: "v2",
} as const satisfies Record<string, "v1" | "v2">;

function meritEndpointUrl(
  endpoint: keyof typeof MERIT_ENDPOINT_VERSIONS,
  query: URLSearchParams,
): string {
  const version = MERIT_ENDPOINT_VERSIONS[endpoint];
  return `${MERIT_API_ROOT}/api/${version}/${endpoint}?${query.toString()}`;
}

function assertMeritCredentials(
  credentials: MeritCredentials,
): MeritCredentials {
  if (!credentials.apiId.trim() || !credentials.apiKey.trim()) {
    throw new Error("Merit API ID and API key are required.");
  }

  return credentials;
}

export function getMeritCacheNamespace(credentials: MeritCredentials): string {
  const cacheScope = credentials.cacheScope ?? "global";
  return crypto
    .createHash("sha256")
    .update(
      `merit:${credentials.apiId}:${credentials.apiKey}:scope:${cacheScope}`,
      "utf8",
    )
    .digest("hex");
}

export function namespacedCacheKey(
  credentials: MeritCredentials,
  key: string,
): string {
  return `${getMeritCacheNamespace(credentials)}:${key}`;
}

function meritTimestamp(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function meritDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, "0")}${String(
    parsed.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function meritDateTime(value: string | null | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate(),
  ).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function serializeBody(body: unknown): string {
  return body ? JSON.stringify(body) : "{}";
}

export async function cachedValue<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inflight = inflightCache.get(key);
  if (inflight) {
    return (await inflight) as T;
  }

  const promise = loader()
    .then((value) => {
      memoryCache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
      });
      inflightCache.delete(key);
      return value;
    })
    .catch((error) => {
      inflightCache.delete(key);
      throw error;
    });

  inflightCache.set(key, promise as Promise<unknown>);
  return promise;
}

export function setCachedValue<T>(key: string, ttlMs: number, value: T): void {
  memoryCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

export function clearCachedValuesByPrefix(prefix: string): void {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  for (const key of inflightCache.keys()) {
    if (key.startsWith(prefix)) {
      inflightCache.delete(key);
    }
  }
}

export function signMeritRequest(
  credentials: MeritCredentials,
  timestamp: string,
  bodyText: string,
): string {
  const hmac = crypto.createHmac(
    "sha256",
    Buffer.from(assertMeritCredentials(credentials).apiKey, "ascii"),
  );
  hmac.update(`${credentials.apiId}${timestamp}${bodyText}`, "utf8");
  return hmac.digest("base64");
}

async function readMeritError(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : text;
    return `Merit ${response.status}: ${message}`;
  } catch {
    return `Merit ${response.status}: ${text || response.statusText}`;
  }
}

export async function meritRequest<T>(
  endpoint: keyof typeof MERIT_ENDPOINT_VERSIONS,
  credentials: MeritCredentials,
  body?: unknown,
): Promise<T> {
  const payload = body ?? {};
  const bodyText = serializeBody(payload);
  const timestamp = meritTimestamp();
  const signature = signMeritRequest(credentials, timestamp, bodyText);
  const query = new URLSearchParams({
    apiId: assertMeritCredentials(credentials).apiId,
    timestamp,
    signature,
  });
  const url = meritEndpointUrl(endpoint, query);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: bodyText,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readMeritError(response));
  }

  return (await response.json()) as T;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function extractList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter(isNonNull);
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord).filter(isNonNull);
    }
  }

  return [record];
}

export function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeAccount(
  record: Record<string, unknown>,
): MeritAccount | null {
  const code = toOptionalString(record.Code);
  if (!code) {
    return null;
  }

  return {
    id: toOptionalString(record.AccountID),
    code,
    name: toOptionalString(record.Name),
    nameEn: toOptionalString(record.NameEN),
    taxName: toOptionalString(record.TaxName),
    taxNameEn: toOptionalString(record.TaxNameEN),
  };
}

function normalizeTax(record: Record<string, unknown>): MeritTax | null {
  const id = toOptionalString(record.Id);
  if (!id) {
    return null;
  }

  return {
    id,
    code: toOptionalString(record.Code) ?? id,
    name: toOptionalString(record.Name) ?? toOptionalString(record.NameEN),
    rate: toOptionalNumber(record.TaxPct),
  };
}

function normalizeBank(record: Record<string, unknown>): MeritBank | null {
  const id = toOptionalString(record.BankId);
  const name = toOptionalString(record.Name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    iban: toOptionalString(record.IBANCode),
    currencyCode: toOptionalString(record.CurrencyCode),
    accountCode: toOptionalString(record.AccountCode),
  };
}

function normalizePaymentType(
  record: Record<string, unknown>,
): MeritPaymentType | null {
  const id = toOptionalString(record.Id);
  const name = toOptionalString(record.Name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    sourceType: toOptionalNumber(record.SourceType),
    currencyCode: toOptionalString(record.CurrencyCode),
  };
}

function normalizeUnit(record: Record<string, unknown>): MeritUnit | null {
  const code = toOptionalString(record.Code);
  const name = toOptionalString(record.Name);
  if (!code || !name) {
    return null;
  }

  return { code, name };
}

function normalizeItem(record: Record<string, unknown>): MeritItem | null {
  const code = toOptionalString(record.Code);
  const description =
    toOptionalString(record.Description) ?? toOptionalString(record.Name);
  if (!code || !description) {
    return null;
  }

  return {
    id: toOptionalString(record.ItemId),
    code,
    description,
    unit: toOptionalString(record.UnitofMeasureName),
    type: toOptionalNumber(record.Type),
    usage: toOptionalNumber(record.Usage),
    purchaseAccountCode: toOptionalString(record.PurchaseAccountCode),
    salesAccountCode: toOptionalString(record.SalesAccountCode),
    inventoryAccountCode: toOptionalString(record.InventoryAccountCode),
    costAccountCode: toOptionalString(record.CostAccountCode),
    taxId: toOptionalString(record.TaxId),
  };
}

export async function getAccounts(
  credentials: MeritCredentials,
): Promise<MeritAccount[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "accounts"),
    CACHE_TTLS.accounts,
    async () => {
      const response = await meritRequest<unknown>(
        "getaccounts",
        credentials,
        {},
      );
      return extractList(response).map(normalizeAccount).filter(isNonNull);
    },
  );
}

export async function getTaxes(
  credentials: MeritCredentials,
): Promise<MeritTax[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "taxes"),
    CACHE_TTLS.taxes,
    async () => {
      const response = await meritRequest<unknown>("gettaxes", credentials, {});
      return extractList(response).map(normalizeTax).filter(isNonNull);
    },
  );
}

export async function getBanks(
  credentials: MeritCredentials,
): Promise<MeritBank[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "banks"),
    CACHE_TTLS.banks,
    async () => {
      const response = await meritRequest<unknown>("getbanks", credentials, {});
      return extractList(response).map(normalizeBank).filter(isNonNull);
    },
  );
}

export async function getPaymentTypes(
  credentials: MeritCredentials,
): Promise<MeritPaymentType[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "paymentTypes"),
    CACHE_TTLS.paymentTypes,
    async () => {
      const response = await meritRequest<unknown>(
        "getpaymenttypes",
        credentials,
        {
          Type: 1,
        },
      );
      return extractList(response).map(normalizePaymentType).filter(isNonNull);
    },
  );
}

export async function getUnits(
  credentials: MeritCredentials,
): Promise<MeritUnit[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "units"),
    CACHE_TTLS.units,
    async () => {
      const response = await meritRequest<unknown>("getunits", credentials, {});
      return extractList(response).map(normalizeUnit).filter(isNonNull);
    },
  );
}

export async function getItems(
  credentials: MeritCredentials,
): Promise<MeritItem[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "items"),
    CACHE_TTLS.items,
    async () => {
      const response = await meritRequest<unknown>("getitems", credentials, {});
      return extractList(response).map(normalizeItem).filter(isNonNull);
    },
  );
}

function meritPeriodDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}${month}${day}`;
}

export async function validateMeritV2Access(
  credentials: MeritCredentials,
): Promise<void> {
  const today = new Date();
  const periodStart = new Date(today.getTime() - 31 * 24 * 60 * 60 * 1000);

  await Promise.all([
    meritRequest<unknown>("getpaymenttypes", credentials, {
      Type: 1,
    }),
    meritRequest<unknown>("getpurchorders", credentials, {
      PeriodStart: meritPeriodDate(periodStart),
      PeriodEnd: meritPeriodDate(today),
      DateType: 1,
    }),
  ]);
}
export { clearMeritCachesForTests } from "./core-cache";
