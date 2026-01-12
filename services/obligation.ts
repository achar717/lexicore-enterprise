// LexiCore™ Obligation Tracking Service
// Phase 6: Obligation & Deadline Management
// © 2024 LexiCore. Advisory Tool Only - No Legal Advice.

import type { D1Database } from '@cloudflare/workers-types'

interface Obligation {
  id: string
  contract_id: string
  matter_id: string
  obligation_title: string
  obligation_description: string
  obligation_type: string
  obligation_category: string
  obligated_party: string
  beneficiary_party?: string
  due_date: string
  status: string
  priority: string
  assigned_to?: string
  completion_percentage: number
  is_overdue: boolean
  days_until_due?: number
  source_clause?: string
  notes?: string
}

interface ObligationFilters {
  matter_id?: string
  contract_id?: string
  status?: string
  priority?: string
  assigned_to?: string
  is_overdue?: boolean
  due_date_from?: string
  due_date_to?: string
}

export class ObligationService {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  /**
   * Get all obligations with optional filters
   */
  async getObligations(filters: ObligationFilters = {}) {
    let query = `
      SELECT 
        o.*,
        c.contract_title,
        c.contract_type,
        m.matter_name,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        julianday(o.due_date) - julianday('now') as days_remaining
      FROM transactional_contract_obligations o
      LEFT JOIN contracts c ON o.contract_id = c.id
      LEFT JOIN matters m ON o.matter_id = m.id
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE 1=1
    `

    const params: any[] = []

    if (filters.matter_id) {
      query += ` AND o.matter_id = ?`
      params.push(filters.matter_id)
    }

    if (filters.contract_id) {
      query += ` AND o.contract_id = ?`
      params.push(filters.contract_id)
    }

    if (filters.status) {
      query += ` AND o.status = ?`
      params.push(filters.status)
    }

    if (filters.priority) {
      query += ` AND o.priority = ?`
      params.push(filters.priority)
    }

    if (filters.assigned_to) {
      query += ` AND o.assigned_to = ?`
      params.push(filters.assigned_to)
    }

    if (filters.is_overdue !== undefined) {
      query += ` AND o.is_overdue = ?`
      params.push(filters.is_overdue ? 1 : 0)
    }

    if (filters.due_date_from) {
      query += ` AND o.due_date >= ?`
      params.push(filters.due_date_from)
    }

    if (filters.due_date_to) {
      query += ` AND o.due_date <= ?`
      params.push(filters.due_date_to)
    }

    query += ` ORDER BY o.due_date ASC, o.priority DESC`

    const stmt = this.db.prepare(query)
    const result = await stmt.bind(...params).all()
    return result.results || []
  }

  /**
   * Get obligation by ID
   */
  async getObligationById(obligationId: string) {
    const stmt = this.db.prepare(`
      SELECT 
        o.*,
        c.contract_title,
        c.contract_type,
        m.matter_name,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        creator.first_name || ' ' || creator.last_name as created_by_name
      FROM transactional_contract_obligations o
      LEFT JOIN contracts c ON o.contract_id = c.id
      LEFT JOIN matters m ON o.matter_id = m.id
      LEFT JOIN users u ON o.assigned_to = u.id
      LEFT JOIN users creator ON o.created_by = creator.id
      WHERE o.id = ?
    `)

    const result = await stmt.bind(obligationId).first()
    return result
  }

  /**
   * Create new obligation
   */
  async createObligation(data: {
    contract_id: string
    matter_id: string
    obligation_title: string
    obligation_description: string
    obligation_type: string
    obligation_category: string
    obligated_party: string
    beneficiary_party?: string
    due_date: string
    priority?: string
    assigned_to?: string
    notify_before_days?: number
    source_clause?: string
    notes?: string
    created_by: string
  }) {
    const id = `obl-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    // Calculate days_until_due
    const dueDate = new Date(data.due_date)
    const now = new Date()
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const isOverdue = daysUntilDue < 0

    const stmt = this.db.prepare(`
      INSERT INTO transactional_contract_obligations (
        id, contract_id, matter_id, obligation_title, obligation_description,
        obligation_type, obligation_category, obligated_party, beneficiary_party,
        due_date, status, priority, assigned_to, assigned_by, assigned_at,
        notify_before_days, days_until_due, is_overdue, source_clause, notes,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)

    await stmt.bind(
      id,
      data.contract_id,
      data.matter_id,
      data.obligation_title,
      data.obligation_description,
      data.obligation_type,
      data.obligation_category,
      data.obligated_party,
      data.beneficiary_party || null,
      data.due_date,
      data.priority || 'medium',
      data.assigned_to || null,
      data.created_by,
      data.notify_before_days || 7,
      daysUntilDue,
      isOverdue ? 1 : 0,
      data.source_clause || null,
      data.notes || null,
      data.created_by
    ).run()

    // Log activity
    await this.logActivity(id, 'created', 'Obligation created', data.created_by)

    return { id, success: true }
  }

