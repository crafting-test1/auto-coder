import type { DeduplicationConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface CacheEntry {
  timestamp: number;
}

export class Deduplicator {
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly ttl: number;
  private readonly maxSize: number;
  private readonly enabled: boolean;

  constructor(config: DeduplicationConfig) {
    this.enabled = config.enabled;
    this.ttl = (config.ttl || 3600) * 1000;
    this.maxSize = config.maxSize || 10000;

    if (this.enabled) {
      this.startCleanup();
    }
  }

  isDuplicate(eventId: string): boolean {
    if (!this.enabled) {
      return false;
    }

    const entry = this.cache.get(eventId);
    const now = Date.now();

    if (entry) {
      if (now - entry.timestamp < this.ttl) {
        logger.debug(`Event ${eventId} is a duplicate`);
        return true;
      }
      this.cache.delete(eventId);
    }

    this.cache.set(eventId, { timestamp: now });

    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    return false;
  }

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value as string | undefined;
    if (firstKey) {
      this.cache.delete(firstKey);
      logger.debug(`Evicted oldest cache entry: ${firstKey}`);
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [eventId, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(eventId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} expired cache entries`);
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
