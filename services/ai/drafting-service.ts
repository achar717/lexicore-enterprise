/**
 * LexiCore™ - AI Drafting Service
 * 
 * Centralized service for AI-powered document drafting
 * Integrates with OpenAI and Gemini providers
 * Uses versioned prompt registry for all AI operations
 */

import { renderPrompt, validateOutput, type DraftingPromptName } from './prompts/drafting-registry'

export interface TemplateMatch {
  templateId: string
  templateName: string
  confidence: number
  reasoning: string
  missingElements: string[]
  customizationComplexity: 'low' | 'medium' | 'high'
}

export interface ClauseRecommendation {
  clauseId: string
  title: string
  reason: string
  riskLevel: number
  notes: string
}

export interface ClauseRecommendations {
  required: ClauseRecommendation[]
  recommended: ClauseRecommendation[]
  optional: ClauseRecommendation[]
  risky: ClauseRecommendation[]
  warnings: string[]
  missingStandardClauses: string[]
}

export interface VariableValue {
  value: string
  confidence: number
  source: 'description' | 'document' | 'matter' | 'default'
  validated: boolean
}

export interface VariableInput {
  variableName: string
  question: string
  exampleValue: string
  format: string
  required: boolean
}

export interface VariableExtraction {
  extracted: Record<string, VariableValue>
  needsInput: VariableInput[]
  warnings: string[]
}

export interface RiskAssessment {
  overallRiskScore: number
  riskFactors: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: string
    description: string
    affectedClauses: string[]
    recommendation: string
  }>
  missingClauses: string[]
  contradictions: string[]
  complianceIssues: string[]
  attorneyReviewRequired: boolean
  reviewPriorities: string[]
}

export interface DocumentAssembly {
  title: string
  content: string
  sections: Array<{
    number: string
    title: string
    content: string
  }>
  placeholders: string[]
  warnings: string[]
  formattingNotes: string[]
}

