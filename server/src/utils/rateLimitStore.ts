import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { getRedisClient, isRedisConnected } from './redis.js';

/**
 * Distributed rate-limit store for express-rate-limit.
 * Uses atomic Redis transactions (INCR + EXPIRE) when Redis/Valkey is connected,
 * and gracefully falls back to an in-memory sliding map when running locally.
 */
export class DistributedRateLimitStore implements Store {
  private localMap = new Map<string, { totalHits: number; resetTime: Date }>();
  private windowMs: number = 60000;
  public prefix: string = 'rl:';

  constructor(options?: { prefix?: string }) {
    if (options?.prefix) {
      this.prefix = options.prefix;
    }
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = getRedisClient();
    const fullKey = `${this.prefix}${key}`;

    if (redis && isRedisConnected()) {
      try {
        const pipeline = redis.pipeline();
        pipeline.incr(fullKey);
        pipeline.pttl(fullKey);

        const results = await pipeline.exec();
        if (results && results[0] && results[1]) {
          const hits = (results[0][1] as number) || 1;
          let ttl = (results[1][1] as number) || -1;

          if (ttl === -1) {
            // First increment; set window expiration
            await redis.pexpire(fullKey, this.windowMs);
            ttl = this.windowMs;
          }

          const resetTime = new Date(Date.now() + Math.max(0, ttl));
          return { totalHits: hits, resetTime };
        }
      } catch (err) {
        console.warn('[RateLimitStore] Redis increment failed, using local store fallback:', err);
      }
    }

    // In-memory fallback
    const now = Date.now();
    const existing = this.localMap.get(fullKey);

    if (!existing || existing.resetTime.getTime() <= now) {
      const resetTime = new Date(now + this.windowMs);
      const record = { totalHits: 1, resetTime };
      this.localMap.set(fullKey, record);
      return record;
    }

    existing.totalHits += 1;
    return existing;
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedisClient();
    const fullKey = `${this.prefix}${key}`;

    if (redis && isRedisConnected()) {
      try {
        await redis.decr(fullKey);
        return;
      } catch {
        // Fallback
      }
    }

    const existing = this.localMap.get(fullKey);
    if (existing && existing.totalHits > 0) {
      existing.totalHits -= 1;
    }
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedisClient();
    const fullKey = `${this.prefix}${key}`;

    if (redis && isRedisConnected()) {
      try {
        await redis.del(fullKey);
        return;
      } catch {
        // Fallback
      }
    }

    this.localMap.delete(fullKey);
  }
}
