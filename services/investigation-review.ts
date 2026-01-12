/**
 * LexiCore™ Investigations Practice - Review and Approval Services
 * Phase 4: Review Workflows
 */

type Bindings = {
  DB: D1Database
}

/**
 * Assign an extraction for review
 */
export async function assignExtractionForReview(
  env: Bindings,
  extractionId: number,
  matterId: number,
  assignedTo: number,
  assignedBy: number,
  reviewTier: string = 'initial_review',
  priority: string = 'standard',
  dueDate?: string,
  notes?: string
): Promise<any> {
  try {
    const { DB } = env

    // Verify extraction exists
    const extraction = await DB.prepare(`
      SELECT id, extraction_status FROM investigation_extractions WHERE id = ?
    `).bind(extractionId).first()

    if (!extraction) {
      return { success: false, error: 'Extraction not found' }
    }

    // Verify assignee is a team member with review permissions
    const assignee = await DB.prepare(`
      SELECT can_review_extractions FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, assignedTo).first()

    if (!assignee || !assignee.can_review_extractions) {
      return { success: false, error: 'Assignee does not have review permissions' }
    }

    // Create review assignment
    const result = await DB.prepare(`
      INSERT INTO investigation_review_assignments (
        extraction_id,
        matter_id,
        assigned_to,
        assigned_by,
        review_tier,
        priority,
        due_date,
        notes,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned')
    `).bind(
      extractionId,
      matterId,
      assignedTo,
      assignedBy,
      reviewTier,
      priority,
      dueDate || null,
      notes || null
    ).run()

    const assignmentId = result.meta.last_row_id

    // Update extraction status
    await DB.prepare(`
      UPDATE investigation_extractions
      SET review_status = 'assigned',
          assigned_for_review_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(extractionId).run()

    // Log in chain of custody
    await DB.prepare(`
      INSERT INTO investigation_chain_of_custody (
        document_id,
        matter_id,
        event_type,
        event_description,
        performed_by
      )
      SELECT document_id, ?, 'review_assigned', ?, ?
      FROM investigation_extractions WHERE id = ?
    `).bind(
      matterId,
      `Extraction assigned for ${reviewTier} review`,
      assignedBy,
      extractionId
    ).run()

    return {
      success: true,
      assignment_id: assignmentId,
      extraction_id: extractionId,
      assigned_to: assignedTo,
      review_tier: reviewTier,
      status: 'assigned'
    }

  } catch (error: any) {
    console.error('Error assigning extraction for review:', error)
    return {
      success: false,
      error: error.message || 'Failed to assign extraction for review'
    }
  }
}

/**
 * Submit field-level review
 */
export async function submitFieldReview(
  env: Bindings,
  extractionId: number,
  reviewAssignmentId: number,
  fieldPath: string,
  fieldContent: string,
  decision: string,
  reviewerId: number,
  reviewComment?: string,
  concerns?: {
    reliability?: boolean
    privilege?: boolean
    sensitivity?: boolean
  }
): Promise<any> {
  try {
    const { DB } = env

    // Verify review assignment exists and reviewer is assigned
    const assignment = await DB.prepare(`
      SELECT assigned_to, status FROM investigation_review_assignments WHERE id = ?
    `).bind(reviewAssignmentId).first()

    if (!assignment) {
      return { success: false, error: 'Review assignment not found' }
    }

    if (assignment.assigned_to !== reviewerId) {
      return { success: false, error: 'User not assigned to this review' }
    }

    if (assignment.status === 'completed') {
      return { success: false, error: 'Review already completed' }
    }

    // Update assignment status to in_progress if not already
    if (assignment.status === 'assigned') {
      await DB.prepare(`
        UPDATE investigation_review_assignments
        SET status = 'in_progress',
            started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(reviewAssignmentId).run()
    }

    // Insert field review
    const result = await DB.prepare(`
      INSERT INTO investigation_field_reviews (
        extraction_id,
        review_assignment_id,
        field_path,
        field_content,
        decision,
        reviewer_id,
        review_comment,
        reliability_concern,
        privilege_concern,
        sensitivity_concern
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      extractionId,
      reviewAssignmentId,
      fieldPath,
      fieldContent,
      decision,
      reviewerId,
      reviewComment || null,
      concerns?.reliability ? 1 : 0,
      concerns?.privilege ? 1 : 0,
      concerns?.sensitivity ? 1 : 0
    ).run()

    const fieldReviewId = result.meta.last_row_id

    // If flagged or rejected, update extraction status
    if (decision === 'flagged' || decision === 'rejected') {
      await DB.prepare(`
        UPDATE investigation_extractions
        SET review_status = 'requires_attention',
            attorney_review_required = 1,
            attorney_review_reason = ?
        WHERE id = ?
      `).bind(`Field ${decision}: ${fieldPath}`, extractionId).run()
    }

    return {
      success: true,
      field_review_id: fieldReviewId,
      extraction_id: extractionId,
      field_path: fieldPath,
      decision,
      status: 'reviewed'
    }

  } catch (error: any) {
    console.error('Error submitting field review:', error)
    return {
      success: false,
      error: error.message || 'Failed to submit field review'
    }
  }
}

/**
 * Submit approval decision
 */
export async function submitApprovalDecision(
  env: Bindings,
  extractionId: number,
  matterId: number,
  approverId: number,
  approverRole: string,
  approvalLevel: string,
  decision: string,
  approvalNotes?: string,
  concerns?: string,
  conditions?: string
): Promise<any> {
  try {
    const { DB } = env

    // Verify extraction exists
    const extraction = await DB.prepare(`
      SELECT extraction_data, extraction_hash FROM investigation_extractions WHERE id = ?
    `).bind(extractionId).first()

    if (!extraction) {
      return { success: false, error: 'Extraction not found' }
    }

    // Verify approver has authority for this approval level
    const teamMember = await DB.prepare(`
      SELECT role, can_approve_final FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, approverId).first()

    if (!teamMember) {
      return { success: false, error: 'Approver not a team member on this matter' }
    }

    // Check approval authority
    const hasAuthority = checkApprovalAuthority(teamMember.role, approvalLevel)
    if (!hasAuthority) {
      return {
        success: false,
        error: `Role ${teamMember.role} does not have authority for ${approvalLevel} approval`
      }
    }

    // Insert into immutable approval log
    const result = await DB.prepare(`
      INSERT INTO investigation_approval_log (
        extraction_id,
        matter_id,
        approval_level,
        approver_id,
        approver_role,
        decision,
        approval_notes,
        concerns_documented,
        conditions_imposed,
        document_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      extractionId,
      matterId,
      approvalLevel,
      approverId,
      approverRole,
      decision,
      approvalNotes || null,
      concerns || null,
      conditions || null,
      extraction.extraction_hash
    ).run()

    const approvalLogId = result.meta.last_row_id

    // Update extraction approval status
    let newStatus = 'pending_approval'
    if (decision === 'approved') {
      newStatus = determineNextApprovalStatus(approvalLevel)
    } else if (decision === 'rejected') {
      newStatus = 'rejected'
    } else if (decision === 'returned_for_revision') {
      newStatus = 'requires_revision'
    }

    await DB.prepare(`
      UPDATE investigation_extractions
      SET review_status = ?,
          approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
          approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END
      WHERE id = ?
    `).bind(newStatus, decision, decision, approverId, extractionId).run()

    // Log in chain of custody
    await DB.prepare(`
      INSERT INTO investigation_chain_of_custody (
        document_id,
        matter_id,
        event_type,
        event_description,
        performed_by
      )
      SELECT document_id, ?, 'approval', ?, ?
      FROM investigation_extractions WHERE id = ?
    `).bind(
      matterId,
      `${approvalLevel} approval: ${decision}`,
      approverId,
      extractionId
    ).run()

    return {
      success: true,
      approval_log_id: approvalLogId,
      extraction_id: extractionId,
      approval_level: approvalLevel,
      decision,
      new_status: newStatus
    }

  } catch (error: any) {
    console.error('Error submitting approval decision:', error)
    return {
      success: false,
      error: error.message || 'Failed to submit approval decision'
    }
  }
}

/**
 * Finalize and lock an extraction
 */
export async function finalizeExtraction(
  env: Bindings,
  extractionId: number,
  matterId: number,
  userId: number,
  finalizationNotes?: string
): Promise<any> {
  try {
    const { DB } = env

    // Verify user has finalization authority
    const teamMember = await DB.prepare(`
      SELECT role, can_approve_final FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!teamMember || !teamMember.can_approve_final) {
      return { success: false, error: 'User does not have finalization authority' }
    }

    // Get extraction and verify it's approved
    const extraction = await DB.prepare(`
      SELECT extraction_data, extraction_hash, review_status
      FROM investigation_extractions WHERE id = ?
    `).bind(extractionId).first()

    if (!extraction) {
      return { success: false, error: 'Extraction not found' }
    }

    if (extraction.review_status !== 'approved') {
      return { success: false, error: 'Extraction must be approved before finalization' }
    }

    // Check if already finalized
    const existing = await DB.prepare(`
      SELECT id FROM investigation_extraction_finalization WHERE extraction_id = ?
    `).bind(extractionId).first()

    if (existing) {
      return { success: false, error: 'Extraction already finalized and locked' }
    }

    // Get approval chain
    const approvals = await DB.prepare(`
      SELECT id FROM investigation_approval_log
      WHERE extraction_id = ? ORDER BY approval_date ASC
    `).bind(extractionId).all()

    const approvalChain = JSON.stringify((approvals.results || []).map((a: any) => a.id))

    // Create finalization record
    const result = await DB.prepare(`
      INSERT INTO investigation_extraction_finalization (
        extraction_id,
        matter_id,
        finalized_by,
        approval_chain,
        extraction_hash,
        extraction_snapshot,
        locked,
        finalization_notes
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      extractionId,
      matterId,
      userId,
      approvalChain,
      extraction.extraction_hash,
      extraction.extraction_data,
      finalizationNotes || null
    ).run()

    const finalizationId = result.meta.last_row_id

    // Update extraction status
    await DB.prepare(`
      UPDATE investigation_extractions
      SET review_status = 'finalized',
          finalized_at = CURRENT_TIMESTAMP,
          is_locked = 1
      WHERE id = ?
    `).bind(extractionId).run()

    // Log in chain of custody
    await DB.prepare(`
      INSERT INTO investigation_chain_of_custody (
        document_id,
        matter_id,
        event_type,
        event_description,
        performed_by
      )
      SELECT document_id, ?, 'finalization', 'Extraction finalized and locked for evidence', ?
      FROM investigation_extractions WHERE id = ?
    `).bind(matterId, userId, extractionId).run()

    return {
      success: true,
      finalization_id: finalizationId,
      extraction_id: extractionId,
      locked: true,
      finalized_at: new Date().toISOString()
    }

  } catch (error: any) {
    console.error('Error finalizing extraction:', error)
    return {
      success: false,
      error: error.message || 'Failed to finalize extraction'
    }
  }
}

/**
 * Get review queue for a user
 */
export async function getReviewQueue(
  env: Bindings,
  userId: string,
  filters?: {
    matter_id?: number
    priority?: string
    status?: string
    overdue_only?: boolean
  }
): Promise<any> {
  try {
    const { DB } = env

    // Build query with filters
    let whereClause = `WHERE ra.assigned_to = ?`
    const bindings: any[] = [userId]

    if (filters?.matter_id) {
      whereClause += ` AND ra.matter_id = ?`
      bindings.push(filters.matter_id)
    }

    if (filters?.priority) {
      whereClause += ` AND ra.priority = ?`
      bindings.push(filters.priority)
    }

    if (filters?.status) {
      whereClause += ` AND ra.status = ?`
      bindings.push(filters.status)
    } else {
      // Default: only show active reviews
      whereClause += ` AND ra.status IN ('assigned', 'in_progress')`
    }

    if (filters?.overdue_only) {
      whereClause += ` AND ra.due_date < DATE('now') AND ra.status != 'completed'`
    }

    const query = `
      SELECT 
        ra.*,
        e.extraction_hash,
        e.extraction_confidence,
        e.extraction_type,
        e.attorney_review_required,
        e.attorney_review_reason,
        d.document_name,
        d.document_type,
        d.sensitivity_level,
        m.matter_name,
        m.client_name,
        (u.first_name || ' ' || u.last_name) as assigned_by_name,
        (SELECT COUNT(*) FROM investigation_field_reviews fr 
         WHERE fr.review_assignment_id = ra.id) as field_review_count,
        CASE 
          WHEN ra.due_date < DATE('now') AND ra.status != 'completed' THEN 1
          ELSE 0
        END as is_overdue
      FROM investigation_review_assignments ra
      INNER JOIN investigation_extractions e ON ra.extraction_id = e.id
      INNER JOIN investigation_documents d ON e.document_id = d.id
      INNER JOIN matters m ON ra.matter_id = m.id
      LEFT JOIN users u ON ra.assigned_by = u.id
      ${whereClause}
      ORDER BY 
        CASE ra.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'standard' THEN 3
          WHEN 'low' THEN 4
        END,
        ra.due_date ASC NULLS LAST,
        ra.assigned_at ASC
    `

    const result = await DB.prepare(query).bind(...bindings).all()

    return {
      success: true,
      queue: result.results || []
    }

  } catch (error: any) {
    console.error('Error fetching review queue:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch review queue'
    }
  }
}

/**
 * Helper: Check if role has authority for approval level
 */
function checkApprovalAuthority(role: string, approvalLevel: string): boolean {
  const authorityMatrix: Record<string, string[]> = {
    'lead_attorney': ['initial_review', 'supervising_attorney', 'final_approval'],
    'supervising_attorney': ['initial_review', 'supervising_attorney', 'board_level', 'government_review', 'final_approval'],
    'associate': ['initial_review'],
    'investigator': ['initial_review'],
    'paralegal': [],
    'examiner': []
  }

  return (authorityMatrix[role] || []).includes(approvalLevel)
}

/**
 * Helper: Determine next approval status based on current level
 */
function determineNextApprovalStatus(approvalLevel: string): string {
  const statusFlow: Record<string, string> = {
    'initial_review': 'pending_supervising',
    'supervising_attorney': 'approved',
    'board_level': 'approved',
    'government_review': 'approved',
    'final_approval': 'approved'
  }

  return statusFlow[approvalLevel] || 'pending_approval'
}
