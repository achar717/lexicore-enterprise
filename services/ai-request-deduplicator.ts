/**
 * AI Request Deduplicator
 * LexiCore Phase 4: Production Enhancements
 * 
 * Purpose: Prevent duplicate in-flight AI requests
 * - Track pending requests by hash
 * - Share results across duplicate requests
 * - Reduce unnecessary API calls and costs
 * - Automatic cleanup on completion/error
 */

import { createHash } from 'crypto';

export interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  requestHash: string;
}

export class AIRequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest<any>>;
  private requestTimeouts: Map<string, NodeJS.Timeout>;
  private readonly defaultTimeout: number = 60000; // 60 seconds

  constructor(timeoutMs?: number) {
    this.pendingRequests = new Map();
    this.requestTimeouts = new Map();
    if (timeoutMs) {
      this.defaultTimeout = timeoutMs;
    }
  }

  /**
   * Generate a deterministic hash for request deduplication
   */
  private generateHash(request: any): string {
    const normalized = JSON.stringify({
      provider: request.provider?.toLowerCase(),
      model: request.model?.toLowerCase(),
      messages: request.messages,
      temperature: request.temperature || 0.7,
      maxTokens: request.maxTokens || 2000
    });
    
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Clean up a completed request
   */
  private cleanup(hash: string): void {
    this.pendingRequests.delete(hash);
    
    const timeout = this.requestTimeouts.get(hash);
    if (timeout) {
      clearTimeout(timeout);
      this.requestTimeouts.delete(hash);
    }
  }

  /**
   * Execute request with deduplication
   * If an identical request is in-flight, return the existing promise
   */
  async deduplicate<T>(
    request: any,
    executorFn: () => Promise<T>
  ): Promise<{ data: T; deduplicated: boolean }> {
    const hash = this.generateHash(request);
    
    // Check for existing in-flight request
    const existing = this.pendingRequests.get(hash);
    if (existing) {
      console.log('🔄 Deduplicated request:', hash.substring(0, 12), `(age: ${Date.now() - existing.timestamp}ms)`);
      
      try {
        const data = await existing.promise;
        return { data, deduplicated: true };
      } catch (error) {
        // If the existing request failed, remove it and retry
        this.cleanup(hash);
        throw error;
      }
    }

    // Execute new request
    console.log('🆕 New request:', hash.substring(0, 12));
    
    const promise = executorFn()
      .then(result => {
        this.cleanup(hash);
        return result;
      })
      .catch(error => {
        this.cleanup(hash);
        throw error;
      });

    // Store pending request
    const pending: PendingRequest<T> = {
      promise,
      timestamp: Date.now(),
      requestHash: hash
    };
    this.pendingRequests.set(hash, pending);

    // Set timeout to prevent memory leaks
    const timeout = setTimeout(() => {
      console.warn('⚠️  Request timeout cleanup:', hash.substring(0, 12));
      this.cleanup(hash);
    }, this.defaultTimeout);
    this.requestTimeouts.set(hash, timeout);

    const data = await promise;
    return { data, deduplicated: false };
  }

  /**
   * Check if a request is currently in-flight
   */
  isPending(request: any): boolean {
    const hash = this.generateHash(request);
    return this.pendingRequests.has(hash);
  }

  /**
   * Get statistics about pending requests
   */
  getStats() {
    const pending = Array.from(this.pendingRequests.values());
    const now = Date.now();
    
    return {
      totalPending: pending.length,
      avgAge: pending.length > 0 
        ? pending.reduce((sum, req) => sum + (now - req.timestamp), 0) / pending.length 
        : 0,
      oldestAge: pending.length > 0
        ? Math.max(...pending.map(req => now - req.timestamp))
        : 0
    };
  }

  /**
   * Clear all pending requests (admin operation)
   */
  clear(): number {
    const count = this.pendingRequests.size;
    
    // Clear all timeouts
    this.requestTimeouts.forEach(timeout => clearTimeout(timeout));
    this.requestTimeouts.clear();
    
    // Clear pending requests
    this.pendingRequests.clear();
    
    console.log('🗑️  Cleared pending requests:', count);
    return count;
  }

  /**
   * Clean up stale requests (older than timeout)
   */
  cleanupStale(): number {
    const now = Date.now();
    const staleHashes: string[] = [];
    
    this.pendingRequests.forEach((pending, hash) => {
      if (now - pending.timestamp > this.defaultTimeout) {
        staleHashes.push(hash);
      }
    });
    
    staleHashes.forEach(hash => this.cleanup(hash));
    
    if (staleHashes.length > 0) {
      console.log('🧹 Cleaned stale requests:', staleHashes.length);
    }
    
    return staleHashes.length;
  }
}

/**
 * Global deduplicator instance
 */
export const globalDeduplicator = new AIRequestDeduplicator();
