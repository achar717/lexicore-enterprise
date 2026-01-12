/**
 * LexiCore™ - Regulated Document Intelligence Platform
 * 
 * REVIEW SERVICE
 * Handles attorney review and approval workflow for AI extractions
 * 
 * LEGAL COMPLIANCE:
 * - Mandatory attorney review before any extraction use
 * - Attorney-only approval/rejection authority
 * - Full justification required for all changes
 * - Complete audit trail for all review actions
 * - Field-level granular control
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface ReviewSubmission {
  extractionId: string
  reviewerId: string
  status: 'approved' | 'rejected' | 'needs_revision'
  fieldApprovals: FieldApproval[]
  overallNotes?: string
  reviewedAt: string
}

export interface FieldApproval {
  fieldName: string
  status: 'approved' | 'rejected' | 'modified'
  originalValue: any
  modifiedValue?: any
  confidence?: number
  notes?: string
  citationVerified: boolean
}

export interface ReviewQueueItem {
  extractionId: string
  documentId: string
  documentName: string
  matterId: string
  matterNumber: string
  extractionType: string
  extractedBy: string
  createdAt: string
  priority: 'high' | 'medium' | 'low'
  dueDate?: string
  assignedTo?: string
}

export class ReviewService {
  constructor(private db: D1Database) {}

  /**
   * Submit attorney review for an extraction
   */
  async submitReview(
    extractionId: string,
    reviewerId: string,
    status: 'approved' | 'rejected' | 'needs_revision',
    fieldApprovals: FieldApproval[],
    overallNotes?: string
  ): Promise<any> {
    // Verify reviewer is attorney
    const reviewer = await this.db.prepare(`
      SELECT id, is_attorney, bar_number, first_name, last_name
      FROM users WHERE id = ?
    `).bind(reviewerId).first()

    if (!reviewer || !reviewer.is_attorney) {
      throw new Error('Only licensed attorneys may review extractions')
    }

    // Get extraction details
    const extraction = await this.db.prepare(`
      SELECT e.*, d.filename, d.matter_id
      FROM extractions e
      JOIN documents d ON e.document_id = d.id
      WHERE e.id = ?
    `).bind(extractionId).first()

    if (!extraction) {
      throw new Error('Extraction not found')
    }

    // Create review record
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const now = new Date().toISOString()

    // Store review
    await this.db.prepare(`
      INSERT INTO reviews (
        id, extraction_id, reviewer_id, status, 
        field_approvals, overall_notes, reviewed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reviewId,
      extractionId,
      reviewerId,
      status,
      JSON.stringify(fieldApprovals),
      overallNotes || null,
      now,
      now
    ).run()

    // Update extraction status based on review
    let extractionStatus = 'reviewed'
    if (status === 'approved') {
      extractionStatus = 'approved'
    } else if (status === 'rejected') {
      extractionStatus = 'rejected'
    }

    await this.db.prepare(`
      UPDATE extractions 
      SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(extractionStatus, reviewerId, now, now, extractionId).run()

    // If modifications were made, create modified extraction version
    const modifiedFields = fieldApprovals.filter(f => f.status === 'modified')
    if (modifiedFields.length > 0) {
      const originalData = JSON.parse(extraction.extracted_data as string)
      const modifiedData = { ...originalData }

      modifiedFields.forEach(field => {
        if (field.modifiedValue !== undefined) {
          modifiedData[field.fieldName] = field.modifiedValue
        }
      })

      // Create new version
      const newVersion = (extraction.version || 1) + 1
      const newExtractionId = `extraction-${Date.now()}-${Math.random().toString(36).substring(7)}`

      await this.db.prepare(`
        INSERT INTO extractions (
          id, document_id, extraction_type, extracted_data,
          confidence_score, prompt_id, extracted_by, status, version,
          source_citations, created_at, updated_at, reviewed_by, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)
      `).bind(
        newExtractionId,
        extraction.document_id,
        extraction.extraction_type,
        JSON.stringify(modifiedData),
        extraction.confidence_score,
        extraction.prompt_id,
        extraction.extracted_by,
        newVersion,
        extraction.source_citations,
        now,
        now,
        reviewerId,
        now
      ).run()
    }

    // Log audit event
    await this.db.prepare(`
      INSERT INTO audit_log (
        id, event_type, user_id, resource_type, resource_id,
        details, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      'extraction.review',
      reviewerId,
      'extraction',
      extractionId,
      JSON.stringify({
        status,
        fieldCount: fieldApprovals.length,
        modificationsCount: modifiedFields.length,
        overallNotes
      }),
      'system',
      'internal',
      now
    ).run()

    return {
      reviewId,
      status,
      extractionId,
      fieldApprovals,
      reviewedAt: now,
      reviewer: {
        id: reviewer.id,
        name: `${reviewer.first_name} ${reviewer.last_name}`,
        barNumber: reviewer.bar_number
      }
    }
  }

  /**
   * Get review queue for a user
   */
  async getReviewQueue(
    userId: string,
    filters?: {
      status?: string
      priority?: string
      matterId?: string
      assignedOnly?: boolean
    }
  ): Promise<ReviewQueueItem[]> {
    // Build query
    let query = `
      SELECT 
        e.id as extraction_id,
        e.document_id,
        d.filename as document_name,
        d.matter_id,
        m.matter_number,
        e.extraction_type,
        u.first_name || ' ' || u.last_name as extracted_by,
        e.created_at,
        COALESCE(rq.priority, 'medium') as priority,
        rq.due_date,
        rq.assigned_to
      FROM extractions e
      JOIN documents d ON e.document_id = d.id
      JOIN matters m ON d.matter_id = m.id
      JOIN matter_access ma ON m.id = ma.matter_id
      LEFT JOIN users u ON e.extracted_by = u.id
      LEFT JOIN review_queue rq ON e.id = rq.extraction_id
      WHERE ma.user_id = ?
        AND e.status IN ('completed', 'pending')
        AND e.reviewed_at IS NULL
    `

    const params: any[] = [userId]

    if (filters?.matterId) {
      query += ` AND d.matter_id = ?`
      params.push(filters.matterId)
    }

    if (filters?.priority) {
      query += ` AND COALESCE(rq.priority, 'medium') = ?`
      params.push(filters.priority)
    }

    if (filters?.assignedOnly) {
      query += ` AND rq.assigned_to = ?`
      params.push(userId)
    }

    query += ` ORDER BY 
      CASE rq.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 2
      END,
      e.created_at ASC
    `

    const { results } = await this.db.prepare(query).bind(...params).all()

    return results as ReviewQueueItem[]
  }

  /**
   * Get review history for an extraction
   */
  async getReviewHistory(extractionId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT 
        r.*,
        u.first_name,
        u.last_name,
        u.email,
        u.bar_number
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.extraction_id = ?
      ORDER BY r.reviewed_at DESC
    `).bind(extractionId).all()

    return results.map((review: any) => ({
      ...review,
      field_approvals: JSON.parse(review.field_approvals),
      reviewer_name: `${review.first_name} ${review.last_name}`
    }))
  }

  /**
   * Get review statistics for a matter
   */
  async getReviewStats(matterId: string): Promise<any> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(DISTINCT e.id) as total_extractions,
        COUNT(DISTINCT CASE WHEN e.reviewed_at IS NOT NULL THEN e.id END) as reviewed_count,
        COUNT(DISTINCT CASE WHEN e.status = 'approved' THEN e.id END) as approved_count,
        COUNT(DISTINCT CASE WHEN e.status = 'rejected' THEN e.id END) as rejected_count,
        COUNT(DISTINCT CASE WHEN e.reviewed_at IS NULL AND e.status = 'completed' THEN e.id END) as pending_review,
        COUNT(DISTINCT r.id) as total_reviews,
        AVG(CASE WHEN e.reviewed_at IS NOT NULL 
          THEN (julianday(e.reviewed_at) - julianday(e.created_at)) * 24 
          END) as avg_review_time_hours
      FROM extractions e
      JOIN documents d ON e.document_id = d.id
      LEFT JOIN reviews r ON e.id = r.extraction_id
      WHERE d.matter_id = ?
    `).bind(matterId).first()

    return stats
  }

  /**
   * Assign extraction to attorney for review
   */
  async assignReview(
    extractionId: string,
    assignedTo: string,
    assignedBy: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    dueDate?: string
  ): Promise<void> {
    const queueId = `queue-${Date.now()}-${Math.random().toString(36).substring(7)}`

    await this.db.prepare(`
      INSERT OR REPLACE INTO review_queue (
        id, extraction_id, assigned_to, assigned_by, 
        priority, due_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      queueId,
      extractionId,
      assignedTo,
      assignedBy,
      priority,
      dueDate || null
    ).run()

    // Log audit event
    await this.db.prepare(`
      INSERT INTO audit_log (
        id, event_type, user_id, resource_type, resource_id,
        details, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      'extraction.assign_review',
      assignedBy,
      'extraction',
      extractionId,
      JSON.stringify({ assignedTo, priority, dueDate }),
      'system',
      'internal'
    ).run()
  }

  /**
   * Get side-by-side comparison data for review
   */
  async getReviewComparison(extractionId: string): Promise<any> {
    // Get extraction with document info
    const extraction = await this.db.prepare(`
      SELECT 
        e.*,
        d.original_filename as filename,
        d.file_size_bytes as file_size,
        d.sha256_hash as file_hash,
        d.matter_id,
        m.matter_number,
        m.matter_name,
        p.prompt_name as prompt_title,
        p.prompt_text,
        u.first_name || ' ' || u.last_name as extracted_by_name,
        u.bar_number as extractor_bar_number
      FROM extractions e
      JOIN documents d ON e.document_id = d.id
      JOIN matters m ON d.matter_id = m.id
      LEFT JOIN prompt_registry p ON e.prompt_id = p.id
      LEFT JOIN users u ON e.extracted_by = u.id
      WHERE e.id = ?
    `).bind(extractionId).first()

    if (!extraction) {
      throw new Error('Extraction not found')
    }

    // Get previous versions if any
    const { results: previousVersions } = await this.db.prepare(`
      SELECT *
      FROM extractions
      WHERE document_id = ? 
        AND extraction_type = ?
        AND version < ?
      ORDER BY version DESC
    `).bind(
      extraction.document_id,
      extraction.extraction_type,
      extraction.version
    ).all()

    // Get existing reviews
    const reviews = await this.getReviewHistory(extractionId)

    return {
      extraction: {
        ...extraction,
        extracted_data: JSON.parse(extraction.extracted_data as string),
        source_citations: extraction.source_citations 
          ? JSON.parse(extraction.source_citations as string)
          : null
      },
      previousVersions: previousVersions.map((v: any) => ({
        ...v,
        extracted_data: JSON.parse(v.extracted_data as string)
      })),
      reviews,
      documentInfo: {
        filename: extraction.filename,
        fileSize: extraction.file_size,
        fileHash: extraction.file_hash
      },
      matterInfo: {
        matterId: extraction.matter_id,
        matterNumber: extraction.matter_number,
        matterName: extraction.matter_name
      }
    }
  }

  /**
   * Bulk approve multiple extractions
   */
  async bulkApprove(
    extractionIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ approved: number; failed: number }> {
    let approved = 0
    let failed = 0

    for (const extractionId of extractionIds) {
      try {
        await this.submitReview(
          extractionId,
          reviewerId,
          'approved',
          [], // No field modifications
          notes
        )
        approved++
      } catch (error) {
        console.error(`Failed to approve extraction ${extractionId}:`, error)
        failed++
      }
    }

    return { approved, failed }
  }
}
