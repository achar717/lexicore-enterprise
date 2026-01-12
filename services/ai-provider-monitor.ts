/**
 * LexiCore™ - AI Provider Health Monitoring Service
 * Monitors health, availability, and performance of AI providers (OpenAI, Gemini)
 * 
 * FEATURES:
 * - Real-time health checks for each provider
 * - Latency and error rate tracking
 * - Automatic provider status updates
 * - Performance metrics and trends
 * - Alert generation for provider issues
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Provider health status
 */
export type ProviderStatus = 'healthy' | 'degraded' | 'down';

/**
 * Provider health check result
 */
export interface ProviderHealthCheck {
  provider: 'openai' | 'gemini';
  status: ProviderStatus;
  latency_ms: number;
  success: boolean;
  error?: string;
  checked_at: string;
}

/**
 * Provider health record from database
 */
export interface ProviderHealthRecord {
  id: string;
  provider: 'openai' | 'gemini';
  status: ProviderStatus;
  latency_ms: number;
  error_rate: number;
  last_error: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  checked_at: string;
  updated_at: string;
}

/**
 * AI Provider Monitor Service
 */
export class AIProviderMonitor {
  private db: D1Database;

  // Health check thresholds
  private readonly LATENCY_WARNING_MS = 2000;  // Warn if > 2s
  private readonly LATENCY_CRITICAL_MS = 5000; // Critical if > 5s
  private readonly ERROR_RATE_WARNING = 0.1;    // Warn if > 10% errors
  private readonly ERROR_RATE_CRITICAL = 0.3;   // Critical if > 30% errors
  private readonly MAX_CONSECUTIVE_FAILURES = 3; // Down after 3 failures

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(
    provider: 'openai' | 'gemini',
    apiKey: string
  ): Promise<ProviderHealthCheck> {
    const startTime = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      // Perform a minimal API call to check health
      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        const latency = Date.now() - startTime;

        if (response.ok) {
          return {
            provider,
            status: this.getStatusFromLatency(latency),
            latency_ms: latency,
            success: true,
            checked_at: checkedAt,
          };
        } else {
          const errorText = await response.text();
          return {
            provider,
            status: 'down',
            latency_ms: latency,
            success: false,
            error: `HTTP ${response.status}: ${errorText}`,
            checked_at: checkedAt,
          };
        }
      } else if (provider === 'gemini') {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          {
            method: 'GET',
            signal: AbortSignal.timeout(10000), // 10s timeout
          }
        );

        const latency = Date.now() - startTime;

