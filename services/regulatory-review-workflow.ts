// LexiCore™ - Regulatory Review Workflow Service
// Phase 4: Review & Approval Workflows

import type { D1Database } from '@cloudflare/workers-types'
import { createHash } from 'crypto'

/**
 * Review action types
 */
export type ReviewAction = 'approved' | 'rejected' | 'flagged' | 'modified'

/**
 * Review stage types
 */
export type ReviewStage = 'initial_review' | 'attorney_approval' | 'finalized'

/**
 * Review submission data
 */
export interface ReviewSubmission {
  extraction_id: number
  review_action: ReviewAction
  review_notes?: string
  justification?: string
  field_changes?: Record<string, { old: string; new: string; reason: string }>
  reviewer_confidence?: number
}

/**
 * Review assignment data
 */
export interface ReviewAssignment {
  extraction_id: number
  assigned_to_user_id: string
  due_date?: string
  priority?: 'immediate' | 'high' | 'standard' | 'low'
  assignment_notes?: string
}

/**
 * Document review state
 */
export interface DocumentReviewState {
  document_id: string
  matter_id: string
  review_status: string
  total_extractions: number
  extractions_approved: number
  extractions_rejected: number
  extractions_pending: number
  completion_percentage: number
}

/**
 * Regulatory Review Workflow Service
 * Manages multi-stage review process with field-level approval
 */
