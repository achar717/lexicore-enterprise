/**
 * LexiCore™ - Regulated Document Intelligence Platform
 * 
 * GOVERNANCE SERVICE
 * Handles prompt and model governance
 * 
 * LEGAL COMPLIANCE:
 * - Only approved prompts for production use
 * - Complete version history
 * - Usage tracking and analytics
 * - Legal limitations enforcement
 * - Attorney-only approval authority
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface Prompt {
  id: string
  title: string
  description: string
  prompt_text: string
  category: string
  version: number
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived'
  legal_limitations: string
  created_by: string
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
}

export interface PromptVersion {
  id: string
  prompt_id: string
  version: number
  prompt_text: string
  changes_summary: string
  created_by: string
  created_at: string
}

export interface PromptUsage {
  prompt_id: string
  usage_count: number
  success_count: number
  failure_count: number
  avg_confidence: number
  last_used: string
}

export class GovernanceService {
  constructor(private db: D1Database) {}

  /**
   * Create new prompt
   */
  async createPrompt(
    title: string,
    description: string,
    promptText: string,
    category: string,
    legalLimitations: string,
    createdBy: string
  ): Promise<Prompt> {
    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const now = new Date().toISOString()

    await this.db.prepare(`
      INSERT INTO prompt_registry (
        id, prompt_name, prompt_purpose, prompt_text, prompt_version,
        status, legal_limitations, owner_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'v1', 'draft', ?, ?, ?, ?)
    `).bind(
      promptId,
      title,
      description,
      promptText,
      legalLimitations,
      createdBy,
      now,
      now
    ).run()

    // Create initial version
    await this.createPromptVersion(promptId, 1, promptText, 'Initial version', createdBy)

    const prompt = await this.db.prepare(`
      SELECT 
        id,
        prompt_name as title,
        prompt_purpose as description,
        prompt_text,
        prompt_version as version,
        status,
        legal_limitations,
        owner_id as created_by,
        approved_by,
        approved_at,
        created_at,
        updated_at
      FROM prompt_registry WHERE id = ?
    `).bind(promptId).first()

    return prompt as Prompt
  }

  /**
   * Update prompt (creates new version)
   */
  async updatePrompt(
    promptId: string,
    updates: {
      title?: string
      description?: string
      promptText?: string
      category?: string
      legalLimitations?: string
    },
    changesSummary: string,
    updatedBy: string
  ): Promise<Prompt> {
    const existing = await this.db.prepare(`
      SELECT 
        id,
        prompt_name as title,
        prompt_purpose as description,
        prompt_text,
        prompt_version,
        status,
        legal_limitations,
        owner_id as created_by
      FROM prompt_registry WHERE id = ?
    `).bind(promptId).first() as any

    if (!existing) {
      throw new Error('Prompt not found')
    }

    // Parse version number from version string (e.g., "v1" -> 1)
    const currentVersion = parseInt(existing.prompt_version.replace('v', '')) || 1
    const newVersionNum = updates.promptText && updates.promptText !== existing.prompt_text
      ? currentVersion + 1
      : currentVersion

    // Update prompt
    const now = new Date().toISOString()
    await this.db.prepare(`
      UPDATE prompt_registry
      SET prompt_name = ?, prompt_purpose = ?, prompt_text = ?,
          legal_limitations = ?, prompt_version = ?, status = 'draft', updated_at = ?
      WHERE id = ?
    `).bind(
      updates.title || existing.title,
      updates.description || existing.description,
      updates.promptText || existing.prompt_text,
      updates.legalLimitations || existing.legal_limitations,
      `v${newVersionNum}`,
      now,
      promptId
    ).run()

    // Create new version if prompt text changed
    if (updates.promptText && updates.promptText !== existing.prompt_text) {
      await this.createPromptVersion(
        promptId,
        newVersionNum,
        updates.promptText,
        changesSummary,
        updatedBy
      )
    }

    const updated = await this.db.prepare(`
      SELECT 
        id,
        prompt_name as title,
        prompt_purpose as description,
        prompt_text,
        prompt_version as version,
        status,
        legal_limitations,
        owner_id as created_by,
        approved_by,
        approved_at,
        created_at,
        updated_at
      FROM prompt_registry WHERE id = ?
    `).bind(promptId).first()

    return updated as Prompt
  }

  /**
   * Submit prompt for approval
   */
  async submitForApproval(promptId: string, submittedBy: string): Promise<void> {
    const prompt = await this.db.prepare(`
      SELECT * FROM prompt_registry WHERE id = ?
    `).bind(promptId).first()

    if (!prompt) {
      throw new Error('Prompt not found')
    }

    if ((prompt as Prompt).status !== 'draft') {
      throw new Error('Only draft prompts can be submitted for approval')
    }

    await this.db.prepare(`
      UPDATE prompt_registry
      SET status = 'pending', updated_at = datetime('now')
      WHERE id = ?
    `).bind(promptId).run()

    // Log audit event
    await this.logGovernanceEvent(
      'prompt.submitted',
      submittedBy,
      'prompt',
      promptId,
      { action: 'submitted_for_approval' }
    )
  }

  /**
   * Approve prompt (attorney only)
   */
  async approvePrompt(promptId: string, approvedBy: string, notes?: string): Promise<void> {
    // Verify approver is attorney
    const approver = await this.db.prepare(`
      SELECT is_attorney FROM users WHERE id = ?
    `).bind(approvedBy).first()

    if (!approver || !approver.is_attorney) {
      throw new Error('Only licensed attorneys may approve prompts')
    }

    const now = new Date().toISOString()
    await this.db.prepare(`
      UPDATE prompt_registry
      SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(approvedBy, now, now, promptId).run()

    // Log audit event
    await this.logGovernanceEvent(
      'prompt.approved',
      approvedBy,
      'prompt',
      promptId,
      { notes }
    )
  }

  /**
   * Reject prompt
   */
  async rejectPrompt(promptId: string, rejectedBy: string, reason: string): Promise<void> {
    await this.db.prepare(`
      UPDATE prompt_registry
      SET status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).bind(promptId).run()

    // Log audit event
    await this.logGovernanceEvent(
      'prompt.rejected',
      rejectedBy,
      'prompt',
      promptId,
      { reason }
    )
  }

  /**
   * Archive prompt
   */
  async archivePrompt(promptId: string, archivedBy: string): Promise<void> {
    await this.db.prepare(`
      UPDATE prompt_registry
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ?
    `).bind(promptId).run()

    // Log audit event
    await this.logGovernanceEvent(
      'prompt.archived',
      archivedBy,
      'prompt',
      promptId,
      { action: 'archived' }
    )
  }

  /**
   * Get all prompts with filtering
   */
  async getPrompts(filters?: {
    status?: string
    category?: string
    searchTerm?: string
  }): Promise<Prompt[]> {
    let query = `
      SELECT 
        p.id,
        p.prompt_name as title,
        p.prompt_purpose as description,
        p.prompt_text,
        p.prompt_version as version,
        p.status,
        p.legal_limitations,
        p.owner_id as created_by,
        p.approved_by,
        p.approved_at,
        p.created_at,
        p.updated_at,
        u1.first_name as created_by_first,
        u1.last_name as created_by_last,
        u2.first_name as approved_by_first,
        u2.last_name as approved_by_last
      FROM prompt_registry p
      LEFT JOIN users u1 ON p.owner_id = u1.id
      LEFT JOIN users u2 ON p.approved_by = u2.id
      WHERE 1=1
    `
    const params: any[] = []

    if (filters?.status) {
      query += ` AND p.status = ?`
      params.push(filters.status)
    }

    if (filters?.searchTerm) {
      query += ` AND (p.prompt_name LIKE ? OR p.prompt_purpose LIKE ?)`
      params.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`)
    }

    query += ` ORDER BY p.created_at DESC`

    const { results } = await this.db.prepare(query).bind(...params).all()

    return results.map((p: any) => ({
      ...p,
      created_by_name: p.created_by_first ? `${p.created_by_first} ${p.created_by_last}` : null,
      approved_by_name: p.approved_by_first ? `${p.approved_by_first} ${p.approved_by_last}` : null
    })) as Prompt[]
  }

  /**
   * Get prompt by ID
   */
  async getPrompt(promptId: string): Promise<Prompt | null> {
    const prompt = await this.db.prepare(`
      SELECT 
        p.id,
        p.prompt_name as title,
        p.prompt_purpose as description,
        p.prompt_text,
        p.prompt_version as version,
        p.status,
        p.legal_limitations,
        p.owner_id as created_by,
        p.approved_by,
        p.approved_at,
        p.created_at,
        p.updated_at,
        u1.first_name as created_by_first,
        u1.last_name as created_by_last,
        u2.first_name as approved_by_first,
        u2.last_name as approved_by_last
      FROM prompt_registry p
      LEFT JOIN users u1 ON p.owner_id = u1.id
      LEFT JOIN users u2 ON p.approved_by = u2.id
      WHERE p.id = ?
    `).bind(promptId).first()

    if (!prompt) return null

    return {
      ...prompt,
      created_by_name: (prompt as any).created_by_first 
        ? `${(prompt as any).created_by_first} ${(prompt as any).created_by_last}` 
        : null,
      approved_by_name: (prompt as any).approved_by_first 
        ? `${(prompt as any).approved_by_first} ${(prompt as any).approved_by_last}` 
        : null
    } as Prompt
  }

  /**
   * Get prompt version history
   */
  async getPromptVersions(promptId: string): Promise<PromptVersion[]> {
    const { results } = await this.db.prepare(`
      SELECT 
        pv.*,
        u.first_name,
        u.last_name
      FROM prompt_versions pv
      LEFT JOIN users u ON pv.created_by = u.id
      WHERE pv.prompt_id = ?
      ORDER BY pv.version DESC
    `).bind(promptId).all()

    return results.map((v: any) => ({
      ...v,
      created_by_name: v.first_name ? `${v.first_name} ${v.last_name}` : null
    })) as PromptVersion[]
  }

  /**
   * Get prompt usage analytics
   */
  async getPromptUsage(promptId?: string): Promise<PromptUsage[]> {
    let query = `
      SELECT 
        e.prompt_id,
        COUNT(*) as usage_count,
        COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as success_count,
        COUNT(CASE WHEN e.status = 'failed' THEN 1 END) as failure_count,
        AVG(e.confidence_score) as avg_confidence,
        MAX(e.created_at) as last_used
      FROM extractions e
      WHERE e.prompt_id IS NOT NULL
    `

    if (promptId) {
      query += ` AND e.prompt_id = ?`
    }

    query += ` GROUP BY e.prompt_id`

    const { results } = promptId 
      ? await this.db.prepare(query).bind(promptId).all()
      : await this.db.prepare(query).all()

    return results as PromptUsage[]
  }

  /**
   * Get governance statistics
   */
  async getGovernanceStats(): Promise<any> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_prompts,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_prompts,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_prompts,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_prompts,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_prompts,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_prompts,
        COUNT(DISTINCT owner_id) as contributors
      FROM prompt_registry
    `).first()

    // Get usage stats
    const usageStats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_extractions,
        COUNT(DISTINCT prompt_id) as prompts_used,
        AVG(confidence_score) as avg_confidence
      FROM extractions
      WHERE prompt_id IS NOT NULL
    `).first()

    return {
      ...stats,
      ...usageStats
    }
  }

  /**
   * Create prompt version
   */
  private async createPromptVersion(
    promptId: string,
    version: number,
    promptText: string,
    changesSummary: string,
    createdBy: string
  ): Promise<void> {
    const versionId = `ver-${Date.now()}-${Math.random().toString(36).substring(7)}`

    await this.db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version, prompt_text, changes_summary, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(versionId, promptId, version, promptText, changesSummary, createdBy).run()
  }

  /**
   * Log governance event
   */
  private async logGovernanceEvent(
    eventType: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    details: any
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO audit_log (
        id, event_type, event_category, user_id,
        event_data, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      eventType,
      resourceType,
      userId,
      JSON.stringify(details),
      'system',
      'internal'
    ).run()
  }
}
