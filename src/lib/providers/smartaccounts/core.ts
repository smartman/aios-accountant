import crypto from "node:crypto";
import { SmartAccountsCredentials } from "../../accounting-provider-types";
import {
  SmartAccountsAccount,
  SmartAccountsVendor,
} from "../../invoice-import-types";

const SMARTACCOUNTS_TIMEZONE = "Europe/Tallinn";
const SMARTACCOUNTS_API_ROOT = "https://sa.smartaccounts.eu/en/api";

export const CACHE_TTLS = {
  accounts: 10 * 60 * 1000,
  vatPcs: 10 * 60 * 1000,
  bankAccounts: 10 * 60 * 1000,
  cashAccounts: 10 * 60 * 1000,
  articles: 5 * 60 * 1000,
  vendors: 5 * 60 * 1000,
} as const;

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightCache = new Map<string, Promise<unknown>>();

export function clearSmartAccountsCachesForTests(): void {
  memoryCache.clear();
  inflightCache.clear();
}

function assertCredentials(
  credentials: SmartAccountsCredentials,
): SmartAccountsCredentials {
  if (!credentials.apiKey.trim() || !credentials.secretKey.trim()) {
    throw new Error("SmartAccounts API key and secret key are required.");
  }

  return credentials;
}

export function getSmartAccountsCacheNamespace(
  credentials: SmartAccountsCredentials,
): string {
  return crypto
    .createHash("sha256")
    .update(
      `smartaccounts:${credentials.apiKey}:${credentials.secretKey}`,
      "utf8",
    )
    .digest("hex");
}

function smartAccountsTimestamp(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: SMARTACCOUNTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}${get("month")}${get("year")}${get("hour")}${get("minute")}${get("second")}`;
}

function serializeBody(body: unknown): string {
  return body ? JSON.stringify(body) : "";
}

export function signSmartAccountsRequest(
  query: string,
  bodyText: string,
  credentials: SmartAccountsCredentials,
): string {
  return crypto
    .createHmac("sha256", assertCredentials(credentials).secretKey)
    .update(query + bodyText, "utf8")
    .digest("hex");
}

async function readSmartAccountsError(
  response: Response,
  requestLabel: string,
): Promise<string> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : text;
    return `SmartAccounts ${requestLabel} ${response.status}: ${message}`;
  } catch {
    return `SmartAccounts ${requestLabel} ${response.status}: ${text || response.statusText}`;
  }
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    searchParams.set(key, String(value));
  });

  return searchParams.toString();
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

export function namespacedCacheKey(
  credentials: SmartAccountsCredentials,
  key: string,
): string {
  return `${getSmartAccountsCacheNamespace(credentials)}:${key}`;
}

export async function smartAccountsRequest<T>(
  path: string,
  methodName: string,
  credentials: SmartAccountsCredentials,
  options?: {
    httpMethod?: "GET" | "POST";
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const publicKey = assertCredentials(credentials).apiKey;
  const timestamp = smartAccountsTimestamp();
  const bodyText = serializeBody(options?.body);
  const query = buildQuery({
    ...(options?.query ?? {}),
    timestamp,
    apikey: publicKey,
  });
  const signature = signSmartAccountsRequest(query, bodyText, credentials);
  const url = `${SMARTACCOUNTS_API_ROOT}${path}:${methodName}?${query}&signature=${signature}`;
  const requestLabel = `${options?.httpMethod ?? (options?.body ? "POST" : "GET")} ${path}:${methodName}`;

  const response = await fetch(url, {
    method: options?.httpMethod ?? (options?.body ? "POST" : "GET"),
    headers: bodyText
      ? {
          "Content-Type": "application/json; charset=utf-8",
        }
      : undefined,
    body: bodyText || undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readSmartAccountsError(response, requestLabel));
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

export function extractArray<T = Record<string, unknown>>(
  value: unknown,
  preferredKeys: string[],
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  for (const key of preferredKeys) {
    if (Array.isArray(record[key])) {
      return record[key] as T[];
    }
  }

  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate)) {
      return candidate as T[];
    }
  }

  return [];
}

export function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function accountLabel(account: SmartAccountsAccount): string {
  const uniqueParts = new Set(
    [
      account.name,
      account.nameEn,
      account.nameEt,
      account.description,
      account.descriptionEn,
      account.descriptionEt,
    ].filter(Boolean),
  );

  return [...uniqueParts].join(" / ");
}

export function normalizeVendor(
  record: Record<string, unknown>,
): SmartAccountsVendor | null {
  const id = toOptionalString(record.id ?? record.vendorId);
  const name = toOptionalString(record.name);
  if (!name) {
    return null;
  }

  const addressRecord = asRecord(record.address);

  return {
    id,
    name,
    regCode: toOptionalString(record.regCode),
    vatNumber: toOptionalString(record.vatNumber),
    bankAccount: toOptionalString(record.bankAccount),
    referenceNumber: toOptionalString(record.referenceNumber),
    accountUnpaid: toOptionalString(record.accountUnpaid),
    address: addressRecord
      ? {
          country: toOptionalString(addressRecord.country),
          county: toOptionalString(addressRecord.county),
          city: toOptionalString(addressRecord.city),
          address1: toOptionalString(addressRecord.address1),
          address2: toOptionalString(addressRecord.address2),
          postalCode: toOptionalString(addressRecord.postalCode),
        }
      : undefined,
  };
}
