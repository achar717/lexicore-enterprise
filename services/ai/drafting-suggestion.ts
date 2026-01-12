/**
 * LexiCore™ - Drafting Suggestion Service
 * 
 * PURPOSE:
 * Provide real-time, context-aware clause suggestions during document drafting.
 * Analyzes document context to recommend:
 * - Next logical clauses (based on document flow)
 * - Missing critical clauses (gap detection)
 * - Alternative clauses (improved options)
 * - Clause improvements (better versions)
 * 
 * CONTEXT ANALYSIS:
 * - Document type and industry
 * - Existing clauses in draft
 * - Clause sequence and order
 * - Document completeness stage
 * - Jurisdiction requirements
 * 
 * LEGAL COMPLIANCE:
 * Advisory tool only. NOT legal advice. Attorney review required.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface DraftingSuggestionRequest {
  draftId: string
  documentType: string
  industry: string
  jurisdiction: string
  practiceArea?: string
  existingClauses: string[] // Clause IDs already in draft
  currentPosition?: string // "after_CLAUSE_ID"
  documentStage?: 'early' | 'mid' | 'late' | 'final'
}

export interface ClauseSuggestion {
  suggestion_id: string
  suggested_clause_id: string
  clause_title: string
  category: string
  suggestion_type: 'next_clause' | 'missing_clause' | 'alternative' | 'improvement'
  
  // Scoring
  relevance_score: number
  confidence_level: 'low' | 'medium' | 'high' | 'very_high'
  
  // Positioning
  position_after_clause_id?: string
  position_description?: string
  
  // Reasoning
  reason: string
  context_factors: {
    document_flow?: boolean
    commonly_follows?: string
    usage_frequency?: number
    legal_requirement?: boolean
    industry_standard?: boolean
    gap_severity?: 'optional' | 'recommended' | 'important' | 'critical'
  }
  
  // Preview
  clause_preview: string
  estimated_time_minutes?: number
}

export class DraftingSuggestionService {
  constructor(private db: D1Database) {}

  /**
   * Generate suggestions for current drafting context
   */
  async generateSuggestions(
    request: DraftingSuggestionRequest,
    limit: number = 10
  ): Promise<ClauseSuggestion[]> {
    const suggestions: ClauseSuggestion[] = []
    
    // 1. Next clause suggestions (based on sequence)
    const nextClauses = await this.suggestNextClauses(request, 3)
    suggestions.push(...nextClauses)
    
    // 2. Missing clause detection (gap analysis)
    const missingClauses = await this.detectMissingClauses(request, 3)
    suggestions.push(...missingClauses)
    
    // 3. Alternative clauses (better options for existing)
    if (request.existingClauses.length > 0) {
      const alternatives = await this.suggestAlternatives(request, 2)
      suggestions.push(...alternatives)
    }
    
    // Sort by relevance and confidence
    const sorted = suggestions
      .sort((a, b) => {
        // First by relevance score
        if (b.relevance_score !== a.relevance_score) {
          return b.relevance_score - a.relevance_score
        }
        // Then by confidence level
        const confidenceLevels = { very_high: 4, high: 3, medium: 2, low: 1 }
        return confidenceLevels[b.confidence_level] - confidenceLevels[a.confidence_level]
      })
      .slice(0, limit)
    
    return sorted
  }

  /**
   * Suggest next logical clauses based on document flow
   */
  private async suggestNextClauses(
    request: DraftingSuggestionRequest,
    limit: number
  ): Promise<ClauseSuggestion[]> {
    const { documentType, industry, jurisdiction, existingClauses } = request
    
    // Find clauses that commonly follow existing clauses
    let query = `
      SELECT DISTINCT
        cl.id,
        cl.clause_title,
        cl.category,
        cl.standard_text,
        cl.usage_count,
        cup.times_used_together,
        cup.correlation_strength
      FROM clause_library cl
      LEFT JOIN clause_usage_patterns cup ON (
        cl.id = cup.clause_id_2
      )
      WHERE cl.is_active = 1
    `
    
    const params: any[] = []
    
    // Match document context
    query += ` AND (
      cl.jurisdiction = ? OR cl.jurisdiction IN ('Federal', 'Multi-State')
    )`
    params.push(jurisdiction)
    
    // Exclude already selected clauses
    if (existingClauses.length > 0) {
      const placeholders = existingClauses.map(() => '?').join(',')
      query += ` AND cl.id NOT IN (${placeholders})`
      params.push(...existingClauses)
      
      // Find clauses that follow any existing clause
      const existingPlaceholders = existingClauses.map(() => '?').join(',')
      query += ` AND cup.clause_id_1 IN (${existingPlaceholders})`
      params.push(...existingClauses)
    }
    
    // Order by correlation and usage
    query += ` ORDER BY 
      cup.correlation_strength DESC,
      cup.times_used_together DESC,
      cl.usage_count DESC
      LIMIT ?`
    params.push(limit)
    
    const result = await this.db.prepare(query).bind(...params).all()
    const clauses = result.results || []
    
    return clauses.map((clause: any, index: number) => {
      const relevanceScore = this.calculateNextClauseRelevance(clause, request)
      const confidenceLevel = this.determineConfidence(relevanceScore, {
        hasCorrelation: !!clause.correlation_strength,
        usageCount: clause.usage_count || 0,
        existingClausesCount: existingClauses.length
      })
      
      return {
        suggestion_id: `sug-next-${clause.id}-${Date.now()}-${index}`,
        suggested_clause_id: clause.id,
        clause_title: clause.clause_title,
        category: clause.category,
        suggestion_type: 'next_clause',
        relevance_score: relevanceScore,
        confidence_level: confidenceLevel,
        position_after_clause_id: existingClauses[existingClauses.length - 1],
        position_description: 'After current clause',
        reason: this.generateNextClauseReason(clause, request),
        context_factors: {
          document_flow: true,
          commonly_follows: existingClauses[existingClauses.length - 1],
          usage_frequency: clause.correlation_strength || 0,
          industry_standard: clause.usage_count > 50
        },
        clause_preview: this.truncateText(clause.standard_text, 200)
      } as ClauseSuggestion
    })
  }

  /**
   * Detect missing clauses (gap analysis)
   */
  private async detectMissingClauses(
    request: DraftingSuggestionRequest,
    limit: number
  ): Promise<ClauseSuggestion[]> {
    const { documentType, jurisdiction, existingClauses } = request
    
    // Get standard clauses for this document type
    const standardClauses = await this.getStandardClausesForDocumentType(
      documentType,
      jurisdiction
    )
    
    // Find missing critical clauses
    const missing = standardClauses.filter(
      (clause: any) => !existingClauses.includes(clause.id)
    )
    
    // Sort by importance/criticality
    const sorted = missing
      .sort((a: any, b: any) => {
        // Sort by category importance and usage
        return (b.usage_count || 0) - (a.usage_count || 0)
      })
      .slice(0, limit)
    
    return sorted.map((clause: any, index: number) => {
      const gapSeverity = this.assessGapSeverity(clause, documentType, request)
      const relevanceScore = this.calculateMissingClauseRelevance(clause, gapSeverity)
      const confidenceLevel = this.determineConfidence(relevanceScore, {
        hasCorrelation: false,
        usageCount: clause.usage_count || 0,
        existingClausesCount: existingClauses.length
      })
      
      return {
        suggestion_id: `sug-missing-${clause.id}-${Date.now()}-${index}`,
        suggested_clause_id: clause.id,
        clause_title: clause.clause_title,
        category: clause.category,
        suggestion_type: 'missing_clause',
        relevance_score: relevanceScore,
        confidence_level: confidenceLevel,
        reason: this.generateMissingClauseReason(clause, gapSeverity, documentType),
        context_factors: {
          legal_requirement: gapSeverity === 'critical',
          industry_standard: clause.usage_count > 100,
          gap_severity: gapSeverity
        },
        clause_preview: this.truncateText(clause.standard_text, 200)
      } as ClauseSuggestion
    })
  }

  /**
   * Suggest alternative clauses for existing ones
   */
  private async suggestAlternatives(
    request: DraftingSuggestionRequest,
    limit: number
  ): Promise<ClauseSuggestion[]> {
    const alternatives: ClauseSuggestion[] = []
    
    // For now, return empty - can be enhanced to find better versions of existing clauses
    return alternatives
  }

  /**
   * Get standard clauses for a document type
   */
  private async getStandardClausesForDocumentType(
    documentType: string,
    jurisdiction: string
  ): Promise<any[]> {
    // Map document types to required categories
    const requiredCategories: Record<string, string[]> = {
      'NDA': ['Confidentiality', 'Term', 'Return of Information', 'Governing Law', 'Remedies'],
      'Employment Agreement': ['Term', 'Compensation', 'Benefits', 'Termination', 'Confidentiality', 'IP Assignment'],
      'Service Agreement': ['Scope of Services', 'Payment', 'Term', 'Termination', 'Liability', 'Indemnification'],
      'Purchase Agreement': ['Purchase Price', 'Payment Terms', 'Delivery', 'Warranties', 'Risk of Loss']
    }
    
    const categories = requiredCategories[documentType] || []
    if (categories.length === 0) return []
    
    const placeholders = categories.map(() => '?').join(',')
    const query = `
      SELECT 
        id,
        clause_title,
        category,
        standard_text,
        usage_count,
        jurisdiction
      FROM clause_library
      WHERE is_active = 1
        AND category IN (${placeholders})
        AND (jurisdiction = ? OR jurisdiction IN ('Federal', 'Multi-State'))
      ORDER BY usage_count DESC
    `
    
    const result = await this.db.prepare(query)
      .bind(...categories, jurisdiction)
      .all()
    
    return result.results || []
  }

  /**
   * Calculate relevance score for next clause suggestion
   */
  private calculateNextClauseRelevance(clause: any, request: DraftingSuggestionRequest): number {
    let score = 0.5 // Base score
    
    // Correlation strength (0-1)
    if (clause.correlation_strength) {
      score += clause.correlation_strength * 0.3
    }
    
    // Usage frequency
    const usageScore = Math.min((clause.times_used_together || 0) / 50, 1.0)
    score += usageScore * 0.2
    
    // General usage count
    const popularityScore = Math.min((clause.usage_count || 0) / 100, 1.0)
    score += popularityScore * 0.1
    
    // Document stage bonus
    if (request.documentStage === 'early' && request.existingClauses.length < 3) {
      score += 0.1 // Boost early clauses
    }
    
    return Math.min(Math.round(score * 100) / 100, 1.0)
  }

  /**
   * Calculate relevance for missing clause
   */
  private calculateMissingClauseRelevance(clause: any, severity: string): number {
    const severityScores = {
      critical: 0.95,
      important: 0.85,
      recommended: 0.70,
      optional: 0.50
    }
    
    return severityScores[severity as keyof typeof severityScores] || 0.60
  }

  /**
   * Assess gap severity for missing clause
   */
  private assessGapSeverity(
    clause: any,
    documentType: string,
    request: DraftingSuggestionRequest
  ): 'optional' | 'recommended' | 'important' | 'critical' {
    const category = clause.category?.toLowerCase() || ''
    
    // Critical categories for all documents
    const criticalCategories = ['governing law', 'jurisdiction', 'signatures']
    if (criticalCategories.some(c => category.includes(c))) {
      return 'critical'
    }
    
    // Important categories
    const importantCategories = ['term', 'termination', 'payment', 'confidentiality']
    if (importantCategories.some(c => category.includes(c))) {
      return 'important'
    }
    
    // Recommended if high usage
    if (clause.usage_count > 100) {
      return 'recommended'
    }
    
    return 'optional'
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(
    score: number,
    factors: { hasCorrelation: boolean; usageCount: number; existingClausesCount: number }
  ): 'low' | 'medium' | 'high' | 'very_high' {
    if (score >= 0.9 && factors.hasCorrelation && factors.usageCount > 50) {
      return 'very_high'
    }
    if (score >= 0.75 && (factors.hasCorrelation || factors.usageCount > 30)) {
      return 'high'
    }
    if (score >= 0.60) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * Generate reason for next clause suggestion
   */
  private generateNextClauseReason(clause: any, request: DraftingSuggestionRequest): string {
    const reasons: string[] = []
    
    if (clause.correlation_strength > 0.7) {
      reasons.push('Commonly follows current clause')
    }
    
    if (clause.times_used_together > 20) {
      reasons.push('Frequently paired together')
    }
    
    if (clause.usage_count > 100) {
      reasons.push('Industry standard clause')
    }
    
    if (request.documentStage === 'early') {
      reasons.push('Recommended for early draft stage')
    }
    
    return reasons.length > 0
      ? reasons.join(' • ')
      : 'Logical next step in document flow'
  }

  /**
   * Generate reason for missing clause
   */
  private generateMissingClauseReason(
    clause: any,
    severity: string,
    documentType: string
  ): string {
    const severityMessages = {
      critical: `Critical for ${documentType} - legally required`,
      important: `Highly recommended for ${documentType}`,
      recommended: `Standard inclusion in ${documentType}`,
      optional: `Consider adding for completeness`
    }
    
    return severityMessages[severity as keyof typeof severityMessages] || 
      `Missing standard clause for ${documentType}`
  }

  /**
   * Truncate text for preview
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * Track suggestion for learning
   */
  async trackSuggestion(
    userId: string,
    draftId: string,
    suggestion: ClauseSuggestion
  ): Promise<string> {
    const suggestionId = `suggestion-${userId}-${draftId}-${Date.now()}`
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT INTO drafting_suggestions (
        id, draft_id, user_id, suggested_clause_id, suggestion_type,
        position_after_clause_id, relevance_score, confidence_level,
        context_factors_json, reason, suggested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      suggestionId,
      draftId,
      userId,
      suggestion.suggested_clause_id,
      suggestion.suggestion_type,
      suggestion.position_after_clause_id || null,
      suggestion.relevance_score,
      suggestion.confidence_level,
      JSON.stringify(suggestion.context_factors),
      suggestion.reason,
      timestamp
    ).run()
    
    return suggestionId
  }

  /**
   * Record user action on suggestion
   */
  async recordAction(
    suggestionId: string,
    action: 'accepted' | 'rejected' | 'modified' | 'ignored',
    notes?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      UPDATE drafting_suggestions
      SET 
        user_action = ?,
        modification_notes = ?,
        actioned_at = ?
      WHERE id = ?
    `).bind(action, notes || null, timestamp, suggestionId).run()
  }
}
