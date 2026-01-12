// LexiCore™ Unified Clause Service
// © 2024 LexiCore. Centralized clause management using clause_library as primary source.
// Replaces: clause-template.ts (deprecated)

import type { D1Database } from '@cloudflare/workers-types'

/**
 * Unified Clause Interface (based on clause_library schema)
 */
export interface Clause {
  id: string
  clause_title: string
  standard_text: string
  category: string
  subcategory?: string
  contract_type: string
  practice_area: string
  industry?: string
  jurisdiction?: string
  jurisdiction_type?: string
  governing_law?: string
  stance?: string
  risk_level?: string
  negotiability?: string
  is_active: number
  is_vetted: number
  vetting_source?: string
  usage_count: number
  success_rate?: number
  last_used_date?: string
  created_by: string
  created_at: string
  updated_at?: string
}

/**
 * Legacy interface for backward compatibility
 */
export interface LegacyClauseTemplate {
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
  last_used_at?: string
  created_by: string
  created_at: string
}

/**
 * Unified Clause Service - Primary interface for all clause operations
 */
export class ClauseService {
  constructor(private db: D1Database) {}

  /**
   * Get clauses with flexible filtering
   */
  async getClauses(filters?: {
    category?: string
    contract_type?: string
    practice_area?: string
    risk_level?: string
    jurisdiction?: string
    is_active?: boolean
    is_vetted?: boolean
    limit?: number
    offset?: number
  }): Promise<Clause[]> {
    let query = `
      SELECT 
        id, clause_title, standard_text, category, subcategory,
        contract_type, practice_area, industry, jurisdiction,
        jurisdiction_type, governing_law, stance, risk_level,
        negotiability, is_active, is_vetted, vetting_source,
        usage_count, success_rate, last_used_date, created_by,
        created_at, updated_at
      FROM clause_library 
      WHERE 1=1
    `
    const params: any[] = []

    if (filters?.category) {
      query += ' AND category = ?'
      params.push(filters.category)
    }

    if (filters?.contract_type) {
      query += ' AND contract_type = ?'
      params.push(filters.contract_type)
    }

    if (filters?.practice_area) {
      query += ' AND practice_area = ?'
      params.push(filters.practice_area)
    }

    if (filters?.risk_level) {
      query += ' AND risk_level = ?'
      params.push(filters.risk_level)
    }

    if (filters?.jurisdiction) {
      query += ' AND jurisdiction = ?'
      params.push(filters.jurisdiction)
    }

    if (filters?.is_active !== undefined) {
      query += ' AND is_active = ?'
      params.push(filters.is_active ? 1 : 0)
    }

    if (filters?.is_vetted !== undefined) {
      query += ' AND is_vetted = ?'
      params.push(filters.is_vetted ? 1 : 0)
    }

    query += ' ORDER BY category, clause_title'

    if (filters?.limit) {
      query += ' LIMIT ?'
      params.push(filters.limit)
    }

    if (filters?.offset) {
      query += ' OFFSET ?'
      params.push(filters.offset)
    }

    const result = await this.db.prepare(query).bind(...params).all()
    return result.results as Clause[]
  }

  /**
   * Get a single clause by ID
   */
  async getClauseById(clauseId: string): Promise<Clause | null> {
    const result = await this.db.prepare(`
      SELECT 
        id, clause_title, standard_text, category, subcategory,
        contract_type, practice_area, industry, jurisdiction,
        jurisdiction_type, governing_law, stance, risk_level,
        negotiability, is_active, is_vetted, vetting_source,
        usage_count, success_rate, last_used_date, created_by,
        created_at, updated_at
      FROM clause_library 
      WHERE id = ?
    `).bind(clauseId).first()

    return result as Clause | null
  }

  /**
   * Search clauses by keyword
   */
  async searchClauses(
    keyword: string, 
    filters?: {
      contract_type?: string
      category?: string
      limit?: number
    }
  ): Promise<Clause[]> {
    let query = `
      SELECT 
        id, clause_title, standard_text, category, subcategory,
        contract_type, practice_area, risk_level, is_vetted,
        usage_count, created_at
      FROM clause_library 
      WHERE is_active = 1
      AND (
        clause_title LIKE ? OR 
        standard_text LIKE ? OR 
        category LIKE ?
      )
    `
    const params: any[] = [
      `%${keyword}%`, 
      `%${keyword}%`, 
      `%${keyword}%`
    ]

    if (filters?.contract_type) {
      query += ' AND contract_type = ?'
      params.push(filters.contract_type)
    }

    if (filters?.category) {
      query += ' AND category = ?'
      params.push(filters.category)
    }

    query += ' ORDER BY usage_count DESC, clause_title'

    if (filters?.limit) {
      query += ' LIMIT ?'
      params.push(filters.limit)
    }

    const result = await this.db.prepare(query).bind(...params).all()
    return result.results as Clause[]
  }

