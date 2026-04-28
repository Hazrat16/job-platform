type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlMs),
  });
}

export function cacheDeleteByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (!key.startsWith(prefix)) continue;
    store.delete(key);
  }
}

