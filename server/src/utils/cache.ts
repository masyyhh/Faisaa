import { getRedisClient, isRedisConnected } from './redis.js';

interface MemoryCacheEntry {
  value: unknown;
  expiresAt: number;
}

const localCache = new Map<string, MemoryCacheEntry>();

// Garbage collector for local memory cache every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localCache.entries()) {
    if (entry.expiresAt <= now) {
      localCache.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Retrieve an item from cache (Redis or in-memory fallback)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      // Fallback to local memory on Redis error
    }
  }

  const local = localCache.get(key);
  if (!local) return null;

  if (Date.now() > local.expiresAt) {
    localCache.delete(key);
    return null;
  }

  return local.value as T;
}

/**
 * Store an item in cache with TTL in seconds (default 1 hour = 3600s)
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 3600): Promise<void> {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch {
      // Fallback to local memory on Redis error
    }
  }

  localCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete a specific key from cache
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    try {
      await redis.del(key);
    } catch {
      // Fallback
    }
  }

  localCache.delete(key);
}

/**
 * Invalidate all keys matching a prefix or pattern (e.g. `user:123:*`)
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  if (redis && isRedisConnected()) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Fallback
    }
  }

  const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
  for (const key of localCache.keys()) {
    if (regex.test(key)) {
      localCache.delete(key);
    }
  }
}

/**
 * Domain-specific cache invalidation helpers
 */
export async function invalidateUserCategories(userId: string): Promise<void> {
  await cacheDel(`user:${userId}:categories`);
}

export async function invalidateUserProfile(userId: string): Promise<void> {
  await cacheDel(`user:${userId}:profile`);
}

export async function invalidateExchangeRates(): Promise<void> {
  await cacheDel(`exchange_rates:latest`);
}
