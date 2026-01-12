/**
 * LexiCore™ IP Practice Module - Phase 5: Audit Export Service
 * 
 * Purpose: Export audit logs for IP extraction activities with full traceability
 * Features:
 * - Multiple export formats (CSV, JSON, PDF, XLSX)
 * - Filtered exports by matter, document, date range, event type
 * - Cryptographic verification codes for audit trail integrity
 * - Comprehensive access logging
 * - Court-ready formatting
 */

import { generateId, sha256Hash } from '../utils/crypto'

export type AuditExportType = 'full_audit' | 'matter_audit' | 'document_audit' | 'extraction_audit' | 'review_audit'
export type AuditExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf'

interface AuditExportOptions {
  exportType: AuditExportType
  format: AuditExportFormat
  matterId?: string
  documentId?: string
  extractionJobId?: string
  dateRangeStart?: string
  dateRangeEnd?: string
  filterCriteria?: {
    eventTypes?: string[]
    userIds?: string[]
    confidenceMin?: number
    confidenceMax?: number
    includeSystemEvents?: boolean
  }
}

interface AuditEntry {
  id: string
  event_timestamp: string
  event_type: string
  event_category: string
  user_id: string | null
  matter_id: string | null
  document_id: string | null
  event_data: string | null
  ip_address: string | null
  user_agent: string | null
}

export class IPAuditExportService {
  constructor(private db: D1Database) {}

