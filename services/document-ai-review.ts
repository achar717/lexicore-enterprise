/**
 * LexiCore™ - Document AI Review Service
 * AI-powered review and analysis of drafted documents
 * 
 * TASK #5: AI REVIEW INTEGRATION
 * This service provides intelligent document review for drafted contracts,
 * pleadings, and other legal documents.
 * 
 * LEGAL COMPLIANCE:
 * - AI is ADVISORY ONLY - not legal advice
 * - All output requires attorney review
 * - Risk scores are estimates, not legal conclusions
 * - Compliance checks are suggestions, not guarantees
 * - Attorney must make final judgment
 * 
 * FEATURES:
 * - Risk assessment (clause analysis, jurisdictional concerns)
 * - Compliance checking (jurisdiction-specific requirements)
 * - Clause recommendations (add/remove/modify)
 * - Language quality (clarity, ambiguity, enforceability)
 * - Completeness check (missing standard clauses)
 * - Consistency analysis (internal contradictions)
 */

import { AIProviderService, AIMessage, AIResponse } from './ai-providers'

export interface DocumentReviewRequest {
  documentId: string
  documentType: string
  documentContent: string
  selectedClauses: any[]
  variables: Record<string, any>
  metadata: {
    industry?: string
    jurisdiction?: string
    practiceArea?: string
    parties?: any
    matterId?: string
  }
}

export interface RiskAssessment {
  overallRiskScore: number // 1-10
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  riskFactors: RiskFactor[]
  summary: string
}

export interface RiskFactor {
  category: string // e.g., 'ambiguous_language', 'missing_clause', 'jurisdiction_issue'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  location: string // section or clause reference
  recommendation: string
  priority: number // 1-10
}

export interface ComplianceCheck {
  jurisdiction: string
  compliant: boolean
  issues: ComplianceIssue[]
  recommendations: string[]
}

export interface ComplianceIssue {
  rule: string // e.g., 'California Civil Code § 1670.5'
  description: string
  severity: 'informational' | 'warning' | 'critical'
  location: string
  remediation: string
}

export interface ClauseRecommendation {
  action: 'add' | 'remove' | 'modify'
  clauseId?: string
  clauseTitle: string
  reason: string
  priority: 'optional' | 'recommended' | 'strongly_recommended' | 'required'
  suggestedText?: string
  location?: string
}

export interface QualityAnalysis {
  clarity: number // 1-10
  consistency: number // 1-10
  completeness: number // 1-10
  enforceability: number // 1-10
  issues: QualityIssue[]
}

export interface QualityIssue {
  type: 'ambiguity' | 'inconsistency' | 'vagueness' | 'missing_definition' | 'poor_structure'
  description: string
  location: string
  suggestion: string
  severity: 'low' | 'medium' | 'high'
}

export interface AIReviewResult {
  reviewId: string
  documentId: string
  timestamp: string
  
  // Core Analysis
  riskAssessment: RiskAssessment
  complianceCheck: ComplianceCheck
  qualityAnalysis: QualityAnalysis
  clauseRecommendations: ClauseRecommendation[]
  
  // Summary
  summary: string
  keyFindings: string[]
  criticalIssues: string[]
  
  // Metadata
  reviewedBy: string // AI model name
  confidenceScore: number // 1-100
  processingTime: number // milliseconds
  requiresAttorneyReview: boolean
  
  // Legal Disclaimer
  disclaimer: string
}

/**
 * Document AI Review Service
 * Coordinates AI-powered document analysis
 */
export class DocumentAIReviewService {
  private aiProvider: AIProviderService
  
  constructor(aiProvider: AIProviderService) {
    this.aiProvider = aiProvider
  }
  
