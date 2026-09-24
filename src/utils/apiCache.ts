import { getRedis } from "../config/redis.js";
import { logWarn } from "./logger.js";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/** Per-process fallback used when Redis isn't configured/reachable. */
const memoryStore = new Map<string, CacheEntry<unknown>>();
const REDIS_KEY_PREFIX = "apicache:";

function memoryGet<T>(key: string): T | null {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value as T;
}

function memorySet<T>(key: string, value: T, ttlMs: number): void {
  memoryStore.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
}

function memoryDeleteByPrefix(prefix: string): void {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return memoryGet<T>(key);

  try {
    const raw = await redis.get(REDIS_KEY_PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    logWarn("apicache_redis_get_failed", { key, error: String(err) });
    return memoryGet<T>(key);
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memorySet(key, value, ttlMs);
    return;
  }

  try {
    await redis.set(
      REDIS_KEY_PREFIX + key,
      JSON.stringify(value),
      "PX",
      Math.max(1, ttlMs),
    );
  } catch (err) {
    logWarn("apicache_redis_set_failed", { key, error: String(err) });
    memorySet(key, value, ttlMs);
  }
}

export async function cacheDeleteByPrefix(prefix: string): Promise<void> {
  memoryDeleteByPrefix(prefix);

  const redis = getRedis();
  if (!redis) return;

  try {
    const matchPattern = `${REDIS_KEY_PREFIX}${prefix}*`;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        matchPattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logWarn("apicache_redis_delete_failed", { prefix, error: String(err) });
  }
}
