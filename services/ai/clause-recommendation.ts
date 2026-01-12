/**
 * LexiCore™ - Clause Recommendation Service
 * Phase 2: AI-Powered Intelligent Clause Suggestions
 * 
 * Analyzes document context and recommends relevant clauses from the 5,000+ clause library.
 * Uses rule-based scoring, usage patterns, and collaborative filtering.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface RecommendationContext {
  documentType: string
  industry: string
  jurisdiction: string
  practiceArea?: string
  existingClauses?: string[]  // Already selected clause IDs
  userPreferences?: Record<string, any>
}

export interface ClauseRecommendation {
  clause_id: string
  clause_title: string
  standard_text: string
  category: string
  subcategory?: string
  relevance_score: number      // 0.0 to 1.0
  confidence_level: 'low' | 'medium' | 'high' | 'very_high'
  reason: string
  context_factors: {
    industry_match: boolean
    jurisdiction_match: boolean
    document_type_match: boolean
    usage_frequency: number
    acceptance_rate: number
  }
  similar_usage_count: number
  risk_level: number           // 1-10
  stance: string
  priority: number             // 1-10 for display ordering
}

export class ClauseRecommendationService {
  constructor(private db: D1Database) {}

  /**
   * Get top clause recommendations based on context
   */
  async getRecommendations(
    context: RecommendationContext,
    limit: number = 10
  ): Promise<ClauseRecommendation[]> {
    // 1. Fetch candidate clauses matching context
    const candidates = await this.fetchCandidateClauses(context)
    
    // 2. Score each candidate
    const scored = await Promise.all(
      candidates.map(clause => this.scoreClause(clause, context))
    )
    
    // 3. Sort by relevance score and return top N
    return scored
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit)
  }

  /**
   * Fetch candidate clauses that match the context
   */
  private async fetchCandidateClauses(context: RecommendationContext) {
    const { documentType, industry, jurisdiction, practiceArea, existingClauses } = context
    
    // Build query with multiple matching strategies
    // Note: clause_usage_patterns tracks clause pairs, not individual usage
    // We'll use clause_library.usage_count instead
    let query = `
      SELECT DISTINCT
        cl.*
      FROM clause_library cl
      WHERE cl.is_active = 1
    `
    
    const params: any[] = []
    
    // Exact jurisdiction match OR federal/general clauses
    query += ` AND (
      cl.jurisdiction = ? 
      OR cl.jurisdiction_type IN ('federal', 'general', 'multi_jurisdiction')
    )`
    params.push(jurisdiction)
    
    // Optional practice area filter
    if (practiceArea) {
      query += ` AND cl.practice_area = ?`
      params.push(practiceArea)
    }
    
    // Exclude already selected clauses
    if (existingClauses && existingClauses.length > 0) {
      const placeholders = existingClauses.map(() => '?').join(',')
      query += ` AND cl.id NOT IN (${placeholders})`
      params.push(...existingClauses)
    }
    
    // Prioritize frequently used clauses
    query += ` ORDER BY cl.usage_count DESC`
    query += ` LIMIT 50` // Get top 50 candidates for scoring
    
    const result = await this.db.prepare(query).bind(...params).all()
    return result.results || []
  }

  /**
   * Score a clause based on relevance to context
   */
  private async scoreClause(clause: any, context: RecommendationContext): Promise<ClauseRecommendation> {
    const { documentType, industry, jurisdiction, practiceArea } = context
    
    // Calculate component scores
    const industryMatch = clause.industry === industry
    const jurisdictionMatch = clause.jurisdiction === jurisdiction || 
                             ['federal', 'general', 'multi_jurisdiction'].includes(clause.jurisdiction_type)
    const categoryRelevance = this.calculateCategoryRelevance(clause.category, documentType)
    const usageFrequency = Math.min((clause.usage_count || 0) / 100, 1.0) // Normalize to 0-1
    const acceptanceRate = clause.acceptance_rate || 0.5
    const riskFactor = this.calculateRiskFactor(clause.risk_level)
    
    // Weighted relevance score
    const relevanceScore = (
      (industryMatch ? 0.25 : 0.10) +         // Industry match: 25% or 10%
      (jurisdictionMatch ? 0.25 : 0.10) +     // Jurisdiction match: 25% or 10%
      (categoryRelevance * 0.20) +            // Category relevance: 20%
      (usageFrequency * 0.15) +               // Usage frequency: 15%
      (acceptanceRate * 0.15) +               // Acceptance rate: 15%
      (riskFactor * 0.10)                     // Risk factor: 10%
    )
    
    // Determine confidence level
    const confidenceLevel = this.determineConfidenceLevel(relevanceScore, {
      industryMatch,
      jurisdictionMatch,
      usageCount: clause.usage_count || 0
    })
    
    // Generate explanation
    const reason = this.generateRecommendationReason(clause, context, {
      industryMatch,
      jurisdictionMatch,
      usageFrequency,
      acceptanceRate
    })
    
    // Calculate priority (inverse of risk for high scores, boost for exact matches)
    let priority = Math.round(relevanceScore * 10)
    if (industryMatch && jurisdictionMatch) priority += 2
    priority = Math.min(priority, 10)
    
    return {
      clause_id: clause.id,
      clause_title: clause.clause_title,
      standard_text: clause.standard_text,
      category: clause.category,
      subcategory: clause.subcategory,
      relevance_score: Math.round(relevanceScore * 100) / 100, // Round to 2 decimals
      confidence_level: confidenceLevel,
      reason,
      context_factors: {
        industry_match: industryMatch,
        jurisdiction_match: jurisdictionMatch,
        document_type_match: categoryRelevance > 0.5,
        usage_frequency: Math.round(usageFrequency * 100),
        acceptance_rate: Math.round((acceptanceRate || 0) * 100)
      },
      similar_usage_count: clause.usage_count || 0,
      risk_level: clause.risk_level || 5,
      stance: clause.stance || 'neutral',
      priority
    }
  }

  /**
   * Calculate category relevance based on document type
   */
  private calculateCategoryRelevance(category: string, documentType: string): number {
    // Map document types to relevant categories
    const relevanceMap: Record<string, string[]> = {
      'employment_contract': ['employment', 'confidentiality', 'ip', 'termination', 'compensation'],
      'nda': ['confidentiality', 'non_disclosure', 'trade_secrets', 'proprietary'],
      'service_agreement': ['services', 'payment', 'termination', 'warranties', 'liability'],
      'purchase_agreement': ['purchase', 'payment', 'delivery', 'warranties', 'returns'],
      'lease_agreement': ['lease', 'rent', 'property', 'maintenance', 'termination'],
      'partnership_agreement': ['partnership', 'profit_sharing', 'management', 'dissolution'],
      'licensing_agreement': ['licensing', 'ip', 'royalties', 'restrictions', 'termination'],
      'consulting_agreement': ['consulting', 'services', 'payment', 'confidentiality', 'ip']
    }
    
    const relevantCategories = relevanceMap[documentType] || []
    const categoryLower = (category || '').toLowerCase()
    
    // Check for exact or partial match
    if (relevantCategories.some(cat => categoryLower.includes(cat) || cat.includes(categoryLower))) {
      return 1.0
    }
    
    // General categories always somewhat relevant
    if (['general', 'miscellaneous', 'standard'].includes(categoryLower)) {
      return 0.5
    }
    
    return 0.3 // Partial relevance for unmatched categories
  }

  /**
   * Calculate risk factor (lower risk = higher score)
   */
  private calculateRiskFactor(riskLevel: number): number {
    if (!riskLevel) return 0.5
    // Inverse: risk 1 = factor 1.0, risk 10 = factor 0.1
    return 1.0 - ((riskLevel - 1) / 9)
  }

  /**
   * Determine confidence level based on score and factors
   */
  private determineConfidenceLevel(
    score: number,
    factors: { industryMatch: boolean; jurisdictionMatch: boolean; usageCount: number }
  ): 'low' | 'medium' | 'high' | 'very_high' {
    if (score >= 0.85 && factors.industryMatch && factors.jurisdictionMatch && factors.usageCount > 50) {
      return 'very_high'
    }
    if (score >= 0.70 && (factors.industryMatch || factors.jurisdictionMatch)) {
      return 'high'
    }
    if (score >= 0.50) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * Generate human-readable recommendation reason
   */
  private generateRecommendationReason(
    clause: any,
    context: RecommendationContext,
    factors: {
      industryMatch: boolean
      jurisdictionMatch: boolean
      usageFrequency: number
      acceptanceRate: number
    }
  ): string {
    const reasons: string[] = []
    
    if (factors.industryMatch && factors.jurisdictionMatch) {
      reasons.push(`Perfect match for ${context.industry} industry in ${context.jurisdiction}`)
    } else if (factors.industryMatch) {
      reasons.push(`Commonly used in ${context.industry} industry`)
    } else if (factors.jurisdictionMatch) {
      reasons.push(`Compliant with ${context.jurisdiction} jurisdiction`)
    }
    
    if (clause.usage_count > 100) {
      reasons.push(`Used in ${clause.usage_count}+ similar documents`)
    } else if (clause.usage_count > 50) {
      reasons.push(`Popular choice in similar contracts`)
    }
    
    if (factors.acceptanceRate > 0.8) {
      reasons.push(`${Math.round(factors.acceptanceRate * 100)}% acceptance rate`)
    }
    
    if (clause.risk_level <= 3) {
      reasons.push(`Low legal risk`)
    }
    
    if (clause.stance === 'balanced') {
      reasons.push(`Balanced approach - fair to both parties`)
    }
    
    // Default reason if no specific factors
    if (reasons.length === 0) {
      reasons.push(`Relevant for ${context.documentType} documents`)
    }
    
    return reasons.join(' • ')
  }

  /**
   * Record user feedback on recommendation
   */
  async recordFeedback(
    recommendationId: string,
    userId: string,
    action: 'accepted' | 'rejected' | 'ignored',
    feedback?: string
  ) {
    // Update recommendation record
    await this.db.prepare(`
      UPDATE ai_recommendations
      SET user_action = ?,
          actioned_at = CURRENT_TIMESTAMP,
          user_feedback = ?,
          is_dismissed = ?
      WHERE id = ?
    `).bind(action, feedback || null, action === 'rejected' ? 1 : 0, recommendationId).run()
    
    // Update usage patterns for learning
    const recommendation = await this.db.prepare(`
      SELECT recommended_item_id, context_factors
      FROM ai_recommendations
      WHERE id = ?
    `).bind(recommendationId).first()
    
    if (recommendation) {
      await this.updateUsagePattern(
        recommendation.recommended_item_id as string,
        action,
        recommendation.context_factors as string
      )
    }
  }

  /**
   * Update clause usage pattern based on user action
   */
  private async updateUsagePattern(clauseId: string, action: string, contextJSON: string) {
    try {
      const context = JSON.parse(contextJSON)
      const patternId = `pattern-${clauseId}-${context.documentType}-${context.industry}`
      
      // Calculate new rates based on action
      const acceptanceIncrement = action === 'accepted' ? 1 : 0
      const rejectionIncrement = action === 'rejected' ? 1 : 0
      
      await this.db.prepare(`
        INSERT INTO clause_usage_patterns (
          id, clause_id, document_type, industry, jurisdiction,
          usage_count, acceptance_rate, rejection_rate
        )
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          usage_count = usage_count + 1,
          acceptance_rate = (acceptance_rate * usage_count + ?) / (usage_count + 1),
          rejection_rate = (rejection_rate * usage_count + ?) / (usage_count + 1),
          last_used_at = CURRENT_TIMESTAMP
      `).bind(
        patternId,
        clauseId,
        context.documentType,
        context.industry,
        context.jurisdiction,
        acceptanceIncrement,
        rejectionIncrement,
        acceptanceIncrement,
        rejectionIncrement
      ).run()
    } catch (error) {
      console.error('Error updating usage pattern:', error)
    }
  }
}