  /**
   * Get recommended clauses for a contract type
   */
  async getRecommendations(
    contractType: string, 
    limit: number = 20
  ): Promise<Clause[]> {
    const result = await this.db.prepare(`
      SELECT 
        id, clause_title, standard_text, category, contract_type,
        practice_area, risk_level, is_vetted, usage_count
      FROM clause_library 
      WHERE is_active = 1 
      AND is_vetted = 1
      AND contract_type = ?
      ORDER BY usage_count DESC, clause_title
      LIMIT ?
    `).bind(contractType, limit).all()

    return result.results as Clause[]
  }

  /**
   * Get clause categories with counts
   */
  async getCategories(contractType?: string): Promise<Array<{
    category: string
    count: number
    approved_count: number
  }>> {
    let query = `
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN is_vetted = 1 THEN 1 ELSE 0 END) as approved_count
      FROM clause_library 
      WHERE is_active = 1
    `
    const params: any[] = []

    if (contractType) {
      query += ' AND contract_type = ?'
      params.push(contractType)
    }

    query += ' GROUP BY category ORDER BY count DESC'

    const result = await this.db.prepare(query).bind(...params).all()
    return result.results as any[]
  }

  /**
   * Increment clause usage count
   */
  async incrementUsage(clauseId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE clause_library
      SET usage_count = usage_count + 1,
          last_used_date = datetime('now')
      WHERE id = ?
    `).bind(clauseId).run()
  }

  /**
   * Bulk increment usage for multiple clauses
   */
  async bulkIncrementUsage(clauseIds: string[]): Promise<void> {
    if (clauseIds.length === 0) return

    const placeholders = clauseIds.map(() => '?').join(',')
    await this.db.prepare(`
      UPDATE clause_library
      SET usage_count = usage_count + 1,
          last_used_date = datetime('now')
      WHERE id IN (${placeholders})
    `).bind(...clauseIds).run()
  }

  /**
   * Get clause statistics
   */
  async getStats(): Promise<{
    total_clauses: number
    active_clauses: number
    vetted_clauses: number
    total_usage: number
    category_count: number
    contract_types: number
  }> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_clauses,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_clauses,
        SUM(CASE WHEN is_vetted = 1 THEN 1 ELSE 0 END) as vetted_clauses,
        SUM(usage_count) as total_usage,
        COUNT(DISTINCT category) as category_count,
        COUNT(DISTINCT contract_type) as contract_types
      FROM clause_library
    `).first()

    return stats as any
  }

  /**
   * Convert to legacy format for backward compatibility
   */
  toLegacyFormat(clause: Clause): LegacyClauseTemplate {
    return {
      id: clause.id,
      clause_name: clause.clause_title,
      clause_category: clause.category,
      contract_type: clause.contract_type,
      standard_language: clause.standard_text,
      alternative_language: undefined,
      description: clause.subcategory,
      usage_notes: undefined,
      risk_level: clause.risk_level,
      favorable_to: clause.stance,
      is_active: clause.is_active,
      is_approved: clause.is_vetted,
      use_count: clause.usage_count,
      last_used_at: clause.last_used_date,
      created_by: clause.created_by,
      created_at: clause.created_at
    }
  }

  /**
   * Get clauses in legacy format (for backward compatibility)
   */
  async getClausesLegacy(filters?: {
    category?: string
    contract_type?: string
    risk_level?: string
    is_active?: boolean
  }): Promise<LegacyClauseTemplate[]> {
    const clauses = await this.getClauses(filters)
    return clauses.map(c => this.toLegacyFormat(c))
  }
}

/**
 * Legacy service export for backward compatibility
 * @deprecated Use ClauseService instead
 */
export class ClauseTemplateService extends ClauseService {
  async getTemplates(filters?: any): Promise<any[]> {
    return this.getClausesLegacy(filters)
  }

  async getTemplateById(templateId: string): Promise<any> {
    const clause = await this.getClauseById(templateId)
    return clause ? this.toLegacyFormat(clause) : null
  }

  async incrementUseCount(templateId: string): Promise<void> {
    return this.incrementUsage(templateId)
  }
}
