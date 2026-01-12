/**
 * LexiCore™ - Template Matching Service
 * 
 * PURPOSE:
 * Intelligent template recommendation using multi-factor relevance analysis.
 * Matches user requirements to document templates based on:
 * - Document type alignment
 * - Industry fit
 * - Jurisdiction compatibility
 * - Complexity level matching
 * - Historical success rates
 * - Clause library compatibility
 * 
 * ALGORITHM:
 * templateRelevance = 
 *   documentTypeMatch(0.30) +
 *   industryMatch(0.20) +
 *   jurisdictionMatch(0.15) +
 *   complexityMatch(0.10) +
 *   usageSuccess(0.15) +
 *   clauseCompatibility(0.10)
 * 
 * LEGAL COMPLIANCE:
 * This is an advisory tool only. Does NOT provide legal advice.
 * All recommendations must be reviewed by licensed attorneys.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface TemplateMatchRequest {
  documentType: string
  industry: string
  jurisdiction: string
  practiceArea?: string
  complexity?: 'simple' | 'moderate' | 'complex' | 'expert'
  additionalContext?: string
}

export interface TemplateMatch {
  template_id: string
  template_name: string
  document_type: string
  industry: string
  jurisdiction: string
  practice_area: string
  complexity_level: string
  
  // Relevance Scoring
  relevance_score: number
  match_factors: {
    document_type: number
    industry: number
    jurisdiction: number
    complexity: number
    usage_success: number
    clause_compatibility: number
  }
  
  // Metadata
  usage_count: number
  success_rate: number
  average_rating: number
  sections_json: string
  
  // User Guidance
  reason: string
  estimated_time_minutes?: number
  difficulty_level?: string
}

export class TemplateMatchingService {
  constructor(private db: D1Database) {}

  /**
   * Find matching templates for user requirements
   */
  async findMatches(
    request: TemplateMatchRequest,
    limit: number = 10
  ): Promise<TemplateMatch[]> {
    // Get candidate templates
    const candidates = await this.getCandidateTemplates(request, limit * 3)
    
    // Score each candidate
    const scored = await Promise.all(
      candidates.map(async (template) => {
        const matchFactors = await this.calculateMatchFactors(template, request)
        const relevanceScore = this.calculateRelevanceScore(matchFactors)
        const reason = this.generateMatchReason(template, matchFactors, request)
        
        return {
          ...template,
          relevance_score: relevanceScore,
          match_factors: matchFactors,
          reason
        } as TemplateMatch
      })
    )
    
    // Sort by relevance and return top matches
    return scored
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit)
  }

  /**
   * Get candidate templates from database
   */
  private async getCandidateTemplates(
    request: TemplateMatchRequest,
    limit: number
  ): Promise<any[]> {
    const { documentType, industry, jurisdiction, practiceArea } = request
    
    let query = `
      SELECT 
        id,
        template_name,
        document_type,
        industry,
        jurisdiction,
        practice_area,
        complexity_level,
        usage_count,
        average_rating,
        sections_json,
        is_customizable
      FROM document_templates
      WHERE is_active = 1
    `
    
    const params: any[] = []
    
    // Prioritize exact document type match, but allow related types
    if (documentType) {
      query += ` AND (
        document_type = ? 
        OR document_type LIKE ?
      )`
      params.push(documentType, `%${documentType}%`)
    }
    
    // Industry filter (exact or related)
    if (industry) {
      query += ` AND (
        industry = ? 
        OR industry = 'General'
      )`
      params.push(industry)
    }
    
    // Jurisdiction compatibility
    if (jurisdiction) {
      query += ` AND (
        jurisdiction = ?
        OR jurisdiction = 'Multi-State'
        OR jurisdiction = 'Federal'
      )`
      params.push(jurisdiction)
    }
    
    // Practice area filter (if specified)
    if (practiceArea) {
      query += ` AND practice_area = ?`
      params.push(practiceArea)
    }
    
    // Order by usage and rating as initial sort
    query += ` ORDER BY usage_count DESC, average_rating DESC`
    query += ` LIMIT ?`
    params.push(limit)
    
    const result = await this.db.prepare(query).bind(...params).all()
    return result.results || []
  }

  /**
   * Calculate match factors for a template
   */
  private async calculateMatchFactors(
    template: any,
    request: TemplateMatchRequest
  ): Promise<TemplateMatch['match_factors']> {
    return {
      document_type: this.scoreDocumentType(template.document_type, request.documentType),
      industry: this.scoreIndustry(template.industry, request.industry),
      jurisdiction: this.scoreJurisdiction(template.jurisdiction, request.jurisdiction),
      complexity: this.scoreComplexity(template.complexity_level, request.complexity),
      usage_success: this.scoreUsageSuccess(template.usage_count, template.average_rating),
      clause_compatibility: await this.scoreClauseCompatibility(template, request)
    }
  }

  /**
   * Score document type match
   */
  private scoreDocumentType(templateType: string, requestType: string): number {
    if (!templateType || !requestType) return 0.5
    
    const templateLower = templateType.toLowerCase()
    const requestLower = requestType.toLowerCase()
    
    // Exact match
    if (templateLower === requestLower) return 1.0
    
    // Partial match (one contains the other)
    if (templateLower.includes(requestLower) || requestLower.includes(templateLower)) {
      return 0.8
    }
    
    // Related document types
    const relatedTypes: Record<string, string[]> = {
      'nda': ['confidentiality', 'non-disclosure'],
      'employment': ['employment agreement', 'offer letter', 'employment contract'],
      'service': ['service agreement', 'consulting', 'professional services'],
      'purchase': ['purchase agreement', 'sales agreement', 'acquisition']
    }
    
    for (const [key, related] of Object.entries(relatedTypes)) {
      if (templateLower.includes(key) && related.some(r => requestLower.includes(r))) {
        return 0.7
      }
    }
    
    return 0.3
  }

  /**
   * Score industry match
   */
  private scoreIndustry(templateIndustry: string, requestIndustry: string): number {
    if (!templateIndustry || !requestIndustry) return 0.5
    
    const templateLower = templateIndustry.toLowerCase()
    const requestLower = requestIndustry.toLowerCase()
    
    // Exact match
    if (templateLower === requestLower) return 1.0
    
    // General/multi-industry templates
    if (templateLower === 'general' || templateLower === 'multi-industry') {
      return 0.6
    }
    
    // Partial match
    if (templateLower.includes(requestLower) || requestLower.includes(templateLower)) {
      return 0.8
    }
    
    // Related industries
    const relatedIndustries: Record<string, string[]> = {
      'technology': ['software', 'saas', 'it', 'tech'],
      'healthcare': ['medical', 'health', 'pharmaceutical'],
      'finance': ['financial', 'banking', 'fintech'],
      'manufacturing': ['industrial', 'production']
    }
    
    for (const [key, related] of Object.entries(relatedIndustries)) {
      if (templateLower.includes(key) && related.some(r => requestLower.includes(r))) {
        return 0.7
      }
    }
    
    return 0.4
  }

  /**
   * Score jurisdiction compatibility
   */
  private scoreJurisdiction(templateJurisdiction: string, requestJurisdiction: string): number {
    if (!templateJurisdiction || !requestJurisdiction) return 0.5
    
    const templateLower = templateJurisdiction.toLowerCase()
    const requestLower = requestJurisdiction.toLowerCase()
    
    // Exact match
    if (templateLower === requestLower) return 1.0
    
    // Federal or multi-state templates work everywhere
    if (templateLower === 'federal' || templateLower === 'multi-state') {
      return 0.7
    }
    
    // Partial match (e.g., "California" matches "CA")
    if (templateLower.includes(requestLower) || requestLower.includes(templateLower)) {
      return 0.9
    }
    
    return 0.3
  }

  /**
   * Score complexity match
   */
  private scoreComplexity(
    templateComplexity: string,
    requestComplexity?: string
  ): number {
    if (!templateComplexity) return 0.5
    if (!requestComplexity) return 0.6 // No preference = slightly positive
    
    const complexityLevels = ['simple', 'moderate', 'complex', 'expert']
    const templateLevel = complexityLevels.indexOf(templateComplexity.toLowerCase())
    const requestLevel = complexityLevels.indexOf(requestComplexity.toLowerCase())
    
    if (templateLevel === -1 || requestLevel === -1) return 0.5
    
    // Exact match
    if (templateLevel === requestLevel) return 1.0
    
    // One level difference
    if (Math.abs(templateLevel - requestLevel) === 1) return 0.7
    
    // Two levels difference
    if (Math.abs(templateLevel - requestLevel) === 2) return 0.4
    
    // Three levels difference
    return 0.2
  }

  /**
   * Score usage success (usage count + rating)
   */
  private scoreUsageSuccess(usageCount: number, averageRating: number): number {
    // Normalize usage count (assume 100+ is very popular)
    const usageScore = Math.min(usageCount / 100, 1.0)
    
    // Normalize rating (0-5 scale to 0-1)
    const ratingScore = averageRating ? averageRating / 5.0 : 0.5
    
    // Weight: 60% rating, 40% usage
    return (ratingScore * 0.6) + (usageScore * 0.4)
  }

  /**
   * Score clause library compatibility
   * Checks if template clauses are available and high-quality
   */
  private async scoreClauseCompatibility(
    template: any,
    request: TemplateMatchRequest
  ): Promise<number> {
    // Parse template sections (contains clause IDs)
    let sections: any[]
    try {
      sections = JSON.parse(template.sections_json || '[]')
    } catch {
      return 0.5
    }
    
    if (sections.length === 0) return 0.5
    
    // Extract clause IDs
    const clauseIds = sections
      .flatMap((s: any) => s.clauses || [])
      .filter((id: string) => id)
    
    if (clauseIds.length === 0) return 0.5
    
    // Query clause library for these clauses
    const placeholders = clauseIds.map(() => '?').join(',')
    const clauseQuery = `
      SELECT 
        id,
        jurisdiction,
        usage_count,
        is_active
      FROM clause_library
      WHERE id IN (${placeholders})
        AND is_active = 1
    `
    
    const result = await this.db.prepare(clauseQuery).bind(...clauseIds).all()
    const availableClauses = result.results || []
    
    // Calculate compatibility score
    const availabilityScore = availableClauses.length / clauseIds.length
    
    // Check jurisdiction match of clauses
    const jurisdictionMatches = availableClauses.filter((c: any) => 
      c.jurisdiction === request.jurisdiction ||
      c.jurisdiction === 'Federal' ||
      c.jurisdiction === 'Multi-State'
    ).length
    
    const jurisdictionScore = availableClauses.length > 0
      ? jurisdictionMatches / availableClauses.length
      : 0.5
    
    // Average usage count of clauses
    const avgUsage = availableClauses.length > 0
      ? availableClauses.reduce((sum: number, c: any) => sum + (c.usage_count || 0), 0) / availableClauses.length
      : 0
    
    const usageScore = Math.min(avgUsage / 50, 1.0)
    
    // Combine scores: 50% availability, 30% jurisdiction, 20% usage
    return (availabilityScore * 0.5) + (jurisdictionScore * 0.3) + (usageScore * 0.2)
  }

  /**
   * Calculate overall relevance score using weighted factors
   */
  private calculateRelevanceScore(factors: TemplateMatch['match_factors']): number {
    const weights = {
      document_type: 0.30,
      industry: 0.20,
      jurisdiction: 0.15,
      complexity: 0.10,
      usage_success: 0.15,
      clause_compatibility: 0.10
    }
    
    const score = 
      (factors.document_type * weights.document_type) +
      (factors.industry * weights.industry) +
      (factors.jurisdiction * weights.jurisdiction) +
      (factors.complexity * weights.complexity) +
      (factors.usage_success * weights.usage_success) +
      (factors.clause_compatibility * weights.clause_compatibility)
    
    // Round to 2 decimal places
    return Math.round(score * 100) / 100
  }

  /**
   * Generate human-readable match reason
   */
  private generateMatchReason(
    template: any,
    factors: TemplateMatch['match_factors'],
    request: TemplateMatchRequest
  ): string {
    const reasons: string[] = []
    
    // Document type
    if (factors.document_type >= 0.9) {
      reasons.push('Exact document type match')
    } else if (factors.document_type >= 0.7) {
      reasons.push('Closely related document type')
    }
    
    // Industry
    if (factors.industry >= 0.9) {
      reasons.push(`Perfect fit for ${request.industry} industry`)
    } else if (factors.industry >= 0.7) {
      reasons.push(`Compatible with ${request.industry} industry`)
    }
    
    // Jurisdiction
    if (factors.jurisdiction >= 0.9) {
      reasons.push(`Designed for ${request.jurisdiction}`)
    } else if (factors.jurisdiction >= 0.7) {
      reasons.push(`Compatible with ${request.jurisdiction} law`)
    }
    
    // Usage success
    if (factors.usage_success >= 0.8) {
      reasons.push('Highly rated by users')
    } else if (factors.usage_success >= 0.6) {
      reasons.push('Proven track record')
    }
    
    // Complexity
    if (request.complexity && factors.complexity >= 0.9) {
      reasons.push(`Matches ${request.complexity} complexity level`)
    }
    
    // Clause compatibility
    if (factors.clause_compatibility >= 0.8) {
      reasons.push('All clauses available in library')
    }
    
    return reasons.length > 0 
      ? reasons.join(' • ')
      : 'General match for your requirements'
  }

  /**
   * Track template match for learning
   */
  async trackMatch(
    userId: string,
    request: TemplateMatchRequest,
    matches: TemplateMatch[]
  ): Promise<void> {
    const timestamp = new Date().toISOString()
    
    // Track top 5 recommendations
    for (let i = 0; i < Math.min(matches.length, 5); i++) {
      const match = matches[i]
      const matchId = `match-${userId}-${Date.now()}-${i}`
      
      await this.db.prepare(`
        INSERT INTO template_matches (
          id, user_id, document_type, industry, jurisdiction, practice_area,
          complexity, additional_context, recommended_template_id, relevance_score,
          match_factors_json, ranking_position, recommended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        matchId,
        userId,
        request.documentType,
        request.industry,
        request.jurisdiction,
        request.practiceArea || null,
        request.complexity || null,
        request.additionalContext || null,
        match.template_id,
        match.relevance_score,
        JSON.stringify(match.match_factors),
        i + 1,
        timestamp
      ).run()
    }
  }

  /**
   * Record user template selection
   */
  async recordSelection(
    matchId: string,
    selectedTemplateId: string,
    selectionReason?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      UPDATE template_matches
      SET 
        user_action = 'selected',
        selected_template_id = ?,
        selection_reason = ?,
        actioned_at = ?
      WHERE id = ?
    `).bind(
      selectedTemplateId,
      selectionReason || null,
      timestamp,
      matchId
    ).run()
  }
}