        if (response.ok) {
          return {
            provider,
            status: this.getStatusFromLatency(latency),
            latency_ms: latency,
            success: true,
            checked_at: checkedAt,
          };
        } else {
          const errorText = await response.text();
          return {
            provider,
            status: 'down',
            latency_ms: latency,
            success: false,
            error: `HTTP ${response.status}: ${errorText}`,
            checked_at: checkedAt,
          };
        }
      }

      throw new Error(`Unknown provider: ${provider}`);
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider,
        status: 'down',
        latency_ms: latency,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        checked_at: checkedAt,
      };
    }
  }

  /**
   * Update provider health record in database
   */
  async updateProviderHealth(check: ProviderHealthCheck): Promise<void> {
    try {
      // Get current health record
      const current = await this.db
        .prepare('SELECT * FROM ai_provider_health WHERE provider = ?')
        .bind(check.provider)
        .first<ProviderHealthRecord>();

      const now = new Date().toISOString();
      let consecutiveFailures = 0;
      let errorRate = 0;

      if (current) {
        // Update consecutive failures
        consecutiveFailures = check.success
          ? 0
          : (current.consecutive_failures || 0) + 1;

        // Calculate error rate (last 100 checks approximation)
        // This is a simplified calculation - in production, you'd track actual check history
        errorRate = check.success
          ? Math.max(0, current.error_rate - 0.01)
          : Math.min(1, current.error_rate + 0.01);
      }

      // Determine final status
      let finalStatus: ProviderStatus = check.status;
      if (consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        finalStatus = 'down';
      } else if (errorRate >= this.ERROR_RATE_CRITICAL) {
        finalStatus = 'down';
      } else if (errorRate >= this.ERROR_RATE_WARNING) {
        finalStatus = 'degraded';
      }

      // Insert or update health record
      if (current) {
        await this.db
          .prepare(`
            UPDATE ai_provider_health
            SET status = ?,
                latency_ms = ?,
                error_rate = ?,
                last_error = ?,
                last_success_at = ?,
                last_failure_at = ?,
                consecutive_failures = ?,
                checked_at = ?,
                updated_at = ?
            WHERE provider = ?
          `)
          .bind(
            finalStatus,
            check.latency_ms,
            errorRate,
            check.error || null,
            check.success ? now : current.last_success_at,
            check.success ? current.last_failure_at : now,
            consecutiveFailures,
            check.checked_at,
            now,
            check.provider
          )
          .run();
      } else {
        // Insert new record
        await this.db
          .prepare(`
            INSERT INTO ai_provider_health (
              id, provider, status, latency_ms, error_rate,
              last_error, last_success_at, last_failure_at,
              consecutive_failures, checked_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            `health-${check.provider}-${Date.now()}`,
            check.provider,
            finalStatus,
            check.latency_ms,
            errorRate,
            check.error || null,
            check.success ? now : null,
            check.success ? null : now,
            consecutiveFailures,
            check.checked_at,
            now
          )
          .run();
      }

      console.log(
        `✅ Updated health for ${check.provider}: ${finalStatus} (${check.latency_ms}ms, errors: ${Math.round(errorRate * 100)}%)`
      );
    } catch (error) {
      console.error(`❌ Failed to update provider health:`, error);
      throw error;
    }
  }

  /**
   * Get current health status for a provider
   */
  async getProviderHealth(provider: 'openai' | 'gemini'): Promise<ProviderHealthRecord | null> {
    try {
      const record = await this.db
        .prepare('SELECT * FROM ai_provider_health WHERE provider = ?')
        .bind(provider)
        .first<ProviderHealthRecord>();

      return record;
    } catch (error) {
      console.error(`❌ Failed to get provider health:`, error);
      return null;
    }
  }

  /**
   * Get health status for all providers
   */
  async getAllProviderHealth(): Promise<ProviderHealthRecord[]> {
    try {
      const result = await this.db
        .prepare('SELECT * FROM ai_provider_health ORDER BY provider')
        .all<ProviderHealthRecord>();

      return result.results || [];
    } catch (error) {
      console.error(`❌ Failed to get all provider health:`, error);
      return [];
    }
  }

  /**
   * Check if a provider is currently healthy
   */
  async isProviderHealthy(provider: 'openai' | 'gemini'): Promise<boolean> {
    const health = await this.getProviderHealth(provider);
    return health?.status === 'healthy';
  }

  /**
   * Get the best available provider (prefer healthy, fallback to degraded)
   */
  async getBestProvider(): Promise<'openai' | 'gemini' | null> {
    const allHealth = await this.getAllProviderHealth();

    // First, try to find a healthy provider
    const healthy = allHealth.find((h) => h.status === 'healthy');
    if (healthy) {
      return healthy.provider as 'openai' | 'gemini';
    }

    // Fallback to degraded provider
    const degraded = allHealth.find((h) => h.status === 'degraded');
    if (degraded) {
      return degraded.provider as 'openai' | 'gemini';
    }

    // No providers available
    return null;
  }

  /**
   * Run health checks for all configured providers
   */
  async checkAllProviders(config: {
    openaiKey?: string;
    geminiKey?: string;
  }): Promise<ProviderHealthCheck[]> {
    const checks: Promise<ProviderHealthCheck>[] = [];

    if (config.openaiKey) {
      checks.push(this.checkProviderHealth('openai', config.openaiKey));
    }

    if (config.geminiKey) {
      checks.push(this.checkProviderHealth('gemini', config.geminiKey));
    }

    const results = await Promise.allSettled(checks);

    const healthChecks: ProviderHealthCheck[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        healthChecks.push(result.value);
        await this.updateProviderHealth(result.value);
      }
    }

    return healthChecks;
  }

  /**
   * Get status from latency
   */
  private getStatusFromLatency(latency: number): ProviderStatus {
    if (latency >= this.LATENCY_CRITICAL_MS) {
      return 'degraded';
    } else if (latency >= this.LATENCY_WARNING_MS) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Get provider health metrics for monitoring dashboard
   */
  async getHealthMetrics(hours: number = 24): Promise<{
    provider: string;
    avgLatency: number;
    errorRate: number;
    uptime: number;
    lastCheck: string;
  }[]> {
    try {
      // This is a simplified version
      // In production, you'd query from a health_check_history table
      const allHealth = await this.getAllProviderHealth();

      return allHealth.map((health) => ({
        provider: health.provider,
        avgLatency: health.latency_ms,
        errorRate: health.error_rate,
        uptime: health.status === 'down' ? 0 : health.status === 'degraded' ? 0.8 : 1.0,
        lastCheck: health.checked_at,
      }));
    } catch (error) {
      console.error(`❌ Failed to get health metrics:`, error);
      return [];
    }
  }
}
