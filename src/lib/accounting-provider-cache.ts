import type {
  MeritCredentials,
  SmartAccountsCredentials,
} from "./accounting-provider-types";
import {
  clearCachedValuesByPrefix as clearMeritCachedValuesByPrefix,
  namespacedCacheKey as meritNamespacedCacheKey,
} from "./merit";
import {
  clearCachedValuesByPrefix as clearSmartAccountsCachedValuesByPrefix,
  namespacedCacheKey as smartAccountsNamespacedCacheKey,
} from "./smartaccounts";
import type { StoredAccountingConnection } from "./user-accounting-connections";

export function scopeSmartAccountsCredentials(
  credentials: SmartAccountsCredentials,
  workosUserId: string,
): SmartAccountsCredentials {
  return {
    ...credentials,
    cacheScope: workosUserId,
  };
}

export function scopeMeritCredentials(
  credentials: MeritCredentials,
  workosUserId: string,
): MeritCredentials {
  return {
    ...credentials,
    cacheScope: workosUserId,
  };
}

export function clearStoredConnectionCache(
  savedConnection: StoredAccountingConnection,
): void {
  const cacheScope =
    savedConnection.companyId ?? savedConnection.workosUserId ?? "global";

  if (savedConnection.provider === "smartaccounts") {
    const credentials = scopeSmartAccountsCredentials(
      savedConnection.credentials.credentials as SmartAccountsCredentials,
      cacheScope,
    );
    clearSmartAccountsCachedValuesByPrefix(
      smartAccountsNamespacedCacheKey(credentials, ""),
    );
    return;
  }

  const credentials = scopeMeritCredentials(
    savedConnection.credentials.credentials as MeritCredentials,
    cacheScope,
  );
  clearMeritCachedValuesByPrefix(meritNamespacedCacheKey(credentials, ""));
}