export class AIDraftingService {
  /**
   * Match user description to templates
   * Uses: drafting.template_match.v1 from registry
   */
  static async matchTemplates(params: {
    userDescription: string
    templates: any[]
    industry?: string
    jurisdiction?: string
    documentType?: string
    aiProvider: any
  }): Promise<{ recommendations: TemplateMatch[] }> {
    try {
      const { system, user, metadata } = renderPrompt('drafting.template_match.v1', {
        intent: JSON.stringify({
          userDescription: params.userDescription,
          industry: params.industry,
          jurisdiction: params.jurisdiction,
          documentType: params.documentType
        }, null, 2),
        templateCatalog: params.templates.map(t => ({
          id: t.id,
          title: t.template_name,
          docType: t.document_type,
          industry: t.industry,
          jurisdiction: t.jurisdiction,
          tags: t.tags || [],
          description: t.description || t.template_name
        }))
      })

      const response = await params.aiProvider.generateText(
        `${system}\n\n${user}`,
        {
          temperature: metadata.temperature,
          maxTokens: metadata.maxTokens,
          responseFormat: 'json'
        }
      )

      console.log('AI Response (first 500 chars):', response.substring(0, 500))

      const parsed = JSON.parse(response)
      console.log('Parsed AI response keys:', Object.keys(parsed))
      
      const validation = validateOutput('drafting.template_match.v1', parsed)
      
      if (!validation.valid) {
        console.error('Template matching validation errors:', validation.errors)
        console.error('Parsed response:', JSON.stringify(parsed, null, 2))
        throw new Error(`Invalid AI response: ${validation.errors.join(', ')}`)
      }
      
      // Check if recommendations exist
      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        console.error('No recommendations in AI response:', parsed)
        throw new Error('AI did not return template recommendations')
      }
      
      // Map to legacy format for compatibility
      return {
        recommendations: parsed.recommendations.map((r: any) => ({
          templateId: r.templateId,
          templateName: r.templateName || '',
          confidence: r.score,
          reasoning: r.reasons?.join('. ') || '',
          missingElements: r.missingInfo || [],
          customizationComplexity: r.customizationComplexity || 'medium'
        }))
      }
    } catch (error: any) {
      console.error('Template matching error:', error)
      throw new Error(`AI template matching failed: ${error.message || error}`)
    }
  }

  /**
   * Recommend clauses for selected template
   * Uses: drafting.clause_recommend.v1 from registry
   */
  static async recommendClauses(params: {
    templateName: string
    documentType: string
    industry: string
    jurisdiction: string
    userDescription: string
    availableClauses: any[]
    requiredClauses?: string[]
    standardClauses?: string[]
    optionalClauses?: string[]
    aiProvider: any
  }): Promise<ClauseRecommendations> {
    const { system, user, metadata } = renderPrompt('drafting.clause_recommend.v1', {
      intent: JSON.stringify({
        userDescription: params.userDescription,
        documentType: params.documentType,
        industry: params.industry,
        jurisdiction: params.jurisdiction
      }, null, 2),
      templateSummary: JSON.stringify({
        name: params.templateName,
        requiredClauses: params.requiredClauses || [],
        standardClauses: params.standardClauses || [],
        optionalClauses: params.optionalClauses || []
      }, null, 2),
      clauseCatalog: params.availableClauses.map(c => ({
        id: c.id,
        title: c.clause_title || c.title,
        category: c.category,
        tags: c.tags || [],
        summary: c.standard_text?.substring(0, 200) + '...',
        riskHints: `Risk Level: ${c.risk_level || 'Unknown'}, Stance: ${c.stance || 'neutral'}`
      }))
    })

    const response = await params.aiProvider.generateText(
      `${system}\n\n${user}`,
      {
        temperature: metadata.temperature,
        maxTokens: metadata.maxTokens,
        responseFormat: 'json'
      }
    )

    try {
      const parsed = JSON.parse(response)
      const validation = validateOutput('drafting.clause_recommend.v1', parsed)
      
      if (!validation.valid) {
        console.error('Clause recommendation validation errors:', validation.errors)
        throw new Error(`Invalid AI response: ${validation.errors.join(', ')}`)
      }
      
      // Map to legacy format
      return {
        required: parsed.required.map((c: any) => ({
          clauseId: c.clauseId,
          title: c.clauseTitle || '',
          reason: c.reason,
          riskLevel: c.riskScore,
          notes: c.jurisdictionNote || ''
        })),
        recommended: parsed.recommended.map((c: any) => ({
          clauseId: c.clauseId,
          title: c.clauseTitle || '',
          reason: c.reason,
          riskLevel: c.riskScore,
          notes: ''
        })),
        optional: parsed.optional.map((c: any) => ({
          clauseId: c.clauseId,
          title: c.clauseTitle || '',
          reason: c.reason,
          riskLevel: c.riskScore,
          notes: ''
        })),
        risky: parsed.risky.map((c: any) => ({
          clauseId: c.clauseId,
          title: c.clauseTitle || '',
          reason: c.reason,
          riskLevel: c.riskScore,
          notes: c.reviewNote
        })),
        warnings: [parsed.overallRiskSummary],
        missingStandardClauses: []
      }
    } catch (error) {
      console.error('Failed to parse clause recommendation response:', error)
      throw new Error('AI clause recommendation failed')
    }
  }

  /**
   * Extract and autofill variables
   * Uses: drafting.variable_extract.v1 from registry
   */
  static async extractVariables(params: {
    templateName: string
    userDescription: string
    selectedClauses: any[]
    templateVariables: string[]
    sourceDocuments?: string[]
    matterInfo?: any
    previousDrafts?: any[]
    aiProvider: any
  }): Promise<VariableExtraction> {
    const { system, user, metadata } = renderPrompt('drafting.variable_extract.v1', {
      templateVariables: params.templateVariables.map(v => ({
        key: v,
        label: v,
        type: 'text',
        required: true
      })),
      selectedClausesVariables: params.selectedClauses.map(c => ({
        clauseId: c.id,
        variables: [] // Extract from clause text if needed
      })),
      userText: params.userDescription,
      extractedSources: params.sourceDocuments || []
    })

    const response = await params.aiProvider.generateText(
      `${system}\n\n${user}`,
      {
        temperature: metadata.temperature,
        maxTokens: metadata.maxTokens,
        responseFormat: 'json'
      }
    )

    try {
      const parsed = JSON.parse(response)
      const validation = validateOutput('drafting.variable_extract.v1', parsed)
      
      if (!validation.valid) {
        console.error('Variable extraction validation errors:', validation.errors)
        throw new Error(`Invalid AI response: ${validation.errors.join(', ')}`)
      }
      
      // Map to legacy format
      const extracted: Record<string, VariableValue> = {}
      for (const [key, value] of Object.entries(parsed.autofill)) {
        if (value !== null) {
          extracted[key] = {
            value: String(value),
            confidence: 85, // Default confidence
            source: 'description',
            validated: true
          }
        }
      }
      
      return {
        extracted,
        needsInput: parsed.missing.map((m: any) => ({
          variableName: m.key,
          question: m.why,
          exampleValue: '',
          format: 'text',
          required: true
        })),
        warnings: parsed.assumptions
      }
    } catch (error) {
      console.error('Failed to parse variable extraction response:', error)
      throw new Error('AI variable extraction failed')
    }
  }

  /**
   * Assess legal risks
   * Uses: drafting.risk_summary.v1 from registry
   */
  static async assessRisks(params: {
    documentType: string
    industry: string
    jurisdiction: string
    parties: any[]
    selectedClauses: any[]
    documentContent: string
    aiProvider: any
  }): Promise<RiskAssessment> {
    const { system, user, metadata } = renderPrompt('drafting.risk_summary.v1', {
      jurisdiction: params.jurisdiction,
      clauses: params.selectedClauses.map(c => ({
        id: c.id,
        title: c.clause_title || c.title,
        text: c.standard_text || c.text,
        category: c.category,
        riskLevel: c.risk_level
      })),
      variables: {} // Can pass document variables if needed
    })

    const response = await params.aiProvider.generateText(
      `${system}\n\n${user}`,
      {
        temperature: metadata.temperature,
        maxTokens: metadata.maxTokens,
        responseFormat: 'json'
      }
    )

    try {
      const parsed = JSON.parse(response)
      const validation = validateOutput('drafting.risk_summary.v1', parsed)
      
      if (!validation.valid) {
        console.error('Risk assessment validation errors:', validation.errors)
        throw new Error(`Invalid AI response: ${validation.errors.join(', ')}`)
      }
      
      // Map to legacy format
      const overallRiskScore = Math.max(...parsed.riskItems.map((r: any) => r.riskScore))
      
      return {
        overallRiskScore,
        riskFactors: parsed.riskItems.map((r: any) => ({
          severity: r.severity || 'medium',
          category: r.category || 'general',
          description: r.explanation,
          affectedClauses: [],
          recommendation: r.mitigation
        })),
        missingClauses: [],
        contradictions: [],
        complianceIssues: [],
        attorneyReviewRequired: parsed.attorneyReviewRequired || overallRiskScore >= 7,
        reviewPriorities: parsed.riskItems
          .filter((r: any) => r.riskScore >= 7)
          .map((r: any) => r.title)
      }
    } catch (error) {
      console.error('Failed to parse risk assessment response:', error)
      throw new Error('AI risk assessment failed')
    }
  }

  /**
   * Assemble final document
   * Uses: drafting.assemble_preview.v1 from registry
   */
  static async assembleDocument(params: {
    templateName: string
    documentType: string
    selectedClauses: any[]
    variables: Record<string, any>
    aiProvider: any
  }): Promise<DocumentAssembly> {
    const { system, user, metadata } = renderPrompt('drafting.assemble_preview.v1', {
      templateTextOrStructure: {
        name: params.templateName,
        type: params.documentType
      },
      clausesTextOrStructure: params.selectedClauses.map(c => ({
        id: c.id,
        title: c.clause_title || c.title,
        text: c.standard_text || c.text,
        order: c.order || 0
      })),
      variables: params.variables,
      parties: Object.keys(params.variables)
        .filter(k => k.toLowerCase().includes('party') || k.toLowerCase().includes('name'))
        .map(k => ({ name: params.variables[k], role: k }))
    })

    const response = await params.aiProvider.generateText(
      `${system}\n\n${user}`,
      {
        temperature: metadata.temperature,
        maxTokens: metadata.maxTokens,
        responseFormat: 'json'
      }
    )

    try {
      const parsed = JSON.parse(response)
      const validation = validateOutput('drafting.assemble_preview.v1', parsed)
      
      if (!validation.valid) {
        console.error('Document assembly validation errors:', validation.errors)
        throw new Error(`Invalid AI response: ${validation.errors.join(', ')}`)
      }
      
      // Combine sections into content
      const content = parsed.sections
        .map((s: any) => `${s.number ? s.number + '. ' : ''}${s.heading}\n\n${s.content}`)
        .join('\n\n')
      
      return {
        title: parsed.documentTitle,
        content,
        sections: parsed.sections.map((s: any) => ({
          number: s.number || '',
          title: s.heading,
          content: s.content
        })),
        placeholders: parsed.unresolvedPlaceholders,
        warnings: parsed.warnings || [],
        formattingNotes: []
      }
    } catch (error) {
      console.error('Failed to parse document assembly response:', error)
      throw new Error('AI document assembly failed')
    }
  }
}
