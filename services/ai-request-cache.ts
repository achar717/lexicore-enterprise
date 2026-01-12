/**
 * AI Request Cache Service
 * LexiCore Phase 4: Production Enhancements
 * 
 * Purpose: Cache AI responses to reduce costs and improve performance
 * - TTL-based expiration (default 24 hours)
 * - Hash-based deduplication
 * - Hit tracking for analytics
 * - Automatic cleanup of expired entries
 */

import type { D1Database } from '@cloudflare/workers-types';
import { createHash } from 'crypto';

export interface CacheRequest {
  provider: string;
  model: string;
  messages: any[];
  temperature?: number;
  maxTokens?: number;
}

export interface CacheEntry {
  id: string;
  requestHash: string;
  provider: string;
  model: string;
  responseContent: string;
  tokensUsed: number;
  createdAt: string;
  expiresAt: string;
  hitCount: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  totalHits: number;
  cacheSize: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export class AIRequestCache {
  private db: D1Database;
  private defaultTTL: number = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(db: D1Database, ttlMs?: number) {
    this.db = db;
    if (ttlMs) {
      this.defaultTTL = ttlMs;
    }
  }

  /**
   * Generate a deterministic hash for a cache request
   */
  private generateHash(request: CacheRequest): string {
    const normalized = {
      provider: request.provider.toLowerCase(),
      model: request.model.toLowerCase(),
      messages: request.messages,
      temperature: request.temperature || 0.7,
      maxTokens: request.maxTokens || 2000
    };
    
    const hashInput = JSON.stringify(normalized);
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get cached response if available and not expired
   */
  async get(request: CacheRequest): Promise<string | null> {
    try {
      const hash = this.generateHash(request);
      const now = new Date().toISOString();

      // Get cache entry
      const result = await this.db
        .prepare(`
          SELECT 
            response_content,
            expires_at,
            hit_count
          FROM ai_request_cache
          WHERE request_hash = ?
            AND expires_at > ?
        `)
        .bind(hash, now)
        .first<{ response_content: string; expires_at: string; hit_count: number }>();

      if (!result) {
        console.log('🔍 Cache MISS:', hash.substring(0, 12));
        return null;
      }

      // Update hit count
      await this.db
        .prepare(`
          UPDATE ai_request_cache
          SET hit_count = hit_count + 1
          WHERE request_hash = ?
        `)
        .bind(hash)
        .run();

      console.log('✅ Cache HIT:', hash.substring(0, 12), `(hits: ${result.hit_count + 1})`);
      return result.response_content;
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  /**
   * Store response in cache
   */
  async set(request: CacheRequest, responseContent: string, tokensUsed: number): Promise<void> {
    try {
      const hash = this.generateHash(request);
      const id = `CACHE-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.defaultTTL);

      await this.db
        .prepare(`
          INSERT INTO ai_request_cache (
            id, request_hash, provider, model,
            response_content, tokens_used,
            created_at, expires_at, hit_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(request_hash) DO UPDATE SET
            response_content = excluded.response_content,
            tokens_used = excluded.tokens_used,
            expires_at = excluded.expires_at
        `)
        .bind(
          id,
          hash,
          request.provider,
          request.model,
          responseContent,
          tokensUsed,
          now.toISOString(),
          expiresAt.toISOString()
        )
        .run();

      console.log('💾 Cached response:', hash.substring(0, 12), `(TTL: ${this.defaultTTL / 1000 / 60 / 60}h)`);
    } catch (error) {
      console.error('❌ Cache set error:', error);
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanExpired(): Promise<number> {
    try {
      const now = new Date().toISOString();
      const result = await this.db
        .prepare(`
          DELETE FROM ai_request_cache
          WHERE expires_at < ?
        `)
        .bind(now)
        .run();

      const deleted = result.meta.changes || 0;
      if (deleted > 0) {
        console.log('🧹 Cleaned expired cache entries:', deleted);
      }
      return deleted;
    } catch (error) {
      console.error('❌ Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.db
        .prepare(`
          SELECT 
            COUNT(*) as total_entries,
            SUM(hit_count) as total_hits,
            SUM(LENGTH(response_content)) as cache_size,
            MIN(created_at) as oldest_entry,
            MAX(created_at) as newest_entry
          FROM ai_request_cache
          WHERE expires_at > ?
        `)
        .bind(new Date().toISOString())
        .first<{
          total_entries: number;
          total_hits: number;
          cache_size: number;
          oldest_entry: string | null;
          newest_entry: string | null;
        }>();

      const totalEntries = stats?.total_entries || 0;
      const totalHits = stats?.total_hits || 0;
      const hitRate = totalEntries > 0 ? (totalHits / (totalHits + totalEntries)) * 100 : 0;

      return {
        totalEntries,
        hitRate,
        totalHits,
        cacheSize: stats?.cache_size || 0,
        oldestEntry: stats?.oldest_entry || null,
        newestEntry: stats?.newest_entry || null
      };
    } catch (error) {
      console.error('❌ Cache stats error:', error);
      return {
        totalEntries: 0,
        hitRate: 0,
        totalHits: 0,
        cacheSize: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }

  /**
   * Clear all cache entries (admin operation)
   */
  async clear(): Promise<number> {
    try {
      const result = await this.db
        .prepare(`DELETE FROM ai_request_cache`)
        .run();

      const deleted = result.meta.changes || 0;
      console.log('🗑️  Cleared cache:', deleted, 'entries');
      return deleted;
    } catch (error) {
      console.error('❌ Cache clear error:', error);
      return 0;
    }
  }
}