  /**
   * Perform comprehensive AI review of a drafted document
   */
  async reviewDocument(request: DocumentReviewRequest): Promise<AIReviewResult> {
    console.log('🤖 Starting AI document review:', {
      documentId: request.documentId,
      documentType: request.documentType,
      jurisdiction: request.metadata.jurisdiction,
      contentLength: request.documentContent.length
    })
    
    const startTime = Date.now()
    const reviewId = `AI-REV-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`
    
    try {
      // Perform parallel analysis
      const [
        riskAssessment,
        complianceCheck,
        qualityAnalysis,
        clauseRecommendations
      ] = await Promise.all([
        this.analyzeRisk(request),
        this.checkCompliance(request),
        this.analyzeQuality(request),
        this.generateClauseRecommendations(request)
      ])
      
      // Generate executive summary
      const summary = await this.generateSummary(
        request,
        riskAssessment,
        complianceCheck,
        qualityAnalysis,
        clauseRecommendations
      )
      
      // Extract key findings and critical issues
      const keyFindings = this.extractKeyFindings(
        riskAssessment,
        complianceCheck,
        qualityAnalysis
      )
      
      const criticalIssues = this.extractCriticalIssues(
        riskAssessment,
        complianceCheck
      )
      
      const processingTime = Date.now() - startTime
      
      const result: AIReviewResult = {
        reviewId,
        documentId: request.documentId,
        timestamp: new Date().toISOString(),
        
        riskAssessment,
        complianceCheck,
        qualityAnalysis,
        clauseRecommendations,
        
        summary,
        keyFindings,
        criticalIssues,
        
        reviewedBy: 'LexiCore AI (GPT-4o-mini / Gemini-1.5-Flash)',
        confidenceScore: this.calculateOverallConfidence(
          riskAssessment,
          complianceCheck,
          qualityAnalysis
        ),
        processingTime,
        requiresAttorneyReview: true,
        
        disclaimer: this.getLegalDisclaimer()
      }
      
      console.log('✅ AI review complete:', {
        reviewId,
        overallRisk: riskAssessment.riskLevel,
        criticalIssuesCount: criticalIssues.length,
        processingTime: `${processingTime}ms`
      })
      
      return result
      
    } catch (error) {
      console.error('❌ AI review failed:', error)
      throw new Error(`AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Analyze document risk
   */
  private async analyzeRisk(request: DocumentReviewRequest): Promise<RiskAssessment> {
    const prompt = this.buildRiskAnalysisPrompt(request)
    
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal document risk analyst. Analyze the document for potential risks and provide a structured risk assessment in JSON format.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
    
    try {
      const response = await this.aiProvider.generateCompletion(messages, {
        temperature: 0.3, // Lower temperature for consistent analysis
        maxTokens: 2000,
        jsonMode: true
      })
      
      const parsed = JSON.parse(response.content)
      
      return {
        overallRiskScore: parsed.overall_risk_score || 5,
        riskLevel: this.calculateRiskLevel(parsed.overall_risk_score || 5),
        riskFactors: parsed.risk_factors || [],
        summary: parsed.summary || 'Risk analysis complete.'
      }
      
    } catch (error) {
      console.error('Risk analysis failed:', error)
      // Return safe fallback
      return {
        overallRiskScore: 5,
        riskLevel: 'medium',
        riskFactors: [{
          category: 'analysis_incomplete',
          severity: 'medium',
          description: 'AI analysis could not be completed. Manual review required.',
          location: 'Overall',
          recommendation: 'Perform manual risk assessment',
          priority: 8
        }],
        summary: 'Automated risk analysis unavailable. Manual review required.'
      }
    }
  }
  
  /**
   * Check compliance with jurisdiction-specific requirements
   */
  private async checkCompliance(request: DocumentReviewRequest): Promise<ComplianceCheck> {
    const prompt = this.buildComplianceCheckPrompt(request)
    
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal compliance expert. Check the document for jurisdiction-specific compliance requirements and provide structured findings in JSON format.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
    
    try {
      const response = await this.aiProvider.generateCompletion(messages, {
        temperature: 0.3,
        maxTokens: 2000,
        jsonMode: true
      })
      
      const parsed = JSON.parse(response.content)
      
      return {
        jurisdiction: request.metadata.jurisdiction || 'US',
        compliant: parsed.compliant !== false,
        issues: parsed.issues || [],
        recommendations: parsed.recommendations || []
      }
      
    } catch (error) {
      console.error('Compliance check failed:', error)
      return {
        jurisdiction: request.metadata.jurisdiction || 'US',
        compliant: false,
        issues: [{
          rule: 'Automated Compliance Check',
          description: 'Automated compliance check could not be completed.',
          severity: 'warning',
          location: 'Overall',
          remediation: 'Perform manual compliance review with local counsel.'
        }],
        recommendations: ['Consult with local counsel for jurisdiction-specific requirements.']
      }
    }
  }
  
  /**
   * Analyze document quality (clarity, consistency, completeness)
   */
  private async analyzeQuality(request: DocumentReviewRequest): Promise<QualityAnalysis> {
    const prompt = this.buildQualityAnalysisPrompt(request)
    
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal document quality analyst. Analyze the document for clarity, consistency, completeness, and enforceability. Provide structured findings in JSON format.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
    
    try {
      const response = await this.aiProvider.generateCompletion(messages, {
        temperature: 0.3,
        maxTokens: 2000,
        jsonMode: true
      })
      
      const parsed = JSON.parse(response.content)
      
      return {
        clarity: parsed.clarity || 7,
        consistency: parsed.consistency || 7,
        completeness: parsed.completeness || 7,
        enforceability: parsed.enforceability || 7,
        issues: parsed.issues || []
      }
      
    } catch (error) {
      console.error('Quality analysis failed:', error)
      return {
        clarity: 7,
        consistency: 7,
        completeness: 7,
        enforceability: 7,
        issues: []
      }
    }
  }
  
  /**
   * Generate clause recommendations (add/remove/modify)
   */
  private async generateClauseRecommendations(
    request: DocumentReviewRequest
  ): Promise<ClauseRecommendation[]> {
    const prompt = this.buildClauseRecommendationsPrompt(request)
    
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal document expert. Analyze the document and recommend clause additions, removals, or modifications. Provide structured recommendations in JSON format.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
    
    try {
      const response = await this.aiProvider.generateCompletion(messages, {
        temperature: 0.4,
        maxTokens: 2000,
        jsonMode: true
      })
      
      const parsed = JSON.parse(response.content)
      return parsed.recommendations || []
      
    } catch (error) {
      console.error('Clause recommendations failed:', error)
      return []
    }
  }
  
  /**
   * Generate executive summary
   */
  private async generateSummary(
    request: DocumentReviewRequest,
    risk: RiskAssessment,
    compliance: ComplianceCheck,
    quality: QualityAnalysis,
    recommendations: ClauseRecommendation[]
  ): Promise<string> {
    const prompt = `
Generate a concise executive summary (2-3 paragraphs) for this document review:

Document Type: ${request.documentType}
Jurisdiction: ${request.metadata.jurisdiction || 'US'}
Overall Risk: ${risk.riskLevel} (${risk.overallRiskScore}/10)
Compliance Status: ${compliance.compliant ? 'Compliant' : 'Issues Identified'}
Quality Scores: Clarity ${quality.clarity}/10, Consistency ${quality.consistency}/10
Critical Issues: ${risk.riskFactors.filter(f => f.severity === 'critical').length}
Recommendations: ${recommendations.length}

Provide a professional summary suitable for attorney review.
`
    
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal document reviewer. Provide clear, professional summaries for attorneys.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
    
    try {
      const response = await this.aiProvider.generateCompletion(messages, {
        temperature: 0.6,
        maxTokens: 500
      })
      
      return response.content.trim()
      
    } catch (error) {
      console.error('Summary generation failed:', error)
      return `Document reviewed. Overall risk: ${risk.riskLevel}. ${risk.riskFactors.length} risk factors identified. ${recommendations.length} recommendations provided. Attorney review required.`
    }
  }
  
  // ============================================================================
  // PROMPT BUILDERS
  // ============================================================================
  
  private buildRiskAnalysisPrompt(request: DocumentReviewRequest): string {
    return `
Analyze this ${request.documentType} for legal and business risks.

Document Type: ${request.documentType}
Jurisdiction: ${request.metadata.jurisdiction || 'US'}
Industry: ${request.metadata.industry || 'General'}
Practice Area: ${request.metadata.practiceArea || 'General'}

Document Content:
${request.documentContent.substring(0, 8000)} ${request.documentContent.length > 8000 ? '...(truncated)' : ''}

Selected Clauses:
${request.selectedClauses.map(c => `- ${c.title || c.id}`).join('\n')}

Provide a JSON response with this structure:
{
  "overall_risk_score": <number 1-10>,
  "risk_factors": [
    {
      "category": "<risk category>",
      "severity": "<low|medium|high|critical>",
      "description": "<brief description>",
      "location": "<section/clause reference>",
      "recommendation": "<mitigation suggestion>",
      "priority": <number 1-10>
    }
  ],
  "summary": "<brief risk summary>"
}

Focus on: ambiguous language, missing standard clauses, unfavorable terms, jurisdiction issues, enforcement concerns.
`
  }
  
  private buildComplianceCheckPrompt(request: DocumentReviewRequest): string {
    return `
Check this ${request.documentType} for compliance with ${request.metadata.jurisdiction || 'US'} legal requirements.

Document Type: ${request.documentType}
Jurisdiction: ${request.metadata.jurisdiction || 'US'}
Industry: ${request.metadata.industry || 'General'}

Document Content:
${request.documentContent.substring(0, 8000)} ${request.documentContent.length > 8000 ? '...(truncated)' : ''}

Provide a JSON response with this structure:
{
  "compliant": <boolean>,
  "issues": [
    {
      "rule": "<statute or rule reference>",
      "description": "<compliance issue>",
      "severity": "<informational|warning|critical>",
      "location": "<section reference>",
      "remediation": "<how to fix>"
    }
  ],
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}

Check for: required disclosures, statutory requirements, formatting rules, signature requirements, notice provisions.
`
  }
  
  private buildQualityAnalysisPrompt(request: DocumentReviewRequest): string {
    return `
Analyze this ${request.documentType} for document quality.

Document Content:
${request.documentContent.substring(0, 8000)} ${request.documentContent.length > 8000 ? '...(truncated)' : ''}

Provide a JSON response with this structure:
{
  "clarity": <number 1-10>,
  "consistency": <number 1-10>,
  "completeness": <number 1-10>,
  "enforceability": <number 1-10>,
  "issues": [
    {
      "type": "<ambiguity|inconsistency|vagueness|missing_definition|poor_structure>",
      "description": "<issue description>",
      "location": "<section reference>",
      "suggestion": "<improvement suggestion>",
      "severity": "<low|medium|high>"
    }
  ]
}

Evaluate: language clarity, internal consistency, completeness of terms, enforceability concerns, defined terms usage.
`
  }
  
  private buildClauseRecommendationsPrompt(request: DocumentReviewRequest): string {
    return `
Recommend clause improvements for this ${request.documentType}.

Document Type: ${request.documentType}
Industry: ${request.metadata.industry || 'General'}
Current Clauses: ${request.selectedClauses.length} selected

Document Content:
${request.documentContent.substring(0, 8000)} ${request.documentContent.length > 8000 ? '...(truncated)' : ''}

Provide a JSON response with this structure:
{
  "recommendations": [
    {
      "action": "<add|remove|modify>",
      "clauseTitle": "<clause name>",
      "reason": "<why this change>",
      "priority": "<optional|recommended|strongly_recommended|required>",
      "suggestedText": "<suggested language if add/modify>",
      "location": "<where to place if add>"
    }
  ]
}

Consider: standard industry clauses, risk mitigation, clarity improvements, jurisdiction requirements.
`
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  private calculateRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score <= 3) return 'low'
    if (score <= 6) return 'medium'
    if (score <= 8) return 'high'
    return 'critical'
  }
  
  private calculateOverallConfidence(
    risk: RiskAssessment,
    compliance: ComplianceCheck,
    quality: QualityAnalysis
  ): number {
    // Simple confidence calculation based on completeness of analysis
    const hasRiskFactors = risk.riskFactors.length > 0
    const hasComplianceChecks = compliance.issues.length > 0 || compliance.recommendations.length > 0
    const hasQualityIssues = quality.issues.length > 0
    
    let confidence = 70 // Base confidence
    if (hasRiskFactors) confidence += 10
    if (hasComplianceChecks) confidence += 10
    if (hasQualityIssues) confidence += 10
    
    return Math.min(confidence, 95) // Cap at 95% (never 100%)
  }
  
  private extractKeyFindings(
    risk: RiskAssessment,
    compliance: ComplianceCheck,
    quality: QualityAnalysis
  ): string[] {
    const findings: string[] = []
    
    // Overall risk
    findings.push(`Overall document risk: ${risk.riskLevel} (${risk.overallRiskScore}/10)`)
    
    // Compliance status
    findings.push(`Compliance status: ${compliance.compliant ? 'No major issues' : `${compliance.issues.length} issues identified`}`)
    
    // Quality scores
    findings.push(`Quality scores: Clarity ${quality.clarity}/10, Consistency ${quality.consistency}/10, Completeness ${quality.completeness}/10`)
    
    // Top risk factors
    const highRisks = risk.riskFactors.filter(f => f.severity === 'high' || f.severity === 'critical')
    if (highRisks.length > 0) {
      findings.push(`High priority risks: ${highRisks.length} identified`)
    }
    
    return findings
  }
  
  private extractCriticalIssues(
    risk: RiskAssessment,
    compliance: ComplianceCheck
  ): string[] {
    const issues: string[] = []
    
    // Critical risk factors
    risk.riskFactors
      .filter(f => f.severity === 'critical')
      .forEach(f => issues.push(`CRITICAL RISK: ${f.description}`))
    
    // Critical compliance issues
    compliance.issues
      .filter(i => i.severity === 'critical')
      .forEach(i => issues.push(`COMPLIANCE: ${i.description}`))
    
    return issues
  }
  
  private getLegalDisclaimer(): string {
    return `
IMPORTANT LEGAL DISCLAIMER:

This AI-generated review is ADVISORY ONLY and does not constitute legal advice or legal opinion. This analysis:

- Is based on automated pattern recognition and general legal principles
- May not account for jurisdiction-specific nuances or recent law changes
- Does not replace the professional judgment of a licensed attorney
- Should be reviewed and validated by qualified legal counsel
- May contain errors, omissions, or misinterpretations

ATTORNEY REVIEW REQUIRED before using this document or relying on this analysis for any legal purpose. LexiCore™ and its AI systems do not practice law and cannot provide legal advice. Consult with licensed counsel in the relevant jurisdiction.

© ${new Date().getFullYear()} LexiCore™. All rights reserved.
`.trim()
  }
}