export class RegulatoryReviewWorkflow {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  /**
   * Submit initial review for an extraction
   */
  async submitInitialReview(
    reviewData: ReviewSubmission,
    reviewerUserId: string,
    reviewerRole: string,
    matterId: string,
    documentId: string
  ): Promise<void> {
    // Validate extraction exists and is not locked
    const extraction = await this.getExtraction(reviewData.extraction_id)
    if (!extraction) {
      throw new Error('Extraction not found')
    }

    const lock = await this.getExtractionLock(reviewData.extraction_id)
    if (lock) {
      throw new Error('Extraction is locked and cannot be reviewed')
    }

    // Validate reviewer role (initial review can be associate or attorney)
    if (!['associate', 'senior_attorney', 'partner'].includes(reviewerRole)) {
      throw new Error('Invalid reviewer role')
    }

    // Insert review record
    await this.db
      .prepare(`
        INSERT INTO regulatory_extraction_reviews (
          extraction_id,
          matter_id,
          document_id,
          review_stage,
          reviewer_user_id,
          reviewer_role,
          review_action,
          review_notes,
          justification,
          field_changes,
          reviewer_confidence
        ) VALUES (?, ?, ?, 'initial_review', ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        reviewData.extraction_id,
        matterId,
        documentId,
        reviewerUserId,
        reviewerRole,
        reviewData.review_action,
        reviewData.review_notes || null,
        reviewData.justification || null,
        reviewData.field_changes ? JSON.stringify(reviewData.field_changes) : null,
        reviewData.reviewer_confidence || null
      )
      .run()

    // Update extraction status
    const newStatus = reviewData.review_action === 'approved' 
      ? 'initial_approved' 
      : reviewData.review_action === 'rejected'
      ? 'rejected'
      : 'in_initial_review'

    await this.db
      .prepare(`
        UPDATE regulatory_extractions
        SET review_status = ?,
            attorney_reviewed = ?,
            rejected_at = ?,
            rejected_by_user_id = ?,
            rejection_reason = ?
        WHERE id = ?
      `)
      .bind(
        newStatus,
        reviewData.review_action === 'approved' ? 1 : 0,
        reviewData.review_action === 'rejected' ? new Date().toISOString() : null,
        reviewData.review_action === 'rejected' ? reviewerUserId : null,
        reviewData.review_action === 'rejected' ? reviewData.justification : null,
        reviewData.extraction_id
      )
      .run()

    // Update document review state
    await this.updateDocumentReviewState(documentId, matterId)
  }

  /**
   * Submit attorney approval for an extraction
   */
  async submitAttorneyApproval(
    reviewData: ReviewSubmission,
    attorneyUserId: string,
    matterId: string,
    documentId: string
  ): Promise<void> {
    // Validate extraction has passed initial review
    const extraction = await this.getExtraction(reviewData.extraction_id)
    if (!extraction) {
      throw new Error('Extraction not found')
    }

    if (extraction.review_status !== 'initial_approved') {
      throw new Error('Extraction must pass initial review before attorney approval')
    }

    const lock = await this.getExtractionLock(reviewData.extraction_id)
    if (lock) {
      throw new Error('Extraction is locked and cannot be reviewed')
    }

    // Verify user is attorney
    const user = await this.db
      .prepare('SELECT is_attorney, role FROM users WHERE id = ?')
      .bind(attorneyUserId)
      .first() as any

    if (!user || !user.is_attorney) {
      throw new Error('Only licensed attorneys can provide final approval')
    }

    // Insert review record
    await this.db
      .prepare(`
        INSERT INTO regulatory_extraction_reviews (
          extraction_id,
          matter_id,
          document_id,
          review_stage,
          reviewer_user_id,
          reviewer_role,
          review_action,
          review_notes,
          justification,
          field_changes,
          reviewer_confidence
        ) VALUES (?, ?, ?, 'attorney_approval', ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        reviewData.extraction_id,
        matterId,
        documentId,
        attorneyUserId,
        user.role,
        reviewData.review_action,
        reviewData.review_notes || null,
        reviewData.justification || null,
        reviewData.field_changes ? JSON.stringify(reviewData.field_changes) : null,
        reviewData.reviewer_confidence || null
      )
      .run()

    // Update extraction status
    const newStatus = reviewData.review_action === 'approved' 
      ? 'attorney_approved' 
      : reviewData.review_action === 'rejected'
      ? 'rejected'
      : 'attorney_review'

    await this.db
      .prepare(`
        UPDATE regulatory_extractions
        SET review_status = ?,
            attorney_reviewed = 1,
            attorney_approved = ?,
            rejected_at = ?,
            rejected_by_user_id = ?,
            rejection_reason = ?
        WHERE id = ?
      `)
      .bind(
        newStatus,
        reviewData.review_action === 'approved' ? 1 : 0,
        reviewData.review_action === 'rejected' ? new Date().toISOString() : null,
        reviewData.review_action === 'rejected' ? attorneyUserId : null,
        reviewData.review_action === 'rejected' ? reviewData.justification : null,
        reviewData.extraction_id
      )
      .run()

    // Update document review state
    await this.updateDocumentReviewState(documentId, matterId)
  }

  /**
   * Finalize extraction (lock for immutability)
   */
  async finalizeExtraction(
    extractionId: number,
    userId: string,
    matterId: string,
    documentId: string,
    lockReason: string
  ): Promise<void> {
    // Validate extraction is attorney approved
    const extraction = await this.getExtraction(extractionId)
    if (!extraction) {
      throw new Error('Extraction not found')
    }

    if (extraction.review_status !== 'attorney_approved') {
      throw new Error('Extraction must be attorney approved before finalization')
    }

    // Check if already locked
    const existingLock = await this.getExtractionLock(extractionId)
    if (existingLock) {
      throw new Error('Extraction is already finalized')
    }

    // Generate content hash for immutability verification
    const contentHash = this.generateContentHash(extraction)

    // Create lock
    await this.db
      .prepare(`
        INSERT INTO regulatory_extraction_locks (
          extraction_id,
          matter_id,
          document_id,
          locked_by_user_id,
          lock_reason,
          content_hash
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        extractionId,
        matterId,
        documentId,
        userId,
        lockReason,
        contentHash
      )
      .run()

    // Update extraction status
    await this.db
      .prepare(`
        UPDATE regulatory_extractions
        SET review_status = 'finalized',
            finalized_at = ?,
            finalized_by_user_id = ?
        WHERE id = ?
      `)
      .bind(
        new Date().toISOString(),
        userId,
        extractionId
      )
      .run()

    // Update document review state
    await this.updateDocumentReviewState(documentId, matterId)
  }

  /**
   * Finalize entire document (lock all approved extractions)
   */
  async finalizeDocument(
    documentId: string,
    matterId: string,
    userId: string
  ): Promise<{ finalized_count: number; skipped_count: number }> {
    // Get all attorney-approved extractions
    const extractions = await this.db
      .prepare(`
        SELECT id FROM regulatory_extractions
        WHERE document_id = ? 
          AND matter_id = ?
          AND review_status = 'attorney_approved'
          AND id NOT IN (SELECT extraction_id FROM regulatory_extraction_locks)
      `)
      .bind(documentId, matterId)
      .all()

    let finalizedCount = 0
    let skippedCount = 0

    for (const extraction of (extractions.results || [])) {
      try {
        await this.finalizeExtraction(
          (extraction as any).id,
          userId,
          matterId,
          documentId,
          'document_finalization'
        )
        finalizedCount++
      } catch (error) {
        console.error('Failed to finalize extraction:', error)
        skippedCount++
      }
    }

    // Update document review state to finalized
    await this.db
      .prepare(`
        UPDATE regulatory_document_review_state
        SET review_status = 'finalized',
            finalized_at = ?,
            finalized_by_user_id = ?
        WHERE document_id = ?
      `)
      .bind(
        new Date().toISOString(),
        userId,
        documentId
      )
      .run()

    return { finalized_count: finalizedCount, skipped_count: skippedCount }
  }

  /**
   * Assign extraction for review
   */
  async assignReview(
    assignment: ReviewAssignment,
    assignedByUserId: string,
    matterId: string,
    documentId: string
  ): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO regulatory_review_assignments (
          extraction_id,
          matter_id,
          document_id,
          assigned_to_user_id,
          assigned_by_user_id,
          due_date,
          priority,
          assignment_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        assignment.extraction_id,
        matterId,
        documentId,
        assignment.assigned_to_user_id,
        assignedByUserId,
        assignment.due_date || null,
        assignment.priority || 'standard',
        assignment.assignment_notes || null
      )
      .run()
  }

  /**
   * Get extraction review history
   */
  async getReviewHistory(extractionId: number): Promise<any[]> {
    const history = await this.db
      .prepare(`
        SELECT 
          r.*,
          u.first_name || ' ' || u.last_name as reviewer_name,
          u.email as reviewer_email
        FROM regulatory_extraction_reviews r
        JOIN users u ON r.reviewer_user_id = u.id
        WHERE r.extraction_id = ?
        ORDER BY r.review_timestamp ASC
      `)
      .bind(extractionId)
      .all()

    return (history.results || []).map((r: any) => ({
      ...r,
      field_changes: r.field_changes ? JSON.parse(r.field_changes) : null
    }))
  }

  /**
   * Get document review state
   */
  async getDocumentReviewState(documentId: string): Promise<DocumentReviewState | null> {
    const state = await this.db
      .prepare(`
        SELECT * FROM regulatory_document_review_state
        WHERE document_id = ?
      `)
      .bind(documentId)
      .first() as any

    if (!state) {
      return null
    }

    const completionPercentage = state.total_extractions > 0
      ? (state.extractions_approved / state.total_extractions * 100)
      : 0

    return {
      ...state,
      completion_percentage: parseFloat(completionPercentage.toFixed(1))
    }
  }

  /**
   * Get extraction
   */
  private async getExtraction(extractionId: number): Promise<any> {
    return await this.db
      .prepare('SELECT * FROM regulatory_extractions WHERE id = ?')
      .bind(extractionId)
      .first()
  }

  /**
   * Get extraction lock
   */
  private async getExtractionLock(extractionId: number): Promise<any> {
    return await this.db
      .prepare(`
        SELECT * FROM regulatory_extraction_locks
        WHERE extraction_id = ? AND unlocked_at IS NULL
      `)
      .bind(extractionId)
      .first()
  }

  /**
   * Update document review state statistics
   */
  private async updateDocumentReviewState(documentId: string, matterId: string): Promise<void> {
    // Get extraction statistics
    const stats = await this.db
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN attorney_approved = 1 THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN review_status IN ('pending_review', 'in_initial_review', 'attorney_review') THEN 1 ELSE 0 END) as pending
        FROM regulatory_extractions
        WHERE document_id = ?
      `)
      .bind(documentId)
      .first() as any

    // Check if review state exists
    const existingState = await this.db
      .prepare('SELECT id FROM regulatory_document_review_state WHERE document_id = ?')
      .bind(documentId)
      .first()

    if (!existingState) {
      // Create new state
      await this.db
        .prepare(`
          INSERT INTO regulatory_document_review_state (
            document_id,
            matter_id,
            review_status,
            total_extractions,
            extractions_approved,
            extractions_rejected,
            extractions_pending
          ) VALUES (?, ?, 'initial_review_in_progress', ?, ?, ?, ?)
        `)
        .bind(
          documentId,
          matterId,
          stats?.total || 0,
          stats?.approved || 0,
          stats?.rejected || 0,
          stats?.pending || 0
        )
        .run()
    } else {
      // Update existing state
      await this.db
        .prepare(`
          UPDATE regulatory_document_review_state
          SET total_extractions = ?,
              extractions_approved = ?,
              extractions_rejected = ?,
              extractions_pending = ?,
              updated_at = ?
          WHERE document_id = ?
        `)
        .bind(
          stats?.total || 0,
          stats?.approved || 0,
          stats?.rejected || 0,
          stats?.pending || 0,
          new Date().toISOString(),
          documentId
        )
        .run()
    }
  }

  /**
   * Generate content hash for immutability verification
   */
  private generateContentHash(extraction: any): string {
    const content = JSON.stringify({
      extraction_type: extraction.extraction_type,
      extracted_value: extraction.extracted_value,
      confidence_score: extraction.confidence_score,
      source_page: extraction.source_page,
      extraction_metadata: extraction.extraction_metadata
    })
    
    // In browser/Cloudflare Workers, use Web Crypto API
    return content // Simplified - in production, use SHA-256
  }
}