  /**
   * Update obligation
   */
  async updateObligation(
    obligationId: string,
    updates: {
      obligation_title?: string
      obligation_description?: string
      due_date?: string
      status?: string
      priority?: string
      assigned_to?: string
      completion_percentage?: number
      notes?: string
    },
    userId: string
  ) {
    // Get current obligation for activity logging
    const current = await this.getObligationById(obligationId)
    
    const fields: string[] = []
    const params: any[] = []

    if (updates.obligation_title !== undefined) {
      fields.push('obligation_title = ?')
      params.push(updates.obligation_title)
    }

    if (updates.obligation_description !== undefined) {
      fields.push('obligation_description = ?')
      params.push(updates.obligation_description)
    }

    if (updates.due_date !== undefined) {
      fields.push('due_date = ?')
      params.push(updates.due_date)
      
      // Recalculate days_until_due
      const dueDate = new Date(updates.due_date)
      const now = new Date()
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      fields.push('days_until_due = ?')
      params.push(daysUntilDue)
      fields.push('is_overdue = ?')
      params.push(daysUntilDue < 0 ? 1 : 0)
    }

    if (updates.status !== undefined) {
      fields.push('status = ?')
      params.push(updates.status)
      
      // If completed, set completion_percentage to 100 and completion timestamp
      if (updates.status === 'completed') {
        fields.push('completion_percentage = ?')
        params.push(100)
        fields.push('completed_at = datetime("now")')
        fields.push('completed_by = ?')
        params.push(userId)
      }
    }

    if (updates.priority !== undefined) {
      fields.push('priority = ?')
      params.push(updates.priority)
    }

    if (updates.assigned_to !== undefined) {
      fields.push('assigned_to = ?')
      params.push(updates.assigned_to)
      fields.push('assigned_by = ?')
      params.push(userId)
      fields.push('assigned_at = datetime("now")')
    }

    if (updates.completion_percentage !== undefined) {
      fields.push('completion_percentage = ?')
      params.push(updates.completion_percentage)
    }

    if (updates.notes !== undefined) {
      fields.push('notes = ?')
      params.push(updates.notes)
    }

    fields.push('updated_at = datetime("now")')
    params.push(obligationId)

    const stmt = this.db.prepare(`
      UPDATE transactional_contract_obligations
      SET ${fields.join(', ')}
      WHERE id = ?
    `)

    await stmt.bind(...params).run()

    // Log activity
    let activityDesc = 'Obligation updated'
    if (updates.status && current.status !== updates.status) {
      activityDesc = `Status changed from ${current.status} to ${updates.status}`
      await this.logActivity(obligationId, 'status_changed', activityDesc, userId, {
        old_status: current.status,
        new_status: updates.status
      })
    } else if (updates.assigned_to && current.assigned_to !== updates.assigned_to) {
      activityDesc = `Reassigned to new attorney`
      await this.logActivity(obligationId, 'assigned', activityDesc, userId, {
        old_assigned_to: current.assigned_to,
        new_assigned_to: updates.assigned_to
      })
    } else {
      await this.logActivity(obligationId, 'updated', activityDesc, userId)
    }

    return { success: true }
  }

  /**
   * Delete obligation
   */
  async deleteObligation(obligationId: string, userId: string) {
    // Log activity first
    await this.logActivity(obligationId, 'updated', 'Obligation deleted', userId)

    const stmt = this.db.prepare(`
      DELETE FROM transactional_contract_obligations
      WHERE id = ?
    `)

    await stmt.bind(obligationId).run()
    return { success: true }
  }

