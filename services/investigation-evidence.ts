/**
 * LexiCore™ Investigations Practice - Evidence and Export Services
 * Phase 5: Evidentiary Audit, Chronology, and Export
 */

import crypto from 'crypto'

type Bindings = {
  DB: D1Database
}

// ============================================================================
// CHRONOLOGY FUNCTIONS
// ============================================================================

/**
 * Build cross-document event chronology
 */
export async function buildEventChronology(
  env: Bindings,
  matterId: number,
  options?: {
    startDate?: string
    endDate?: string
    categories?: string[]
    includeUnverified?: boolean
  }
): Promise<any> {
  try {
    const { DB } = env

    // Build query with filters
    let whereClause = `WHERE ec.matter_id = ?`
    const bindings: any[] = [matterId]

    if (options?.startDate) {
      whereClause += ` AND ec.event_date >= ?`
      bindings.push(options.startDate)
    }

    if (options?.endDate) {
      whereClause += ` AND ec.event_date <= ?`
      bindings.push(options.endDate)
    }

    if (options?.categories && options.categories.length > 0) {
      const placeholders = options.categories.map(() => '?').join(',')
      whereClause += ` AND ec.event_category IN (${placeholders})`
      bindings.push(...options.categories)
    }

    if (!options?.includeUnverified) {
      whereClause += ` AND ec.is_verified = 1`
    }

    const query = `
      SELECT 
        ec.*,
        d.document_name,
        d.document_type,
        u.name as created_by_name,
        v.name as verified_by_name,
        (SELECT COUNT(*) FROM investigation_chronology_conflicts cc 
         WHERE (cc.event1_id = ec.id OR cc.event2_id = ec.id) 
         AND cc.resolution_status = 'unresolved') as unresolved_conflicts
      FROM investigation_event_chronology ec
      LEFT JOIN investigation_documents d ON ec.source_document_id = d.id
      LEFT JOIN users u ON ec.created_by = u.id
      LEFT JOIN users v ON ec.verified_by = v.id
      ${whereClause}
      ORDER BY 
        ec.event_date ASC,
        ec.event_time ASC NULLS LAST,
        ec.created_at ASC
    `

    const result = await DB.prepare(query).bind(...bindings).all()

    // Parse participants JSON
    const events = (result.results || []).map((event: any) => ({
      ...event,
      participants: event.participants ? JSON.parse(event.participants) : []
    }))

    return {
      success: true,
      matter_id: matterId,
      events,
      count: events.length,
      filters: options
    }

  } catch (error: any) {
    console.error('Error building event chronology:', error)
    return {
      success: false,
      error: error.message || 'Failed to build event chronology'
    }
  }
}

/**
 * Add event to chronology
 */
