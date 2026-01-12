/**
 * Enhanced AI Provider Service
 * LexiCore Phase 4: Production Enhancements
 * 
 * Purpose: Integrate all Phase 4 features into AI provider
 * - Request caching with TTL
 * - Exponential backoff retry
 * - Health-based provider fallback
 * - In-flight request deduplication
 * - Usage tracking
 */

import type { D1Database } from '@cloudflare/workers-types';
import { AIProviderService, type AIMessage, type AIResponse, type AIProviderConfig } from './ai-providers';
import { AIRequestCache, type CacheRequest } from './ai-request-cache';
import { AIRetryHandler } from './ai-retry-handler';
import { AIRequestDeduplicator } from './ai-request-deduplicator';
import { AIProviderMonitor } from './ai-provider-monitor';
import { TokenUsageTracker } from './token-usage-tracker';

export interface EnhancedAIOptions {
  provider?: 'openai' | 'gemini';
  temperature?: number;
  maxTokens?: number;
  model?: string;
  jsonMode?: boolean;
  
  // Phase 4 options
  useCache?: boolean; // Default true
  bypassCache?: boolean; // Force bypass cache
  useRetry?: boolean; // Default true
  useDedupe?: boolean; // Default true
  
  // Tracking
  userId?: string;
  documentId?: string;
  matterId?: string;
  endpoint?: string;
}

export interface EnhancedAIResponse extends AIResponse {
  // Phase 4 metadata
  cached?: boolean;
  deduplicated?: boolean;
  retryAttempts?: number;
  fallbackUsed?: boolean;
  totalDurationMs?: number;
}

export class EnhancedAIProvider {
  private baseProvider: AIProviderService;
  private cache: AIRequestCache;
  private retry: AIRetryHandler;
  private dedupe: AIRequestDeduplicator;
  private monitor: AIProviderMonitor;
  private tracker: TokenUsageTracker;
  private db: D1Database;