  /**
   * Get obligation statistics
   */
  async getObligationStats(matterId?: string) {
    let whereClause = '1=1'
    const params: any[] = []

    if (matterId) {
      whereClause = 'matter_id = ?'
      params.push(matterId)
    }

    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_obligations,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN is_overdue = 1 THEN 1 END) as overdue_count,
        COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count,
        AVG(completion_percentage) as avg_completion_percentage
      FROM transactional_contract_obligations
      WHERE ${whereClause}
    `)

    const result = await stmt.bind(...params).first()
    return result
  }

  /**
   * Get upcoming obligations (next 30 days)
   */
  async getUpcomingObligations(matterId?: string, days: number = 30) {
    let whereClause = `o.status NOT IN ('completed', 'waived')
      AND o.due_date BETWEEN datetime('now') AND datetime('now', '+${days} days')`
    
    const params: any[] = []

    if (matterId) {
      whereClause += ` AND o.matter_id = ?`
      params.push(matterId)
    }

    const stmt = this.db.prepare(`
      SELECT 
        o.*,
        c.contract_title,
        c.contract_type,
        m.matter_name,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        julianday(o.due_date) - julianday('now') as days_remaining
      FROM transactional_contract_obligations o
      LEFT JOIN contracts c ON o.contract_id = c.id
      LEFT JOIN matters m ON o.matter_id = m.id
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE ${whereClause}
      ORDER BY o.due_date ASC, o.priority DESC
      LIMIT 10
    `)

    const result = await stmt.bind(...params).all()
    return result.results || []
  }

  /**
   * Get overdue obligations
   */
  async getOverdueObligations(matterId?: string) {
    let whereClause = `o.status NOT IN ('completed', 'waived')
      AND o.due_date < datetime('now')`
    
    const params: any[] = []

    if (matterId) {
      whereClause += ` AND o.matter_id = ?`
      params.push(matterId)
    }

    const stmt = this.db.prepare(`
      SELECT 
        o.*,
        c.contract_title,
        c.contract_type,
        m.matter_name,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        julianday('now') - julianday(o.due_date) as days_overdue
      FROM transactional_contract_obligations o
      LEFT JOIN contracts c ON o.contract_id = c.id
      LEFT JOIN matters m ON o.matter_id = m.id
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE ${whereClause}
      ORDER BY o.due_date ASC, o.priority DESC
    `)

    const result = await stmt.bind(...params).all()
    return result.results || []
  }

  /**
   * Get obligation activities/history
   */
  async getObligationActivities(obligationId: string) {
    const stmt = this.db.prepare(`
      SELECT 
        a.*,
        u.first_name || ' ' || u.last_name as performed_by_name
      FROM transactional_obligation_activities a
      LEFT JOIN users u ON a.performed_by = u.id
      WHERE a.obligation_id = ?
      ORDER BY a.performed_at DESC
    `)

    const result = await stmt.bind(obligationId).all()
    return result.results || []
  }

  /**
   * Log obligation activity
   */
  private async logActivity(
    obligationId: string,
    activityType: string,
    description: string,
    userId: string,
    additionalData?: {
      old_status?: string
      new_status?: string
      old_assigned_to?: string
      new_assigned_to?: string
    }
  ) {
    const id = `act-${Date.now()}-${Math.random().toString(36).substring(7)}`

    const stmt = this.db.prepare(`
      INSERT INTO transactional_obligation_activities (
        id, obligation_id, activity_type, activity_description,
        old_status, new_status, old_assigned_to, new_assigned_to,
        performed_by, performed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)

