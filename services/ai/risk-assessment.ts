/**
 * LexiCore™ - Risk Assessment Service
 * Phase 2: Automated Risk Analysis & Mitigation Recommendations
 * 
 * Analyzes drafted documents and clauses for legal risks, compliance issues,
 * and enforceability concerns. Provides risk scores and mitigation strategies.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface RiskAssessmentContext {
  draftId: string
  clauses: Array<{
    clause_id: string
    text: string
    category?: string
  }>
  documentType: string
  industry: string
  jurisdiction: string
  practiceArea?: string
  regulatoryFrameworks?: string[]  // ['GDPR', 'HIPAA', 'CCPA', 'SOX']
}

export interface RiskAssessmentResult {
  overall_risk_score: number        // 1-10
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical'
  high_risk_clauses: ClauseRiskAssessment[]
  medium_risk_clauses: ClauseRiskAssessment[]
  compliance_issues: ComplianceIssue[]
  recommendations: string[]
  summary: string
}

export interface ClauseRiskAssessment {
  clause_id: string
  clause_title: string
  risk_score: number                // 1-10
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical'
  risk_category: 'jurisdiction' | 'regulatory' | 'enforceability' | 'ambiguity' | 'negotiability' | 'compliance'
  risk_description: string
  mitigation_suggestion: string
  alternative_clause_id?: string
  legal_precedent?: string
  impact_level: 'low' | 'medium' | 'high' | 'critical'
  likelihood: 'low' | 'medium' | 'high'
}

export interface ComplianceIssue {
  regulation: string                // 'GDPR', 'HIPAA', etc.
  issue_type: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  required_action: string
  clause_ids: string[]
}

export class RiskAssessmentService {
  constructor(private db: D1Database) {}

  /**
   * Perform comprehensive risk assessment on a draft document
   */
  async assessRisk(context: RiskAssessmentContext): Promise<RiskAssessmentResult> {
    const clauseRisks: ClauseRiskAssessment[] = []
    
    // 1. Assess each clause individually
    for (const clause of context.clauses) {
      const risk = await this.assessClauseRisk(clause, context)
      if (risk) {
        clauseRisks.push(risk)
      }
    }
    
    // 2. Check for compliance issues
    const complianceIssues = await this.checkCompliance(context)
    
    // 3. Calculate overall risk score
    const overallRiskScore = this.calculateOverallRisk(clauseRisks, complianceIssues)
    const riskLevel = this.determineRiskLevel(overallRiskScore)
    
    // 4. Generate recommendations
    const recommendations = this.generateRecommendations(clauseRisks, complianceIssues, context)
    
    // 5. Categorize risks
    const highRiskClauses = clauseRisks.filter(c => c.risk_score >= 7)
    const mediumRiskClauses = clauseRisks.filter(c => c.risk_score >= 4 && c.risk_score < 7)
    
    // 6. Save risk assessments to database
    await this.saveRiskAssessments(context.draftId, clauseRisks)
    
    return {
      overall_risk_score: Math.round(overallRiskScore * 10) / 10,
      risk_level: riskLevel,
      high_risk_clauses: highRiskClauses,
      medium_risk_clauses: mediumRiskClauses,
      compliance_issues: complianceIssues,
      recommendations,
      summary: this.generateSummary(overallRiskScore, highRiskClauses.length, complianceIssues.length)
    }
  }

  /**
   * Assess risk for a single clause
   */
  private async assessClauseRisk(
    clause: { clause_id: string; text: string; category?: string },
    context: RiskAssessmentContext
  ): Promise<ClauseRiskAssessment | null> {
    // Fetch clause metadata from database
    const clauseData = await this.db.prepare(`
      SELECT * FROM clause_library WHERE id = ?
    `).bind(clause.clause_id).first()
    
    if (!clauseData) return null
    
    const risks: Array<{ score: number; category: string; description: string }> = []
    
    // 1. Jurisdiction Risk
    const jurisdictionRisk = this.assessJurisdictionRisk(clauseData, context.jurisdiction)
    if (jurisdictionRisk) risks.push(jurisdictionRisk)
    
    // 2. Regulatory Risk
    const regulatoryRisk = this.assessRegulatoryRisk(clauseData, context)
    if (regulatoryRisk) risks.push(regulatoryRisk)
    
    // 3. Enforceability Risk
    const enforceabilityRisk = this.assessEnforceabilityRisk(clauseData, context)
    if (enforceabilityRisk) risks.push(enforceabilityRisk)
    
    // 4. Ambiguity Risk
    const ambiguityRisk = this.assessAmbiguityRisk(clause.text)
    if (ambiguityRisk) risks.push(ambiguityRisk)
    
    // 5. Negotiability Risk (based on stance)
    const negotiabilityRisk = this.assessNegotiabilityRisk(clauseData)
    if (negotiabilityRisk) risks.push(negotiabilityRisk)
    
    // If no risks found, return null (low risk)
    if (risks.length === 0) return null
    
    // Find highest risk
    const highestRisk = risks.reduce((max, r) => r.score > max.score ? r : max, risks[0])
    
    // Get alternative clause if available
    const alternativeClause = await this.findAlternativeClause(clause.clause_id, context)
    
    return {
      clause_id: clause.clause_id,
      clause_title: clauseData.clause_title as string,
      risk_score: highestRisk.score,
      risk_level: this.determineRiskLevel(highestRisk.score),
      risk_category: highestRisk.category as any,
      risk_description: highestRisk.description,
      mitigation_suggestion: this.generateMitigationSuggestion(highestRisk, clauseData, context),
      alternative_clause_id: alternativeClause,
      impact_level: this.determineImpactLevel(highestRisk.score),
      likelihood: this.determineLikelihood(highestRisk.score, clauseData)
    }
  }

  /**
   * Assess jurisdiction-specific risk
   */
  private assessJurisdictionRisk(clauseData: any, jurisdiction: string): any | null {
    // Check if clause jurisdiction matches target jurisdiction
    if (clauseData.jurisdiction !== jurisdiction && 
        !['federal', 'general', 'multi_jurisdiction'].includes(clauseData.jurisdiction_type)) {
      return {
        score: 7,
        category: 'jurisdiction',
        description: `Clause is for ${clauseData.jurisdiction} but document is for ${jurisdiction}. May not be enforceable.`
      }
    }
    
    // Check for known problematic jurisdictions
    const problemJurisdictions: Record<string, string[]> = {
      'California': ['non_compete', 'broad_indemnification'],
      'New York': ['choice_of_law_foreign'],
      'Texas': ['unlimited_liability']
    }
    
    const problematic = problemJurisdictions[jurisdiction]
    if (problematic && problematic.some(p => clauseData.category?.includes(p))) {
      return {
        score: 8,
        category: 'jurisdiction',
        description: `${clauseData.category} clauses are heavily restricted in ${jurisdiction}.`
      }
    }
    
    return null
  }

  /**
   * Assess regulatory compliance risk
   */
  private assessRegulatoryRisk(clauseData: any, context: RiskAssessmentContext): any | null {
    if (!context.regulatoryFrameworks || context.regulatoryFrameworks.length === 0) {
      return null
    }
    
    // Check for GDPR compliance
    if (context.regulatoryFrameworks.includes('GDPR')) {
      if (clauseData.category?.includes('data') || clauseData.category?.includes('privacy')) {
        if (!clauseData.standard_text?.includes('GDPR') && !clauseData.standard_text?.includes('data subject')) {
          return {
            score: 8,
            category: 'regulatory',
            description: 'Data-related clause may not comply with GDPR requirements for EU residents.'
          }
        }
      }
    }
    
    // Check for HIPAA compliance
    if (context.regulatoryFrameworks.includes('HIPAA')) {
      if (context.industry === 'healthcare' && clauseData.category?.includes('confidentiality')) {
        if (!clauseData.standard_text?.includes('HIPAA') && !clauseData.standard_text?.includes('PHI')) {
          return {
            score: 9,
            category: 'regulatory',
            description: 'Healthcare confidentiality clause must explicitly reference HIPAA and PHI protections.'
          }
        }
      }
    }
    
    return null
  }

  /**
   * Assess enforceability risk
   */
  private assessEnforceabilityRisk(clauseData: any, context: RiskAssessmentContext): any | null {
    const riskLevel = clauseData.risk_level || 5
    
    if (riskLevel >= 8) {
      return {
        score: riskLevel,
        category: 'enforceability',
        description: `This clause has a high risk level (${riskLevel}/10) and may be challenged in court.`
      }
    }
    
    // Check negotiability
    if (clauseData.negotiability === 'frequently_negotiated') {
      return {
        score: 6,
        category: 'enforceability',
        description: 'This clause is frequently negotiated, indicating potential enforceability concerns.'
      }
    }
    
    return null
  }

  /**
   * Assess ambiguity risk (text analysis)
   */
  private assessAmbiguityRisk(text: string): any | null {
    const ambiguousTerms = [
      'reasonable', 'appropriate', 'substantial', 'material', 'promptly',
      'best efforts', 'as soon as possible', 'from time to time'
    ]
    
    const foundTerms = ambiguousTerms.filter(term => 
      text.toLowerCase().includes(term)
    )
    
    if (foundTerms.length >= 3) {
      return {
        score: 6,
        category: 'ambiguity',
        description: `Contains ${foundTerms.length} ambiguous terms: ${foundTerms.slice(0, 3).join(', ')}. May lead to disputes.`
      }
    }
    
    return null
  }

  /**
   * Assess negotiability risk based on stance
   */
  private assessNegotiabilityRisk(clauseData: any): any | null {
    const stance = clauseData.stance
    
    if (stance === 'pro_vendor' || stance === 'pro_customer') {
      return {
        score: 5,
        category: 'negotiability',
        description: `One-sided clause (${stance}). Other party may request modifications.`
      }
    }
    
    return null
  }

  /**
   * Check for compliance issues
   */
  private async checkCompliance(context: RiskAssessmentContext): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = []
    
    if (!context.regulatoryFrameworks) return issues
    
    // GDPR compliance checks
    if (context.regulatoryFrameworks.includes('GDPR')) {
      const hasDataProcessing = context.clauses.some(c => 
        c.text.toLowerCase().includes('data') || c.text.toLowerCase().includes('personal information')
      )
      
      if (hasDataProcessing) {
        const hasGDPRClause = context.clauses.some(c =>
          c.text.includes('GDPR') || c.text.includes('data subject rights')
        )
        
        if (!hasGDPRClause) {
          issues.push({
            regulation: 'GDPR',
            issue_type: 'missing_compliance_clause',
            description: 'Document processes personal data but lacks GDPR compliance clauses',
            severity: 'high',
            required_action: 'Add GDPR-compliant data processing clause',
            clause_ids: []
          })
        }
      }
    }
    
    return issues
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRisk(
    clauseRisks: ClauseRiskAssessment[],
    complianceIssues: ComplianceIssue[]
  ): number {
    if (clauseRisks.length === 0 && complianceIssues.length === 0) return 2
    
    // Average of all clause risk scores
    const avgClauseRisk = clauseRisks.length > 0
      ? clauseRisks.reduce((sum, r) => sum + r.risk_score, 0) / clauseRisks.length
      : 3
    
    // Compliance issues add to overall risk
    const complianceRiskAdd = complianceIssues.reduce((sum, issue) => {
      return sum + (
        issue.severity === 'critical' ? 3 :
        issue.severity === 'high' ? 2 :
        issue.severity === 'medium' ? 1 : 0.5
      )
    }, 0)
    
    return Math.min(avgClauseRisk + complianceRiskAdd, 10)
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (score >= 8) return 'Critical'
    if (score >= 6) return 'High'
    if (score >= 4) return 'Medium'
    return 'Low'
  }

  /**
   * Determine impact level
   */
  private determineImpactLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 8) return 'critical'
    if (score >= 6) return 'high'
    if (score >= 4) return 'medium'
    return 'low'
  }

  /**
   * Determine likelihood
   */
  private determineLikelihood(score: number, clauseData: any): 'low' | 'medium' | 'high' {
    if (clauseData.negotiability === 'rarely_negotiated') return 'low'
    if (clauseData.negotiability === 'frequently_negotiated') return 'high'
    if (score >= 7) return 'high'
    if (score >= 5) return 'medium'
    return 'low'
  }

  /**
   * Generate mitigation suggestion
   */
  private generateMitigationSuggestion(risk: any, clauseData: any, context: RiskAssessmentContext): string {
    switch (risk.category) {
      case 'jurisdiction':
        return `Replace with ${context.jurisdiction}-specific version of this clause.`
      case 'regulatory':
        return `Add explicit compliance language for applicable regulations.`
      case 'enforceability':
        return `Consider using a more balanced version or adding limitations.`
      case 'ambiguity':
        return `Replace ambiguous terms with specific, measurable criteria.`
      case 'negotiability':
        return `Use a balanced stance version to reduce negotiation friction.`
      default:
        return `Review with legal counsel and consider safer alternatives.`
    }
  }

  /**
   * Find alternative lower-risk clause
   */
  private async findAlternativeClause(clauseId: string, context: RiskAssessmentContext): Promise<string | undefined> {
    const result = await this.db.prepare(`
      SELECT id FROM clause_library
      WHERE category = (SELECT category FROM clause_library WHERE id = ?)
        AND jurisdiction = ?
        AND industry = ?
        AND risk_level < (SELECT risk_level FROM clause_library WHERE id = ?)
        AND stance = 'balanced'
        AND is_active = 1
      ORDER BY risk_level ASC, usage_count DESC
      LIMIT 1
    `).bind(clauseId, context.jurisdiction, context.industry, clauseId).first()
    
    return result?.id as string | undefined
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    clauseRisks: ClauseRiskAssessment[],
    complianceIssues: ComplianceIssue[],
    context: RiskAssessmentContext
  ): string[] {
    const recommendations: string[] = []
    
    if (clauseRisks.filter(r => r.risk_level === 'Critical').length > 0) {
      recommendations.push('⚠️ Critical risk clauses detected - immediate attorney review required')
    }
    
    if (complianceIssues.length > 0) {
      recommendations.push(`🔍 ${complianceIssues.length} compliance issue(s) found - address before finalization`)
    }
    
    if (clauseRisks.filter(r => r.risk_level === 'High').length > 2) {
      recommendations.push('📋 Multiple high-risk clauses - consider using safer alternatives')
    }
    
    const jurisdictionMismatches = clauseRisks.filter(r => r.risk_category === 'jurisdiction').length
    if (jurisdictionMismatches > 0) {
      recommendations.push(`📍 ${jurisdictionMismatches} clause(s) not optimized for ${context.jurisdiction}`)
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Document risk level is acceptable for standard use')
    }
    
    return recommendations
  }

  /**
   * Generate summary text
   */
  private generateSummary(overallScore: number, highRiskCount: number, complianceIssueCount: number): string {
    if (overallScore >= 8) {
      return `Critical risk level detected. This document has ${highRiskCount} high-risk clause(s) and ${complianceIssueCount} compliance issue(s). Mandatory attorney review required before execution.`
    } else if (overallScore >= 6) {
      return `Medium-high risk level. Document contains elements that should be reviewed by legal counsel before finalization.`
    } else if (overallScore >= 4) {
      return `Moderate risk level. Standard review recommended. Most clauses are acceptable but consider suggested improvements.`
    } else {
      return `Low risk level. Document uses well-vetted clauses with minimal legal exposure. Standard attorney review still recommended.`
    }
  }

  /**
   * Save risk assessments to database
   */
  private async saveRiskAssessments(draftId: string, risks: ClauseRiskAssessment[]) {
    for (const risk of risks) {
      const id = `risk-${draftId}-${risk.clause_id}-${Date.now()}`
      
      await this.db.prepare(`
        INSERT INTO risk_assessments (
          id, draft_id, clause_id, risk_score, risk_level, risk_category,
          risk_description, mitigation_suggestion, alternative_clause_id,
          impact_level, likelihood
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, draftId, risk.clause_id, risk.risk_score, risk.risk_level,
        risk.risk_category, risk.risk_description, risk.mitigation_suggestion,
        risk.alternative_clause_id || null, risk.impact_level, risk.likelihood
      ).run()
    }
  }
}
