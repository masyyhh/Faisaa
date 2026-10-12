import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
let isConnected = false;

export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL || process.env.VALKEY_URL;

  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) return null; // Stop retrying after 3 attempts
          return Math.min(times * 200, 1000);
        },
      });

      redisClient.on('connect', () => {
        isConnected = true;
        console.log('[Redis/Valkey] Connected successfully to distributed cache store.');
      });

      redisClient.on('error', (err) => {
        isConnected = false;
        // Non-fatal warning to avoid crashing the server if Redis is down
        console.warn('[Redis/Valkey] Connection warning:', err.message);
      });

      redisClient.on('close', () => {
        isConnected = false;
      });

      // Non-blocking connection attempt
      redisClient.connect().catch((err) => {
        isConnected = false;
        console.warn('[Redis/Valkey] Initial connection failed, falling back to local memory cache:', err.message);
      });
    } catch (err: unknown) {
      console.warn('[Redis/Valkey] Failed to initialize client:', err instanceof Error ? err.message : String(err));
      redisClient = null;
      isConnected = false;
    }
  }

  return isConnected ? redisClient : null;
}

export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null;
}
