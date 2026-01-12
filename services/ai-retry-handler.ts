/**
 * AI Retry Handler with Exponential Backoff
 * LexiCore Phase 4: Production Enhancements
 * 
 * Purpose: Retry failed AI requests with exponential backoff
 * - Handles rate limits (429), server errors (500, 503)
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s
 * - Configurable max retries (default 3-5)
 * - Request tracking and logging
 */

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableStatusCodes?: number[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalDurationMs: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 16000, // 16 seconds
  retryableStatusCodes: [429, 500, 502, 503, 504]
};

export class AIRetryHandler {
  private config: Required<RetryConfig>;

  constructor(config?: RetryConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.initialDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    const delay = Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
    return Math.floor(delay);
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: any): boolean {
    // Check for HTTP status codes
    if (error.status && this.config.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // Check for network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('network') ||
        error.message?.includes('timeout')) {
      return true;
    }

    // Check for rate limit errors
    if (error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('too many requests')) {
      return true;
    }

    return false;
  }

  /**
   * Wait for specified delay
   */
  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: any = null;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        const data = await fn();
        const totalDurationMs = Date.now() - startTime;

        if (attempt > 0) {
          console.log('✅ Retry succeeded:', context || 'unknown', `(attempt ${attempt + 1}/${this.config.maxRetries + 1}, ${totalDurationMs}ms)`);
        }

        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalDurationMs
        };
      } catch (error: any) {
        lastError = error;
        attempt++;

        // Check if we should retry
        if (attempt > this.config.maxRetries || !this.isRetryable(error)) {
          const totalDurationMs = Date.now() - startTime;
          console.error('❌ Retry failed (non-retryable or max attempts):', context || 'unknown', {
            attempts: attempt,
            error: error.message || String(error),
            status: error.status,
            totalDurationMs
          });

          return {
            success: false,
            error: error.message || String(error),
            attempts: attempt,
            totalDurationMs
          };
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt - 1);
        console.warn(`⚠️  Retry attempt ${attempt}/${this.config.maxRetries}:`, context || 'unknown', {
          error: error.message || String(error),
          status: error.status,
          retryingIn: `${delay}ms`
        });

        await this.wait(delay);
      }
    }

    // Should never reach here, but handle it
    const totalDurationMs = Date.now() - startTime;
    return {
      success: false,
      error: lastError?.message || 'Max retries exceeded',
      attempts: attempt,
      totalDurationMs
    };
  }

  /**
   * Retry with fallback function
   */
  async retryWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    // Try primary function with retries
    const primaryResult = await this.retry(primaryFn, `${context} (primary)`);
    
    if (primaryResult.success) {
      return primaryResult;
    }

    console.warn('⚠️  Primary function failed, trying fallback:', context);
    
    // Try fallback function with retries
    const fallbackResult = await this.retry(fallbackFn, `${context} (fallback)`);
    
    return fallbackResult;
  }

  /**
   * Batch retry multiple operations with limits
   */
  async retryBatch<T>(
    operations: Array<{ fn: () => Promise<T>; id: string }>,
    maxConcurrent: number = 3
  ): Promise<Map<string, RetryResult<T>>> {
    const results = new Map<string, RetryResult<T>>();
    const executing: Promise<void>[] = [];

    for (const op of operations) {
      const promise = this.retry(op.fn, op.id).then(result => {
        results.set(op.id, result);
      });

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }
}

/**
 * Global retry handler instance
 */
export const globalRetryHandler = new AIRetryHandler({
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 16000
});