export async function addChronologyEvent(
  env: Bindings,
  matterId: number,
  eventData: {
    event_date: string
    event_time?: string
    event_description: string
    source_type: string
    source_document_id?: number
    source_extraction_id?: number
    event_category?: string
    participants?: string[]
    event_location?: string
    confidence_score?: number
    page_reference?: string
    paragraph_reference?: string
    citation_text?: string
  },
  userId: number
): Promise<any> {
  try {
    const { DB } = env

    // Verify user has access to matter
    const access = await DB.prepare(`
      SELECT can_extract_facts FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!access) {
      return { success: false, error: 'User does not have access to this matter' }
    }

    // Create event_datetime if both date and time provided
    let eventDatetime = null
    if (eventData.event_date && eventData.event_time) {
      eventDatetime = `${eventData.event_date} ${eventData.event_time}`
    }

    // Insert event
    const result = await DB.prepare(`
      INSERT INTO investigation_event_chronology (
        matter_id,
        event_date,
        event_time,
        event_datetime,
        event_description,
        source_type,
        source_document_id,
        source_extraction_id,
        event_category,
        participants,
        event_location,
        confidence_score,
        page_reference,
        paragraph_reference,
        citation_text,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      matterId,
      eventData.event_date,
      eventData.event_time || null,
      eventDatetime,
      eventData.event_description,
      eventData.source_type,
      eventData.source_document_id || null,
      eventData.source_extraction_id || null,
      eventData.event_category || null,
      eventData.participants ? JSON.stringify(eventData.participants) : null,
      eventData.event_location || null,
      eventData.confidence_score || 1.0,
      eventData.page_reference || null,
      eventData.paragraph_reference || null,
      eventData.citation_text || null,
      userId
    ).run()

    const eventId = result.meta.last_row_id

    // Check for conflicts with existing events
    await detectChronologyConflicts(env, matterId, eventId)

    return {
      success: true,
      event_id: eventId,
      matter_id: matterId
    }

  } catch (error: any) {
    console.error('Error adding chronology event:', error)
    return {
      success: false,
      error: error.message || 'Failed to add chronology event'
    }
  }
}

/**
 * Detect conflicts between chronology events
 */
async function detectChronologyConflicts(
  env: Bindings,
  matterId: number,
  newEventId: number
): Promise<void> {
  const { DB } = env

  // Get the new event
  const newEvent = await DB.prepare(`
    SELECT * FROM investigation_event_chronology WHERE id = ?
  `).bind(newEventId).first()

  if (!newEvent) return

  // Find potentially conflicting events (same date range)
  const potentialConflicts = await DB.prepare(`
    SELECT * FROM investigation_event_chronology
    WHERE matter_id = ? AND id != ?
    AND event_date = ?
  `).bind(matterId, newEventId, newEvent.event_date).all()

  for (const otherEvent of potentialConflicts.results || []) {
    const conflicts = []

    // Check for time inconsistencies
    if (newEvent.event_time && (otherEvent as any).event_time) {
      if (newEvent.event_time !== (otherEvent as any).event_time &&
          newEvent.event_description === (otherEvent as any).event_description) {
        conflicts.push({
          type: 'time_inconsistency',
          description: `Same event reported at different times: ${newEvent.event_time} vs ${(otherEvent as any).event_time}`
        })
      }
    }

    // Check for participant discrepancies (if same event type/description)
    if (newEvent.participants && (otherEvent as any).participants &&
        newEvent.event_category === (otherEvent as any).event_category) {
      const newParticipants = JSON.parse(newEvent.participants as string)
      const otherParticipants = JSON.parse((otherEvent as any).participants)
      
      const hasOverlap = newParticipants.some((p: string) => otherParticipants.includes(p))
      if (!hasOverlap && newEvent.event_description === (otherEvent as any).event_description) {
        conflicts.push({
          type: 'participant_discrepancy',
          description: `Different participants reported for similar events`
        })
      }
    }

    // Record conflicts
    for (const conflict of conflicts) {
      await DB.prepare(`
        INSERT INTO investigation_chronology_conflicts (
          matter_id,
          event1_id,
          event2_id,
          conflict_type,
          conflict_description,
          conflict_severity
        ) VALUES (?, ?, ?, ?, ?, 'medium')
      `).bind(
        matterId,
        newEventId,
        (otherEvent as any).id,
        conflict.type,
        conflict.description
      ).run()

      // Mark events as having conflicts
      await DB.prepare(`
        UPDATE investigation_event_chronology 
        SET has_conflicts = 1 
        WHERE id IN (?, ?)
      `).bind(newEventId, (otherEvent as any).id).run()
    }
  }
}

// ============================================================================
// EVIDENCE PACKAGE FUNCTIONS
// ============================================================================

/**
 * Create evidence package
 */
export async function createEvidencePackage(
  env: Bindings,
  matterId: number,
  packageData: {
    package_name: string
    package_description?: string
    package_type: string
    included_documents: number[]
    included_extractions: number[]
    included_chronology_events?: number[]
  },
  userId: number
): Promise<any> {
  try {
    const { DB } = env

    // Verify user has access
    const access = await DB.prepare(`
      SELECT can_export_evidence FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!access || !access.can_export_evidence) {
      return { success: false, error: 'User does not have evidence export permissions' }
    }

    // Create package
    const result = await DB.prepare(`
      INSERT INTO investigation_evidence_packages (
        matter_id,
        package_name,
        package_description,
        package_type,
        included_documents,
        included_extractions,
        included_chronology_events,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      matterId,
      packageData.package_name,
      packageData.package_description || null,
      packageData.package_type,
      JSON.stringify(packageData.included_documents),
      JSON.stringify(packageData.included_extractions),
      packageData.included_chronology_events ? 
        JSON.stringify(packageData.included_chronology_events) : null,
      userId
    ).run()

    const packageId = result.meta.last_row_id

    // Add package items
    let displayOrder = 0

    // Add documents
    for (const docId of packageData.included_documents) {
      const doc = await DB.prepare(`
        SELECT document_name FROM investigation_documents WHERE id = ?
      `).bind(docId).first()

      if (doc) {
        await DB.prepare(`
          INSERT INTO investigation_evidence_package_items (
            package_id, item_type, item_id, item_name, display_order, added_by
          ) VALUES (?, 'document', ?, ?, ?, ?)
        `).bind(packageId, docId, doc.document_name, displayOrder++, userId).run()
      }
    }

    // Add extractions
    for (const extId of packageData.included_extractions) {
      await DB.prepare(`
        INSERT INTO investigation_evidence_package_items (
          package_id, item_type, item_id, item_name, display_order, added_by
        ) VALUES (?, 'extraction', ?, ?, ?, ?)
      `).bind(packageId, extId, `Extraction ${extId}`, displayOrder++, userId).run()
    }

    return {
      success: true,
      package_id: packageId,
      package_name: packageData.package_name,
      item_count: displayOrder
    }

  } catch (error: any) {
    console.error('Error creating evidence package:', error)
    return {
      success: false,
      error: error.message || 'Failed to create evidence package'
    }
  }
}

/**
 * Finalize evidence package (make immutable)
 */
export async function finalizeEvidencePackage(
  env: Bindings,
  packageId: number,
  matterId: number,
  userId: number,
  approvalNotes?: string
): Promise<any> {
  try {
    const { DB } = env

    // Verify user has finalization authority
    const access = await DB.prepare(`
      SELECT can_approve_final FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!access || !access.can_approve_final) {
      return { success: false, error: 'User does not have package finalization authority' }
    }

    // Get package
    const pkg = await DB.prepare(`
      SELECT * FROM investigation_evidence_packages WHERE id = ? AND matter_id = ?
    `).bind(packageId, matterId).first()

    if (!pkg) {
      return { success: false, error: 'Package not found' }
    }

    if (pkg.finalized) {
      return { success: false, error: 'Package already finalized' }
    }

    // Calculate package hash
    const packageContent = JSON.stringify({
      package_id: packageId,
      included_documents: pkg.included_documents,
      included_extractions: pkg.included_extractions,
      included_chronology_events: pkg.included_chronology_events,
      finalized_at: new Date().toISOString()
    })
    const packageHash = crypto.createHash('sha256').update(packageContent).digest('hex')

    // Finalize package
    await DB.prepare(`
      UPDATE investigation_evidence_packages
      SET finalized = 1,
          finalized_by = ?,
          finalized_at = CURRENT_TIMESTAMP,
          package_hash = ?,
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          approval_notes = ?,
          status = 'finalized'
      WHERE id = ?
    `).bind(userId, packageHash, userId, approvalNotes || null, packageId).run()

    return {
      success: true,
      package_id: packageId,
      package_hash: packageHash,
      finalized: true
    }

  } catch (error: any) {
    console.error('Error finalizing evidence package:', error)
    return {
      success: false,
      error: error.message || 'Failed to finalize evidence package'
    }
  }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export evidence package
 */
export async function exportEvidencePackage(
  env: Bindings,
  packageId: number,
  matterId: number,
  exportFormat: string,
  userId: number
): Promise<any> {
  try {
    const { DB } = env

    // Verify user access
    const access = await DB.prepare(`
      SELECT can_export_evidence FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!access || !access.can_export_evidence) {
      return { success: false, error: 'User does not have export permissions' }
    }

    // Get package
    const pkg = await DB.prepare(`
      SELECT * FROM investigation_evidence_packages WHERE id = ? AND matter_id = ?
    `).bind(packageId, matterId).first()

    if (!pkg) {
      return { success: false, error: 'Package not found' }
    }

    // Get package items
    const items = await DB.prepare(`
      SELECT * FROM investigation_evidence_package_items
      WHERE package_id = ?
      ORDER BY display_order
    `).bind(packageId).all()

    // Build export data
    const exportData: any = {
      package_id: packageId,
      package_name: pkg.package_name,
      package_type: pkg.package_type,
      matter_id: matterId,
      generated_at: new Date().toISOString(),
      generated_by: userId,
      items: []
    }

    // Fetch full data for each item
    for (const item of items.results || []) {
      if ((item as any).item_type === 'document') {
        const doc = await DB.prepare(`
          SELECT * FROM investigation_documents WHERE id = ?
        `).bind((item as any).item_id).first()
        exportData.items.push({ type: 'document', data: doc })
      } else if ((item as any).item_type === 'extraction') {
        const ext = await DB.prepare(`
          SELECT * FROM investigation_extractions WHERE id = ?
        `).bind((item as any).item_id).first()
        exportData.items.push({ type: 'extraction', data: ext })
      }
    }

    // Generate export file
    const fileName = `evidence_package_${packageId}_${Date.now()}.${exportFormat}`
    const fileContent = generateExportFile(exportData, exportFormat)
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex')

    // Log export
    const result = await DB.prepare(`
      INSERT INTO investigation_export_log (
        matter_id,
        export_type,
        export_format,
        evidence_package_id,
        file_name,
        file_hash,
        generated_by
      ) VALUES (?, 'evidence_package', ?, ?, ?, ?, ?)
    `).bind(matterId, exportFormat, packageId, fileName, fileHash, userId).run()

    const exportId = result.meta.last_row_id

    return {
      success: true,
      export_id: exportId,
      file_name: fileName,
      file_hash: fileHash,
      format: exportFormat,
      data: exportData
    }

  } catch (error: any) {
    console.error('Error exporting evidence package:', error)
    return {
      success: false,
      error: error.message || 'Failed to export evidence package'
    }
  }
}

/**
 * Export chronology
 */
export async function exportChronology(
  env: Bindings,
  matterId: number,
  exportFormat: string,
  userId: number,
  options?: {
    startDate?: string
    endDate?: string
    categories?: string[]
  }
): Promise<any> {
  try {
    const { DB } = env

    // Build chronology
    const chronologyResult = await buildEventChronology(env, matterId, options)
    if (!chronologyResult.success) {
      return chronologyResult
    }

    // Generate export file
    const fileName = `chronology_${matterId}_${Date.now()}.${exportFormat}`
    const fileContent = generateExportFile(chronologyResult.events, exportFormat)
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex')

    // Log export
    const result = await DB.prepare(`
      INSERT INTO investigation_export_log (
        matter_id,
        export_type,
        export_format,
        file_name,
        file_hash,
        export_parameters,
        generated_by
      ) VALUES (?, 'chronology', ?, ?, ?, ?, ?)
    `).bind(
      matterId,
      exportFormat,
      fileName,
      fileHash,
      JSON.stringify(options || {}),
      userId
    ).run()

    const exportId = result.meta.last_row_id

    return {
      success: true,
      export_id: exportId,
      file_name: fileName,
      file_hash: fileHash,
      format: exportFormat,
      event_count: chronologyResult.events.length,
      data: chronologyResult.events
    }

  } catch (error: any) {
    console.error('Error exporting chronology:', error)
    return {
      success: false,
      error: error.message || 'Failed to export chronology'
    }
  }
}

/**
 * Generate audit trail report
 */
export async function generateAuditTrailReport(
  env: Bindings,
  matterId: number,
  reportType: string,
  userId: number,
  options?: {
    startDate?: string
    endDate?: string
    documentIds?: number[]
    userIds?: number[]
  }
): Promise<any> {
  try {
    const { DB } = env

    // Verify user access
    const access = await DB.prepare(`
      SELECT role FROM investigation_team_members
      WHERE matter_id = ? AND user_id = ? AND removed_at IS NULL
    `).bind(matterId, userId).first()

    if (!access) {
      return { success: false, error: 'User does not have access to this matter' }
    }

    // Build report data based on type
    let reportData: any = {
      matter_id: matterId,
      report_type: reportType,
      generated_at: new Date().toISOString(),
      options
    }

    if (reportType === 'full_audit' || reportType === 'access_log') {
      // Get access log entries
      const accessLog = await DB.prepare(`
        SELECT al.*, u.name as user_name, u.email as user_email
        FROM investigation_access_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.matter_id = ?
        ${options?.startDate ? `AND al.accessed_at >= ?` : ''}
        ${options?.endDate ? `AND al.accessed_at <= ?` : ''}
        ORDER BY al.accessed_at DESC
      `).bind(
        matterId,
        ...(options?.startDate ? [options.startDate] : []),
        ...(options?.endDate ? [options.endDate] : [])
      ).all()

      reportData.access_log = accessLog.results
    }

    if (reportType === 'full_audit' || reportType === 'chain_of_custody') {
      // Get chain of custody entries
      const custody = await DB.prepare(`
        SELECT c.*, u.name as performed_by_name, d.document_name
        FROM investigation_chain_of_custody c
        LEFT JOIN users u ON c.performed_by = u.id
        LEFT JOIN investigation_documents d ON c.document_id = d.id
        WHERE c.matter_id = ?
        ORDER BY c.performed_at ASC
      `).bind(matterId).all()

      reportData.chain_of_custody = custody.results
    }

    if (reportType === 'full_audit' || reportType === 'approval_history') {
      // Get approval history
      const approvals = await DB.prepare(`
        SELECT al.*, u.name as approver_name, e.extraction_hash
        FROM investigation_approval_log al
        LEFT JOIN users u ON al.approver_id = u.id
        LEFT JOIN investigation_extractions e ON al.extraction_id = e.id
        WHERE al.matter_id = ?
        ORDER BY al.approval_date DESC
      `).bind(matterId).all()

      reportData.approval_history = approvals.results
    }

    // Calculate report hash
    const reportHash = crypto.createHash('sha256')
      .update(JSON.stringify(reportData))
      .digest('hex')

    // Save report
    const result = await DB.prepare(`
      INSERT INTO investigation_audit_trail_reports (
        matter_id,
        report_name,
        report_type,
        start_date,
        end_date,
        report_data,
        report_hash,
        generated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      matterId,
      `${reportType}_${Date.now()}`,
      reportType,
      options?.startDate || null,
      options?.endDate || null,
      JSON.stringify(reportData),
      reportHash,
      userId
    ).run()

    const reportId = result.meta.last_row_id

    return {
      success: true,
      report_id: reportId,
      report_type: reportType,
      report_hash: reportHash,
      data: reportData
    }

  } catch (error: any) {
    console.error('Error generating audit trail report:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate audit trail report'
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate export file content based on format
 */
function generateExportFile(data: any, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2)
    
    case 'csv':
      // Simple CSV generation (would need enhancement for nested data)
      if (Array.isArray(data)) {
        if (data.length === 0) return ''
        const headers = Object.keys(data[0])
        const csv = [
          headers.join(','),
          ...data.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
        ]
        return csv.join('\n')
      }
      return JSON.stringify(data)
    
    case 'html':
      // Simple HTML generation
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Evidence Export</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Evidence Export</h1>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </body>
        </html>
      `
    
    default:
      return JSON.stringify(data, null, 2)
  }
}