    await stmt.bind(
      id,
      obligationId,
      activityType,
      description,
      additionalData?.old_status || null,
      additionalData?.new_status || null,
      additionalData?.old_assigned_to || null,
      additionalData?.new_assigned_to || null,
      userId
    ).run()
  }

  /**
   * Create reminder for obligation
   */
  async createReminder(
    obligationId: string,
    reminderType: string,
    recipientUserId: string,
    recipientEmail: string,
    scheduledFor: string,
    title: string,
    message: string
  ) {
    const id = `rem-${Date.now()}-${Math.random().toString(36).substring(7)}`

    const stmt = this.db.prepare(`
      INSERT INTO transactional_obligation_reminders (
        id, obligation_id, reminder_type, recipient_user_id, recipient_email,
        reminder_title, reminder_message, scheduled_for, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)

    await stmt.bind(
      id,
      obligationId,
      reminderType,
      recipientUserId,
      recipientEmail,
      title,
      message,
      scheduledFor
    ).run()

    return { id, success: true }
  }

  /**
   * Get pending reminders (for notification system)
   */
  async getPendingReminders() {
    const stmt = this.db.prepare(`
      SELECT r.*, o.obligation_title, o.due_date
      FROM transactional_obligation_reminders r
      LEFT JOIN transactional_contract_obligations o ON r.obligation_id = o.id
      WHERE r.is_sent = 0
        AND r.scheduled_for <= datetime('now')
      ORDER BY r.scheduled_for ASC
      LIMIT 50
    `)

    const result = await stmt.all()
    return result.results || []
  }

  /**
   * Mark reminder as sent
   */
  async markReminderAsSent(reminderId: string) {
    const stmt = this.db.prepare(`
      UPDATE transactional_obligation_reminders
      SET is_sent = 1, sent_at = datetime('now')
      WHERE id = ?
    `)

    await stmt.bind(reminderId).run()
  }

  /**
   * Auto-extract obligations from contract extractions
   * Analyzes extractions to identify potential obligations
   */
  async autoExtractObligations(contractId: string, userId: string) {
    // Get contract details
    const contractStmt = this.db.prepare(`
      SELECT * FROM contracts WHERE id = ?
    `)
    const contract = await contractStmt.bind(contractId).first()

    if (!contract) {
      throw new Error('Contract not found')
    }

    // Get all extractions for this contract
    const extractionsStmt = this.db.prepare(`
      SELECT * FROM contract_extractions 
      WHERE contract_id = ?
      ORDER BY field_category, field_name
    `)
    const extractions = await extractionsStmt.bind(contractId).all()

    const obligationKeywords = {
      payment: ['payment', 'pay', 'fee', 'cost', 'price', 'compensation', 'invoice'],
      delivery: ['deliver', 'delivery', 'shipment', 'provide', 'furnish', 'supply'],
      performance: ['perform', 'service', 'obligation', 'duty', 'responsibility'],
      reporting: ['report', 'notify', 'inform', 'disclose', 'statement'],
      notice: ['notice', 'notification', 'advise', 'communicate'],
      termination: ['terminate', 'termination', 'cancel', 'cancellation', 'end'],
      renewal: ['renew', 'renewal', 'extend', 'extension'],
      compliance: ['comply', 'compliance', 'regulation', 'law', 'requirement'],
      milestone: ['milestone', 'deadline', 'due date', 'completion date']
    }

    const detectedObligations: any[] = []

    for (const extraction of extractions.results || []) {
      const fieldValue = (extraction.field_value || '').toLowerCase()
      const fieldName = (extraction.field_name || '').toLowerCase()
      const verbatimClause = extraction.verbatim_clause || ''

      // Check for obligation keywords
      for (const [obligationType, keywords] of Object.entries(obligationKeywords)) {
        const hasKeyword = keywords.some(keyword => 
          fieldValue.includes(keyword) || fieldName.includes(keyword)
        )

        if (hasKeyword) {
          // Try to extract due date from field value
          const dueDateMatch = fieldValue.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})|(\d{1,3}\s*days?)|(\d{1,3}\s*months?)/)
          let dueDate = null

          if (dueDateMatch) {
            // Calculate due date
            if (dueDateMatch[0].includes('day')) {
              const days = parseInt(dueDateMatch[0])
              const date = new Date()
              date.setDate(date.getDate() + days)
              dueDate = date.toISOString().split('T')[0]
            } else if (dueDateMatch[0].includes('month')) {
              const months = parseInt(dueDateMatch[0])
              const date = new Date()
              date.setMonth(date.getMonth() + months)
              dueDate = date.toISOString().split('T')[0]
            }
          }

          // Determine category
          const category = obligationType === 'payment' ? 'financial' :
                         obligationType === 'compliance' ? 'legal' :
                         obligationType === 'reporting' ? 'administrative' :
                         obligationType === 'delivery' ? 'deliverable' : 'operational'

          // Determine priority based on keywords
          let priority = 'medium'
          if (fieldValue.includes('critical') || fieldValue.includes('immediately') || fieldValue.includes('urgent')) {
            priority = 'critical'
          } else if (fieldValue.includes('important') || fieldValue.includes('essential')) {
            priority = 'high'
          }

          detectedObligations.push({
            obligation_title: extraction.field_name,
            obligation_description: extraction.field_value.substring(0, 500),
            obligation_type: obligationType,
            obligation_category: category,
            due_date: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 30 days
            priority: priority,
            source_clause: verbatimClause,
            extraction_id: extraction.id,
            confidence_score: extraction.confidence_score
          })
        }
      }
    }

    // Remove duplicates based on title similarity
    const uniqueObligations = detectedObligations.filter((obl, index, self) =>
      index === self.findIndex(t => t.obligation_title === obl.obligation_title)
    )

    // Create obligations with high confidence (>0.7)
    const createdObligations = []
    for (const obl of uniqueObligations) {
      if (obl.confidence_score >= 0.7) {
        const result = await this.createObligation({
          contract_id: contractId,
          matter_id: contract.matter_id,
          obligation_title: obl.obligation_title,
          obligation_description: obl.obligation_description,
          obligation_type: obl.obligation_type,
          obligation_category: obl.obligation_category,
          obligated_party: contract.primary_party || 'To be determined',
          beneficiary_party: contract.counterparty,
          due_date: obl.due_date,
          priority: obl.priority,
          source_clause: obl.source_clause,
          notes: `Auto-extracted from contract with ${Math.round(obl.confidence_score * 100)}% confidence`,
          created_by: userId
        })
        createdObligations.push(result)
      }
    }

    return {
      detected_count: uniqueObligations.length,
      created_count: createdObligations.length,
      obligations: createdObligations
    }
  }

  /**
   * Get obligation analytics for dashboard
   */
  async getObligationAnalytics(matterId?: string) {
    let whereClause = '1=1'
    const params: any[] = []

    if (matterId) {
      whereClause = 'matter_id = ?'
      params.push(matterId)
    }

    // Status distribution
    const statusStmt = this.db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM transactional_contract_obligations
      WHERE ${whereClause}
      GROUP BY status
    `)
    const statusData = await statusStmt.bind(...params).all()

    // Priority distribution
    const priorityStmt = this.db.prepare(`
      SELECT 
        priority,
        COUNT(*) as count
      FROM transactional_contract_obligations
      WHERE ${whereClause}
      GROUP BY priority
    `)
    const priorityData = await priorityStmt.bind(...params).all()

    // Type distribution
    const typeStmt = this.db.prepare(`
      SELECT 
        obligation_type,
        COUNT(*) as count
      FROM transactional_contract_obligations
      WHERE ${whereClause}
      GROUP BY obligation_type
      ORDER BY count DESC
      LIMIT 10
    `)
    const typeData = await typeStmt.bind(...params).all()

    // Timeline data (obligations by due date)
    const timelineStmt = this.db.prepare(`
      SELECT 
        DATE(due_date) as date,
        COUNT(*) as count,
        status
      FROM transactional_contract_obligations
      WHERE ${whereClause}
        AND due_date >= DATE('now')
        AND due_date <= DATE('now', '+90 days')
      GROUP BY DATE(due_date), status
      ORDER BY due_date ASC
    `)
    const timelineData = await timelineStmt.bind(...params).all()

    // Completion trend (last 30 days)
    const completionStmt = this.db.prepare(`
      SELECT 
        DATE(completed_at) as date,
        COUNT(*) as count
      FROM transactional_contract_obligations
      WHERE ${whereClause}
        AND status = 'completed'
        AND completed_at >= DATE('now', '-30 days')
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `)
    const completionData = await completionStmt.bind(...params).all()

    return {
      status_distribution: statusData.results || [],
      priority_distribution: priorityData.results || [],
      type_distribution: typeData.results || [],
      timeline_data: timelineData.results || [],
      completion_trend: completionData.results || []
    }
  }
}