  constructor(
    config: AIProviderConfig,
    db: D1Database
  ) {
    this.baseProvider = new AIProviderService(config);
    this.db = db;
    
    // Initialize Phase 4 services
    this.cache = new AIRequestCache(db, 24 * 60 * 60 * 1000); // 24h TTL
    this.retry = new AIRetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 16000
    });
    this.dedupe = new AIRequestDeduplicator(60000); // 60s timeout
    this.monitor = new AIProviderMonitor(db);
    this.tracker = new TokenUsageTracker(db);
  }

  /**
   * Generate AI completion with all Phase 4 enhancements
   */
  async generateCompletion(
    messages: AIMessage[],
    options?: EnhancedAIOptions
  ): Promise<EnhancedAIResponse> {
    const startTime = Date.now();
    const useCache = options?.useCache !== false && !options?.bypassCache;
    const useRetry = options?.useRetry !== false;
    const useDedupe = options?.useDedupe !== false;
    
    // Determine provider with health check
    let provider = options?.provider || 'openai';
    if (!options?.provider) {
      // Use health check to select best provider
      const bestProvider = await this.monitor.getBestProvider();
      if (bestProvider) {
        provider = bestProvider as 'openai' | 'gemini';
        console.log('🏥 Selected provider based on health:', provider);
      }
    }

    // Build cache request
    const cacheRequest: CacheRequest = {
      provider,
      model: options?.model || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'),
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens
    };

    // Try cache first
    if (useCache) {
      const cached = await this.cache.get(cacheRequest);
      if (cached) {
        const response = JSON.parse(cached);
        const totalDurationMs = Date.now() - startTime;
        
        return {
          ...response,
          cached: true,
          deduplicated: false,
          retryAttempts: 0,
          totalDurationMs
        };
      }
    }

    // Execute with deduplication
    const executeFn = async (): Promise<EnhancedAIResponse> => {
      let result: EnhancedAIResponse;
      let fallbackUsed = false;
      let retryAttempts = 0;

      // Build request function
      const requestFn = async () => {
        try {
          // Call base provider
          const response = await this.baseProvider.generateCompletion(messages, {
            provider,
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
            model: options?.model,
            jsonMode: options?.jsonMode
          });

          // Track usage
          if (options?.userId) {
            await this.tracker.logUsage({
              userId: options.userId,
              documentId: options.documentId,
              matterId: options.matterId,
              provider: response.provider,
              model: response.model,
              endpoint: options.endpoint || 'completion',
              promptTokens: response.promptTokens || 0,
              completionTokens: response.completionTokens || 0,
              totalTokens: response.tokensUsed || 0,
              requestDurationMs: Date.now() - startTime,
              status: 'success'
            });
          }

          // Record provider health success
          await this.monitor.recordHealthCheck(response.provider, true, Date.now() - startTime);

          return response;
        } catch (error: any) {
          // Record provider health failure
          await this.monitor.recordHealthCheck(provider, false, 0, error.message);

          // Track error
          if (options?.userId) {
            await this.tracker.logUsage({
              userId: options.userId,
              documentId: options.documentId,
              matterId: options.matterId,
              provider,
              model: options?.model || 'unknown',
              endpoint: options.endpoint || 'completion',
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              requestDurationMs: Date.now() - startTime,
              status: 'error',
              errorMessage: error.message
            });
          }

          throw error;
        }
      };

      // Execute with retry
      if (useRetry) {
        const retryResult = await this.retry.retry(requestFn, `AI ${provider} completion`);
        retryAttempts = retryResult.attempts - 1;
        
        if (!retryResult.success) {
          // Try fallback provider
          fallbackUsed = true;
          const fallbackProvider = provider === 'openai' ? 'gemini' : 'openai';
          console.warn(`⚠️  Fallback to ${fallbackProvider} after ${retryAttempts} retries`);
          
          provider = fallbackProvider;
          const fallbackResult = await this.retry.retry(requestFn, `AI ${fallbackProvider} fallback`);
          
          if (!fallbackResult.success) {
            throw new Error(fallbackResult.error || 'All providers failed');
          }
          
          result = fallbackResult.data as EnhancedAIResponse;
          retryAttempts += fallbackResult.attempts - 1;
        } else {
          result = retryResult.data as EnhancedAIResponse;
        }
      } else {
        result = await requestFn();
      }

      // Cache successful response
      if (useCache && result) {
        await this.cache.set(
          cacheRequest,
          JSON.stringify(result),
          result.tokensUsed || 0
        );
      }

      return {
        ...result,
        cached: false,
        fallbackUsed,
        retryAttempts
      };
    };

    // Execute with deduplication
    let finalResult: EnhancedAIResponse;
    let deduplicated = false;

    if (useDedupe) {
      const dedupeResult = await this.dedupe.deduplicate(cacheRequest, executeFn);
      finalResult = dedupeResult.data;
      deduplicated = dedupeResult.deduplicated;
    } else {
      finalResult = await executeFn();
    }

    const totalDurationMs = Date.now() - startTime;

    return {
      ...finalResult,
      deduplicated,
      totalDurationMs
    };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cache.getStats();
  }

  /**
   * Get deduplication statistics
   */
  getDedupeStats() {
    return this.dedupe.getStats();
  }

  /**
   * Clean expired cache entries
   */
  async cleanCache() {
    return await this.cache.cleanExpired();
  }

  /**
   * Clean stale in-flight requests
   */
  cleanStaleRequests() {
    return this.dedupe.cleanupStale();
  }

  /**
   * Get provider health status
   */
  async getProviderHealth() {
    return await this.monitor.getProviderHealth();
  }

  /**
   * Clear all caches (admin operation)
   */
  async clearAll() {
    const cacheCleared = await this.cache.clear();
    const dedupeCleared = this.dedupe.clear();
    
    return {
      cacheCleared,
      dedupeCleared
    };
  }

  /**
   * Generate text from prompt (simplified interface for drafting service)
   * Converts simple prompt string to message format
   */
  async generateText(
    prompt: string,
    options?: {
      temperature?: number
      maxTokens?: number
      responseFormat?: 'text' | 'json'
      provider?: 'openai' | 'gemini'
      model?: string
      userId?: string
      documentId?: string
      matterId?: string
      endpoint?: string
    }
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const enhancedOptions: EnhancedAIOptions = {
      provider: options?.provider,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 2000,
      model: options?.model,
      jsonMode: options?.responseFormat === 'json',
      userId: options?.userId,
      documentId: options?.documentId,
      matterId: options?.matterId,
      endpoint: options?.endpoint || 'drafting',
      useCache: true,
      useRetry: true,
      useDedupe: true
    };

    const response = await this.generateCompletion(messages, enhancedOptions);
    
    return response.content;
  }
}
