/**
 * LexiCore™ - Token Usage Tracker Service
 * Task #7: Real AI Integration
 * 
 * Tracks AI API usage, calculates costs, and enforces budget limits
 * 
 * FEATURES:
 * - Token usage logging
 * - Cost calculation (OpenAI and Gemini)
 * - Budget enforcement
 * - Usage analytics
 * - Budget alerts
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface UsageData {
  userId: string
  documentId?: string
  matterId?: string
  provider: 'openai' | 'gemini'
  model: string
  endpoint: string
  promptTokens: number
  completionTokens: number
  requestDurationMs: number
  status: 'success' | 'error' | 'fallback' | 'cached'
  errorMessage?: string
  fallbackProvider?: string
  cacheHit?: boolean
}

export interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  successCount: number
  errorCount: number
  fallbackCount: number
  cacheHits: number
  avgDurationMs: number
  costByProvider: Record<string, number>
  requestsByProvider: Record<string, number>
}

export interface BudgetStatus {
  budgetLimit: number
  currentUsage: number
  percentageUsed: number
  remaining: number
  status: 'ok' | 'warning' | 'critical' | 'exceeded'
  alertThreshold: number
}

export class TokenUsageTracker {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  /**
   * Calculate cost based on provider and tokens
   */
  calculateCost(provider: 'openai' | 'gemini', model: string, promptTokens: number, completionTokens: number): number {
    if (provider === 'openai') {
      // OpenAI GPT-4o-mini pricing
      // Input: $0.15 per 1M tokens
      // Output: $0.60 per 1M tokens
      const inputCost = (promptTokens / 1000000) * 0.15
      const outputCost = (completionTokens / 1000000) * 0.60
      return inputCost + outputCost
    } else if (provider === 'gemini') {
      // Gemini 1.5 Flash pricing
      // Free tier: 15 RPM, 1M TPM, 1,500 RPD
      // Paid tier: Input $0.075/1M, Output $0.30/1M
      // For now, assume free tier
      return 0.0
    }
    return 0.0
  }

  /**
   * Log AI usage
   */
  async logUsage(usage: UsageData): Promise<void> {
    const totalTokens = usage.promptTokens + usage.completionTokens
    const estimatedCost = this.calculateCost(
      usage.provider,
      usage.model,
      usage.promptTokens,
      usage.completionTokens
    )

    const id = `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    try {
      await this.db.prepare(`
        INSERT INTO ai_usage_log (
          id, user_id, document_id, matter_id, provider, model, endpoint,
          prompt_tokens, completion_tokens, total_tokens, estimated_cost,
          request_duration_ms, status, error_message, fallback_provider, cache_hit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        usage.userId,
        usage.documentId || null,
        usage.matterId || null,
        usage.provider,
        usage.model,
        usage.endpoint,
        usage.promptTokens,
        usage.completionTokens,
        totalTokens,
        estimatedCost,
        usage.requestDurationMs,
        usage.status,
        usage.errorMessage || null,
        usage.fallbackProvider || null,
        usage.cacheHit ? 1 : 0
      ).run()

      console.log('📊 Logged AI usage:', {
        id,
        provider: usage.provider,
        tokens: totalTokens,
        cost: estimatedCost.toFixed(4),
        status: usage.status
      })

      // Check budget and create alerts if needed
      await this.checkBudgetAndAlert(usage.userId, estimatedCost)
    } catch (error) {
      console.error('❌ Failed to log AI usage:', error)
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  /**
   * Get user usage statistics for a date range
   */
  async getUserUsage(userId: string, days: number = 30): Promise<UsageStats> {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const end = new Date().toISOString()

    const result = await this.db.prepare(`
      SELECT 
        COUNT(*) as totalRequests,
        SUM(total_tokens) as totalTokens,
        SUM(estimated_cost) as totalCost,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
        SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) as fallbackCount,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cacheHits,
        AVG(request_duration_ms) as avgDurationMs
      FROM ai_usage_log
      WHERE user_id = ? AND created_at BETWEEN ? AND ?
    `).bind(userId, start, end).first()

    // Get cost by provider
    const providerStats = await this.db.prepare(`
      SELECT provider, SUM(estimated_cost) as cost, COUNT(*) as requests
      FROM ai_usage_log
      WHERE user_id = ? AND created_at BETWEEN ? AND ?
      GROUP BY provider
    `).bind(userId, start, end).all()

    const costByProvider: Record<string, number> = {}
    const requestsByProvider: Record<string, number> = {}
    
    providerStats.results?.forEach((row: any) => {
      costByProvider[row.provider] = row.cost || 0
      requestsByProvider[row.provider] = row.requests || 0
    })

    return {
      totalRequests: result?.totalRequests || 0,
      totalTokens: result?.totalTokens || 0,
      totalCost: result?.totalCost || 0,
      successCount: result?.successCount || 0,
      errorCount: result?.errorCount || 0,
      fallbackCount: result?.fallbackCount || 0,
      cacheHits: result?.cacheHits || 0,
      avgDurationMs: result?.avgDurationMs || 0,
      costByProvider,
      requestsByProvider
    }
  }

  /**
   * Get total usage statistics (firm-wide)
   */
  async getTotalUsage(days: number = 30): Promise<UsageStats> {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const end = new Date().toISOString()

    const result = await this.db.prepare(`
      SELECT 
        COUNT(*) as totalRequests,
        SUM(total_tokens) as totalTokens,
        SUM(estimated_cost) as totalCost,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
        SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) as fallbackCount,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cacheHits,
        AVG(request_duration_ms) as avgDurationMs
      FROM ai_usage_log
      WHERE created_at BETWEEN ? AND ?
    `).bind(start, end).first()

    // Get cost by provider
    const providerStats = await this.db.prepare(`
      SELECT provider, SUM(estimated_cost) as cost, COUNT(*) as requests
      FROM ai_usage_log
      WHERE created_at BETWEEN ? AND ?
      GROUP BY provider
    `).bind(start, end).all()

    const costByProvider: Record<string, number> = {}
    const requestsByProvider: Record<string, number> = {}
    
    providerStats.results?.forEach((row: any) => {
      costByProvider[row.provider] = row.cost || 0
      requestsByProvider[row.provider] = row.requests || 0
    })

    return {
      totalRequests: result?.totalRequests || 0,
      totalTokens: result?.totalTokens || 0,
      totalCost: result?.totalCost || 0,
      successCount: result?.successCount || 0,
      errorCount: result?.errorCount || 0,
      fallbackCount: result?.fallbackCount || 0,
      cacheHits: result?.cacheHits || 0,
      avgDurationMs: result?.avgDurationMs || 0,
      costByProvider,
      requestsByProvider
    }
  }

  /**
   * Check budget status for a user
   */
  async checkBudget(userId: string, budgetType: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<BudgetStatus> {
    // Get budget configuration
    const budgetConfig = await this.db.prepare(`
      SELECT * FROM ai_budget_config
      WHERE user_id = ? AND budget_type = ? AND is_active = 1
      LIMIT 1
    `).bind(userId, budgetType).first()

    if (!budgetConfig) {
      // No budget configured - return unlimited
      return {
        budgetLimit: Infinity,
        currentUsage: 0,
        percentageUsed: 0,
        remaining: Infinity,
        status: 'ok',
        alertThreshold: 0.8
      }
    }

    // Calculate date range for budget period
    const now = new Date()
    let startDate: Date
    
    if (budgetType === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (budgetType === 'weekly') {
      const dayOfWeek = now.getDay()
      startDate = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    // Get current usage
    const usage = await this.getUserUsage(userId, startDate, now)
    const budgetLimit = budgetConfig.limit_amount as number
    const alertThreshold = (budgetConfig.alert_threshold as number) || 0.8
    const percentageUsed = (usage.totalCost / budgetLimit) * 100
    const remaining = Math.max(0, budgetLimit - usage.totalCost)

    let status: 'ok' | 'warning' | 'critical' | 'exceeded'
    if (percentageUsed >= 100) {
      status = 'exceeded'
    } else if (percentageUsed >= 95) {
      status = 'critical'
    } else if (percentageUsed >= alertThreshold * 100) {
      status = 'warning'
    } else {
      status = 'ok'
    }

    return {
      budgetLimit,
      currentUsage: usage.totalCost,
      percentageUsed,
      remaining,
      status,
      alertThreshold
    }
  }

  /**
   * Check budget and create alerts if thresholds exceeded
   */
  private async checkBudgetAndAlert(userId: string, additionalCost: number): Promise<void> {
    const budgetStatus = await this.checkBudget(userId, 'monthly')
    
    if (budgetStatus.status === 'warning' || budgetStatus.status === 'critical' || budgetStatus.status === 'exceeded') {
      // Check if alert already sent recently (last 24 hours)
      const recentAlert = await this.db.prepare(`
        SELECT * FROM ai_budget_alerts
        WHERE user_id = ? AND alert_type = ? AND created_at > datetime('now', '-24 hours')
        LIMIT 1
      `).bind(userId, budgetStatus.status).first()

      if (!recentAlert) {
        // Create new alert
        const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        await this.db.prepare(`
          INSERT INTO ai_budget_alerts (
            id, budget_config_id, user_id, current_usage, limit_amount, 
            percentage_used, alert_type, notified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(
          alertId,
          'monthly', // TODO: Get actual budget_config_id
          userId,
          budgetStatus.currentUsage,
          budgetStatus.budgetLimit,
          budgetStatus.percentageUsed,
          budgetStatus.status
        ).run()

        console.warn('⚠️ Budget alert created:', {
          userId,
          status: budgetStatus.status,
          percentageUsed: budgetStatus.percentageUsed.toFixed(2) + '%',
          remaining: budgetStatus.remaining.toFixed(4)
        })
      }
    }
  }

  /**
   * Get usage trends (for dashboard charts)
   */
  async getUsageTrends(userId?: string, days: number = 30): Promise<any[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    
    const query = userId
      ? `SELECT * FROM v_daily_ai_usage WHERE user_id = ? AND usage_date >= ? ORDER BY usage_date`
      : `SELECT * FROM v_daily_ai_usage WHERE usage_date >= ? ORDER BY usage_date`
    
    const result = userId
      ? await this.db.prepare(query).bind(userId, startDate).all()
      : await this.db.prepare(query).bind(startDate).all()

    return result.results || []
  }
}
