// LexiCore™ Clause Template Service
// © 2024 LexiCore. Manage standard clause templates for transactional contracts.

import type { D1Database } from '@cloudflare/workers-types'

export interface ClauseTemplate {
  id: string
  clause_name: string
  clause_category: string
  contract_type: string
  standard_language: string
  alternative_language?: string
  description?: string
  usage_notes?: string
  risk_level?: string
  favorable_to?: string
  is_active: number
  is_approved: number
  use_count: number
  created_by: string
  created_at: string
}

export interface ClauseComparison {
  id: string
  contract_id: string
  template_id: string
  extracted_text: string
  standard_text: string
  similarity_score?: number
  has_deviations: number
  deviation_notes?: string
  risk_flag: number
}

export class ClauseTemplateService {
  constructor(private db: D1Database) {}

  /**
   * Get all clause templates (optionally filtered)
   */
  async getTemplates(filters?: {
    category?: string
    contract_type?: string
    risk_level?: string
    is_active?: boolean
  }): Promise<ClauseTemplate[]> {
    let query = 'SELECT * FROM transactional_clause_templates WHERE 1=1'
    const params: any[] = []

    if (filters?.category) {
      query += ' AND clause_category = ?'
      params.push(filters.category)
    }

    if (filters?.contract_type) {
      query += ' AND contract_type = ?'
      params.push(filters.contract_type)
    }

    if (filters?.risk_level) {
      query += ' AND risk_level = ?'
      params.push(filters.risk_level)
    }

    if (filters?.is_active !== undefined) {
      query += ' AND is_active = ?'
      params.push(filters.is_active ? 1 : 0)
    }

    query += ' ORDER BY clause_category, clause_name'

    const result = await this.db.prepare(query).bind(...params).all()
    return result.results as ClauseTemplate[]
  }

  /**
   * Get a single clause template by ID
   */
  async getTemplateById(templateId: string): Promise<ClauseTemplate | null> {
    const result = await this.db.prepare(`
      SELECT * FROM transactional_clause_templates WHERE id = ?
    `).bind(templateId).first()

    return result as ClauseTemplate | null
  }

  /**
   * Create a new clause template
   */
  async createTemplate(template: Omit<ClauseTemplate, 'id' | 'created_at' | 'use_count'>): Promise<string> {
    const templateId = `tx-clause-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    await this.db.prepare(`
      INSERT INTO transactional_clause_templates (
        id, clause_name, clause_category, contract_type, standard_language,
        alternative_language, description, usage_notes, risk_level, favorable_to,
        is_active, is_approved, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      templateId,
      template.clause_name,
      template.clause_category,
      template.contract_type,
      template.standard_language,
      template.alternative_language || null,
      template.description || null,
      template.usage_notes || null,
      template.risk_level || null,
      template.favorable_to || null,
      template.is_active,
      template.is_approved,
      template.created_by
    ).run()

    return templateId
  }

  /**
   * Update a clause template
   */
  async updateTemplate(templateId: string, updates: Partial<ClauseTemplate>): Promise<void> {
    const setClauses: string[] = []
    const params: any[] = []

    if (updates.clause_name !== undefined) {
      setClauses.push('clause_name = ?')
      params.push(updates.clause_name)
    }
    if (updates.standard_language !== undefined) {
      setClauses.push('standard_language = ?')
      params.push(updates.standard_language)
    }
    if (updates.alternative_language !== undefined) {
      setClauses.push('alternative_language = ?')
      params.push(updates.alternative_language)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      params.push(updates.description)
    }
    if (updates.usage_notes !== undefined) {
      setClauses.push('usage_notes = ?')
      params.push(updates.usage_notes)
    }
    if (updates.risk_level !== undefined) {
      setClauses.push('risk_level = ?')
      params.push(updates.risk_level)
    }
    if (updates.is_active !== undefined) {
      setClauses.push('is_active = ?')
      params.push(updates.is_active)
    }
    if (updates.is_approved !== undefined) {
      setClauses.push('is_approved = ?')
      params.push(updates.is_approved)
    }

    if (setClauses.length === 0) return

    setClauses.push('updated_at = datetime(\'now\')')
    params.push(templateId)

    await this.db.prepare(`
      UPDATE transactional_clause_templates
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `).bind(...params).run()
  }

  /**
   * Delete a clause template (soft delete by setting is_active = 0)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE transactional_clause_templates
      SET is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).bind(templateId).run()
  }

  /**
   * Increment template use count
   */
  async incrementUseCount(templateId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE transactional_clause_templates
      SET use_count = use_count + 1,
          last_used_at = datetime('now')
      WHERE id = ?
    `).bind(templateId).run()
  }

  /**
   * Compare extracted clause with standard template
   */
  async compareWithTemplate(
    contractId: string,
    matterId: string,
    extractionId: string,
    templateId: string,
    extractedText: string
  ): Promise<string> {
    // Get template
    const template = await this.getTemplateById(templateId)
    if (!template) {
      throw new Error('Template not found')
    }

    // Calculate similarity (simple word overlap for now)
    const similarity = this.calculateSimilarity(extractedText, template.standard_language)

    // Determine if there are significant deviations
    const hasDeviations = similarity < 0.7 ? 1 : 0

    const comparisonId = `comparison-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    await this.db.prepare(`
      INSERT INTO transactional_clause_comparisons (
        id, contract_id, matter_id, extraction_id, template_id,
        extracted_text, standard_text, similarity_score,
        has_deviations, risk_flag, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      comparisonId,
      contractId,
      matterId,
      extractionId || null,
      templateId,
      extractedText,
      template.standard_language,
      similarity,
      hasDeviations,
      hasDeviations && template.risk_level === 'high' ? 1 : 0
    ).run()

    // Increment template use count
    await this.incrementUseCount(templateId)

    return comparisonId
  }

  /**
   * Calculate text similarity (simple implementation)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))

    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  /**
   * Get comparisons for a contract
   */
  async getContractComparisons(contractId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        cc.*,
        ct.clause_name,
        ct.clause_category,
        ct.risk_level
      FROM transactional_clause_comparisons cc
      LEFT JOIN transactional_clause_templates ct ON cc.template_id = ct.id
      WHERE cc.contract_id = ?
      ORDER BY cc.created_at DESC
    `).bind(contractId).all()

    return result.results || []
  }

  /**
   * Get clause categories
   */
  getCategoryList(): string[] {
    return [
      'party_information',
      'defined_terms',
      'term_and_termination',
      'governing_law',
      'payment_terms',
      'conditions_precedent',
      'notice_provisions',
      'assignment_change_of_control',
      'representations_warranties',
      'indemnification',
      'confidentiality',
      'intellectual_property',
      'dispute_resolution',
      'force_majeure',
      'miscellaneous'
    ]
  }

  /**
   * Get template statistics
   */
  async getTemplateStats(): Promise<any> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_templates,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_templates,
        SUM(CASE WHEN is_approved = 1 THEN 1 ELSE 0 END) as approved_templates,
        SUM(use_count) as total_uses,
        COUNT(DISTINCT clause_category) as category_count
      FROM transactional_clause_templates
    `).first()

    return stats
  }
}
