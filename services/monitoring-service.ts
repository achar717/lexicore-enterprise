/**
 * LexiCore™ - System Monitoring Service
 * Phase 6: Monitoring, Health Checks, and Alerting
 * 
 * Implements:
 * - System health monitoring
 * - Performance metrics tracking
 * - Security event analysis
 * - Database health checks
 * - Alert generation
 */

import { Context } from 'hono'

export class MonitoringService {
  private c: Context

  constructor(c: Context) {
    this.c = c
  }

  /**
   * Comprehensive system health check
   */
  async getSystemHealth(): Promise<any> {
    const { env } = this.c

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: await this.checkDatabaseHealth(),
        authentication: await this.checkAuthenticationHealth(),
        storage: await this.checkStorageHealth(),
        security: await this.checkSecurityHealth()
      },
      metrics: {
        active_users: await this.getActiveUserCount(),
        total_matters: await this.getTotalMatterCount(),
        total_documents: await this.getTotalDocumentCount(),
        audit_log_entries: await this.getAuditLogCount(),
        database_size: await this.getDatabaseSize()
      },
      performance: {
        average_query_time: await this.getAverageQueryTime(),
        slow_queries_last_hour: await this.getSlowQueryCount(),
        recent_errors: await this.getRecentErrorCount()
      }
    }

    // Determine overall status
    const hasFailures = Object.values(health.checks).some((check: any) => check.status !== 'healthy')
    if (hasFailures) {
      health.status = 'degraded'
    }

    return health
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabaseHealth(): Promise<any> {
    const { env } = this.c

    try {
      const startTime = Date.now()
      await env.DB.prepare('SELECT 1').first()
      const responseTime = Date.now() - startTime

      return {
        status: responseTime < 100 ? 'healthy' : 'slow',
        response_time_ms: responseTime,
        message: responseTime < 100 ? 'Database responding normally' : 'Database response time elevated'
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: 'Database connection failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Check authentication system health
   */
  private async checkAuthenticationHealth(): Promise<any> {
    const { env } = this.c

    try {
      // Check for recent successful logins
      const recentLogins = await env.DB.prepare(`
        SELECT COUNT(*) as login_count
        FROM audit_log
        WHERE event_type = 'login.success'
        AND timestamp > datetime('now', '-1 hour')
      `).first()

      // Check for excessive failed logins
      const failedLogins = await env.DB.prepare(`
        SELECT COUNT(*) as failed_count
        FROM failed_login_attempts
        WHERE attempt_timestamp > datetime('now', '-1 hour')
      `).first()

      const successCount = (recentLogins?.login_count as number) || 0
      const failedCount = (failedLogins?.failed_count as number) || 0
      const failureRate = successCount > 0 ? (failedCount / (successCount + failedCount)) : 0

      return {
        status: failureRate < 0.3 ? 'healthy' : 'degraded',
        recent_logins: successCount,
        failed_logins: failedCount,
        failure_rate: failureRate.toFixed(2),
        message: failureRate < 0.3 ? 'Authentication system normal' : 'Elevated authentication failure rate'
      }
    } catch (error) {
      return {
        status: 'unknown',
        error: 'Unable to check authentication health',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Check storage health (document counts, sizes)
   */
  private async checkStorageHealth(): Promise<any> {
    const { env } = this.c

    try {
      const documentCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM documents
      `).first()

      const count = (documentCount?.count as number) || 0

      return {
        status: 'healthy',
        total_documents: count,
        message: 'Storage system operational'
      }
    } catch (error) {
      return {
        status: 'unknown',
        error: 'Unable to check storage health',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Check security event status
   */
  private async checkSecurityHealth(): Promise<any> {
    const { env } = this.c

    try {
      // Check for unresolved critical security events
      const criticalEvents = await env.DB.prepare(`
        SELECT COUNT(*) as critical_count
        FROM security_events
        WHERE severity = 'critical'
        AND resolved = 0
        AND created_at > datetime('now', '-24 hours')
      `).first()

      const criticalCount = (criticalEvents?.critical_count as number) || 0

      return {
        status: criticalCount === 0 ? 'healthy' : 'warning',
        unresolved_critical_events: criticalCount,
        message: criticalCount === 0 
          ? 'No critical security events' 
          : `${criticalCount} unresolved critical security events`
      }
    } catch (error) {
      return {
        status: 'unknown',
        error: 'Unable to check security health',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get active user count (users with activity in last 24 hours)
   */
  private async getActiveUserCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM audit_log
        WHERE timestamp > datetime('now', '-24 hours')
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Get total matter count
   */
  private async getTotalMatterCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM matters
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Get total document count
   */
  private async getTotalDocumentCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM documents
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Get audit log entry count
   */
  private async getAuditLogCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM audit_log
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Estimate database size
   */
  private async getDatabaseSize(): Promise<string> {
    const { env } = this.c

    try {
      // Get approximate size from table counts
      const tables = ['users', 'matters', 'documents', 'extractions', 'audit_log']
      let totalRows = 0

      for (const table of tables) {
        const result = await env.DB.prepare(`SELECT COUNT(*) as count FROM ${table}`).first()
        totalRows += (result?.count as number) || 0
      }

      // Rough estimate: 1KB per row average
      const sizeBytes = totalRows * 1024
      return this.formatBytes(sizeBytes)
    } catch (error) {
      return 'Unknown'
    }
  }

  /**
   * Get average query time from recent logs
   */
  private async getAverageQueryTime(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT AVG(execution_time_ms) as avg_time
        FROM query_performance_log
        WHERE timestamp > datetime('now', '-1 hour')
      `).first()

      return Math.round((result?.avg_time as number) || 0)
    } catch (error) {
      return 0
    }
  }

  /**
   * Get count of slow queries (> 500ms) in last hour
   */
  private async getSlowQueryCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM query_performance_log
        WHERE execution_time_ms > 500
        AND timestamp > datetime('now', '-1 hour')
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Get recent error count from audit log
   */
  private async getRecentErrorCount(): Promise<number> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM audit_log
        WHERE event_type LIKE '%.failed'
        AND timestamp > datetime('now', '-1 hour')
      `).first()

      return (result?.count as number) || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Get security event summary
   */
  async getSecurityEventSummary(): Promise<any> {
    const { env } = this.c

    try {
      // Get events by severity
      const bySeverity = await env.DB.prepare(`
        SELECT 
          severity,
          COUNT(*) as count,
          COUNT(CASE WHEN resolved = 0 THEN 1 END) as unresolved_count
        FROM security_events
        WHERE created_at > datetime('now', '-7 days')
        GROUP BY severity
      `).all()

      // Get events by type
      const byType = await env.DB.prepare(`
        SELECT 
          event_type,
          COUNT(*) as count,
          MAX(created_at) as last_occurrence
        FROM security_events
        WHERE created_at > datetime('now', '-7 days')
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `).all()

      // Get recent critical events
      const criticalEvents = await env.DB.prepare(`
        SELECT 
          id,
          event_type,
          user_id,
          severity,
          event_details,
          created_at,
          resolved
        FROM security_events
        WHERE severity = 'critical'
        AND created_at > datetime('now', '-7 days')
        ORDER BY created_at DESC
        LIMIT 10
      `).all()

      return {
        summary_period: '7 days',
        by_severity: bySeverity.results || [],
        by_type: byType.results || [],
        recent_critical_events: criticalEvents.results || []
      }
    } catch (error) {
      throw new Error(`Failed to get security event summary: ${error}`)
    }
  }

  /**
   * Get performance metrics summary
   */
  async getPerformanceMetrics(): Promise<any> {
    const { env } = this.c

    try {
      // Query performance by type
      const queryPerf = await env.DB.prepare(`
        SELECT 
          query_type,
          COUNT(*) as query_count,
          AVG(execution_time_ms) as avg_time,
          MAX(execution_time_ms) as max_time,
          MIN(execution_time_ms) as min_time
        FROM query_performance_log
        WHERE timestamp > datetime('now', '-24 hours')
        GROUP BY query_type
        ORDER BY avg_time DESC
      `).all()

      // Failed login rate
      const authMetrics = await env.DB.prepare(`
        SELECT 
          COUNT(*) as total_attempts,
          COUNT(DISTINCT email) as unique_emails,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM failed_login_attempts
        WHERE attempt_timestamp > datetime('now', '-24 hours')
      `).first()

      // Active session count
      const sessionMetrics = await env.DB.prepare(`
        SELECT 
          COUNT(*) as active_sessions,
          COUNT(DISTINCT user_id) as unique_users
        FROM user_sessions
        WHERE is_active = 1
        AND expires_at > CURRENT_TIMESTAMP
      `).first()

      return {
        period: '24 hours',
        query_performance: queryPerf.results || [],
        authentication: authMetrics || {},
        sessions: sessionMetrics || {}
      }
    } catch (error) {
      throw new Error(`Failed to get performance metrics: ${error}`)
    }
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Record system health metric
   */
  async recordHealthMetric(
    metricType: string,
    metricValue: number,
    metricUnit: string
  ): Promise<void> {
    const { env } = this.c

    try {
      await env.DB.prepare(`
        INSERT INTO system_health_metrics (metric_type, metric_value, metric_unit)
        VALUES (?, ?, ?)
      `).bind(metricType, metricValue, metricUnit).run()
    } catch (error) {
      console.error('[HEALTH_METRIC_RECORD_ERROR]', error)
    }
  }

  /**
   * Get health metrics history
   */
  async getHealthMetricsHistory(
    metricType: string,
    hours: number = 24
  ): Promise<any[]> {
    const { env } = this.c

    try {
      const result = await env.DB.prepare(`
        SELECT 
          metric_value,
          metric_unit,
          recorded_at
        FROM system_health_metrics
        WHERE metric_type = ?
        AND recorded_at > datetime('now', '-${hours} hours')
        ORDER BY recorded_at DESC
      `).bind(metricType).all()

      return result.results || []
    } catch (error) {
      console.error('[HEALTH_METRICS_HISTORY_ERROR]', error)
      return []
    }
  }
}
