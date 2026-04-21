const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightCache = new Map<string, Promise<unknown>>();

export { inflightCache, memoryCache };

export function clearMeritCachesForTests(): void {
  memoryCache.clear();
  inflightCache.clear();
}