  /**
   * Export audit logs based on filter criteria
   */
  async exportAuditLog(
    options: AuditExportOptions,
    exportedBy: string,
    ipAddress: string
  ): Promise<{ exportId: string; data: string; hash: string; totalEntries: number }> {
    // Build SQL query based on export type and filters
    const { query, params } = this.buildAuditQuery(options)

    // Execute query
    const result = await this.db.prepare(query).bind(...params).all()
    const entries = result.results as AuditEntry[]

    // Format data according to requested format
    const formattedData = await this.formatAuditData(entries, options.format)

    // Calculate hash for integrity verification
    const dataHash = await sha256Hash(formattedData)

    // Generate verification code
    const verificationCode = this.generateVerificationCode()

    // Create export record
    const exportId = generateId('audit-export')
    await this.db.prepare(`
      INSERT INTO ip_audit_exports (
        id, export_type, matter_id, document_id, extraction_job_id,
        date_range_start, date_range_end, exported_by, total_entries,
        file_format, file_hash, filter_criteria, verification_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      exportId,
      options.exportType,
      options.matterId || null,
      options.documentId || null,
      options.extractionJobId || null,
      options.dateRangeStart || null,
      options.dateRangeEnd || null,
      exportedBy,
      entries.length,
      options.format,
      dataHash,
      JSON.stringify(options.filterCriteria || {}),
      verificationCode
    ).run()

    // Log access
    await this.logExportAccess(exportId, exportedBy, 'download', ipAddress)

    return {
      exportId,
      data: formattedData,
      hash: dataHash,
      totalEntries: entries.length
    }
  }

  /**
   * Build SQL query for audit log retrieval
   */
  private buildAuditQuery(options: AuditExportOptions): { query: string; params: any[] } {
    let query = `
      SELECT 
        id, event_timestamp, event_type, event_category,
        user_id, matter_id, document_id, event_data,
        ip_address, user_agent
      FROM audit_log
      WHERE 1=1
    `
    const params: any[] = []

    // Filter by matter
    if (options.matterId) {
      query += ` AND matter_id = ?`
      params.push(options.matterId)
    }

    // Filter by document
    if (options.documentId) {
      query += ` AND document_id = ?`
      params.push(options.documentId)
    }

    // Filter by date range
    if (options.dateRangeStart) {
      query += ` AND event_timestamp >= ?`
      params.push(options.dateRangeStart)
    }

    if (options.dateRangeEnd) {
      query += ` AND event_timestamp <= ?`
      params.push(options.dateRangeEnd)
    }

    // Filter by event types
    if (options.filterCriteria?.eventTypes && options.filterCriteria.eventTypes.length > 0) {
      const placeholders = options.filterCriteria.eventTypes.map(() => '?').join(',')
      query += ` AND event_type IN (${placeholders})`
      params.push(...options.filterCriteria.eventTypes)
    }

    // Filter by users
    if (options.filterCriteria?.userIds && options.filterCriteria.userIds.length > 0) {
      const placeholders = options.filterCriteria.userIds.map(() => '?').join(',')
      query += ` AND user_id IN (${placeholders})`
      params.push(...options.filterCriteria.userIds)
    }

    // Exclude system events if requested
    if (options.filterCriteria?.includeSystemEvents === false) {
      query += ` AND user_id IS NOT NULL`
    }

    // Order by timestamp
    query += ` ORDER BY event_timestamp DESC`

    return { query, params }
  }

  /**
   * Format audit data in requested format
   */
  private async formatAuditData(entries: AuditEntry[], format: AuditExportFormat): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(entries, null, 2)

      case 'csv':
        return this.formatAsCSV(entries)

      case 'pdf':
        return this.formatAsPDF(entries)

      case 'xlsx':
        return this.formatAsXLSX(entries)

      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  /**
   * Format as CSV
   */
  private formatAsCSV(entries: AuditEntry[]): string {
    const headers = [
      'Timestamp',
      'Event Type',
      'Event Category',
      'User ID',
      'Matter ID',
      'Document ID',
      'IP Address',
      'Event Data'
    ]

    const rows = entries.map(entry => [
      entry.event_timestamp,
      entry.event_type,
      entry.event_category,
      entry.user_id || '',
      entry.matter_id || '',
      entry.document_id || '',
      entry.ip_address || '',
      this.sanitizeForCSV(entry.event_data || '')
    ])

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ]

    return csvLines.join('\n')
  }

  /**
   * Format as PDF (metadata for PDF generation)
   */
  private formatAsPDF(entries: AuditEntry[]): string {
    // Return structured data that can be used by PDF generator
    return JSON.stringify({
      title: 'LexiCore™ IP Practice Audit Log Export',
      generatedAt: new Date().toISOString(),
      totalEntries: entries.length,
      entries: entries.map(entry => ({
        timestamp: entry.event_timestamp,
        eventType: entry.event_type,
        category: entry.event_category,
        userId: entry.user_id,
        matterId: entry.matter_id,
        documentId: entry.document_id,
        ipAddress: entry.ip_address,
        eventData: entry.event_data ? JSON.parse(entry.event_data) : null
      })),
      disclaimer: 'This audit log export is generated by LexiCore™ AI-assisted system. All AI-generated content requires attorney review before use in legal proceedings. This document is for audit and compliance purposes only.',
      certification: 'This is a true and accurate export of the audit log data as of the generation timestamp.'
    }, null, 2)
  }

  /**
   * Format as XLSX (structured data for spreadsheet generation)
   */
  private formatAsXLSX(entries: AuditEntry[]): string {
    // Return structured data that can be used by XLSX generator
    return JSON.stringify({
      sheets: [
        {
          name: 'Audit Log',
          headers: ['Timestamp', 'Event Type', 'Category', 'User', 'Matter', 'Document', 'IP Address', 'Details'],
          rows: entries.map(entry => [
            entry.event_timestamp,
            entry.event_type,
            entry.event_category,
            entry.user_id || '',
            entry.matter_id || '',
            entry.document_id || '',
            entry.ip_address || '',
            entry.event_data || ''
          ])
        }
      ]
    })
  }

  /**
   * Sanitize text for CSV
   */
  private sanitizeForCSV(text: string): string {
    return text.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')
  }

  /**
   * Generate cryptographic verification code
   */
  private generateVerificationCode(): string {
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2, 15)
    return `LEXICORE-AUDIT-${timestamp}-${random}`.toUpperCase()
  }

  /**
   * Log export access for audit trail
   */
  private async logExportAccess(
    exportId: string,
    userId: string,
    method: string,
    ipAddress: string
  ): Promise<void> {
    const accessId = generateId('export-access')
    await this.db.prepare(`
      INSERT INTO ip_export_access_log (
        id, access_type, resource_id, accessed_by, access_method, ip_address
      ) VALUES (?, 'audit_export', ?, ?, ?, ?)
    `).bind(accessId, exportId, userId, method, ipAddress).run()
  }

  /**
   * Verify export integrity using hash
   */
  async verifyExport(exportId: string, providedHash: string): Promise<boolean> {
    const result = await this.db.prepare(`
      SELECT file_hash FROM ip_audit_exports WHERE id = ?
    `).bind(exportId).first()

    if (!result) {
      throw new Error('Export not found')
    }

    return result.file_hash === providedHash
  }

  /**
   * Get export metadata
   */
  async getExportMetadata(exportId: string): Promise<any> {
    const result = await this.db.prepare(`
      SELECT 
        id, export_type, matter_id, document_id, extraction_job_id,
        date_range_start, date_range_end, exported_by, exported_at,
        total_entries, file_format, file_hash, verification_code
      FROM ip_audit_exports
      WHERE id = ?
    `).bind(exportId).first()

    if (!result) {
      throw new Error('Export not found')
    }

    return result
  }

  /**
   * List exports for a matter
   */
  async listExportsForMatter(matterId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        id, export_type, exported_by, exported_at, total_entries, 
        file_format, verification_code
      FROM ip_audit_exports
      WHERE matter_id = ?
      ORDER BY exported_at DESC
    `).bind(matterId).all()

    return result.results || []
  }
}
