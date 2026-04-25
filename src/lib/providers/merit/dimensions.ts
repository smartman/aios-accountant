import type {
  MeritCredentials,
  MeritDimension,
} from "../../accounting-provider-types";
import {
  CACHE_TTLS,
  cachedValue,
  extractList,
  isNonNull,
  meritRequest,
  namespacedCacheKey,
  toOptionalNumber,
  toOptionalString,
} from "./core";

function normalizeDimension(
  record: Record<string, unknown>,
): MeritDimension | null {
  const id = toOptionalString(record.Id);
  const code = toOptionalString(record.Code);
  const dimId = toOptionalNumber(record.DimId);
  const name = toOptionalString(record.Name);
  if (!id || !code || typeof dimId !== "number" || !name) {
    return null;
  }

  return {
    dimId,
    dimName: toOptionalString(record.DimName),
    id,
    code,
    name,
    endDate: toOptionalString(record.EndDate),
    nonActive:
      typeof record.NonActive === "boolean" ? record.NonActive : undefined,
    debitPositive:
      typeof record.DebitPositive === "boolean"
        ? record.DebitPositive
        : undefined,
  };
}

export async function getDimensions(
  credentials: MeritCredentials,
): Promise<MeritDimension[]> {
  return cachedValue(
    namespacedCacheKey(credentials, "dimensions"),
    CACHE_TTLS.dimensions,
    async () => {
      const response = await meritRequest<unknown>(
        "getdimensions",
        credentials,
        {
          AllValues: false,
        },
      );
      return extractList(response).map(normalizeDimension).filter(isNonNull);
    },
  );
}
