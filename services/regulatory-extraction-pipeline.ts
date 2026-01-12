// LexiCore™ - Regulatory Extraction Pipeline Service
// Phase 3: Regulatory-Specific GenSpark Prompt Pipelines

import type { D1Database } from '@cloudflare/workers-types'

/**
 * Alleged conduct extraction result
 */
export interface AllegedConductExtraction {
  alleged_conduct_quote: string
  page_number: number
  paragraph_number?: string
  section_heading?: string
  date_of_alleged_conduct?: string
  parties_involved: string[]
  confidence: number
  extraction_rationale: string
  requires_attorney_review: boolean
}

/**
 * Violation extraction result
 */
export interface ViolationExtraction {
  violation_statement_quote: string
  statute_or_regulation: string
  conduct_connected?: string
  page_number: number
  paragraph_number?: string
  section_heading?: string
  violation_type: 'statutory' | 'regulatory' | 'contractual' | 'policy' | 'unclear'
  confidence: number
  extraction_rationale: string
  requires_attorney_review: boolean
}

/**
 * Obligation extraction result
 */
export interface ObligationExtraction {
  obligation_quote: string
  obligation_type: 'reporting' | 'production' | 'remediation' | 'monitoring' | 'confidentiality' | 'other'
  deadline?: string
  deadline_type: 'specific_date' | 'relative' | 'ongoing' | 'none_specified'
  responsible_party?: string
  page_number: number
  paragraph_number?: string
  section_heading?: string
  recurring: boolean
  consequences_stated?: string
  confidence: number
  extraction_rationale: string
  requires_attorney_review: boolean
}

/**
 * Request scope analysis result
 */
export interface RequestScopeAnalysis {
  request_number: string
  request_text_verbatim: string
  date_range: {
    start?: string
    end?: string
    type: 'specific' | 'relative' | 'ongoing' | 'not_specified'
  }
  custodians: string[]
  document_types: string[]
  subject_matter_scope: string
  definitions_applicable: string[]
  format_requirements?: string
  scope_assessment: 'narrow' | 'moderate' | 'broad' | 'ambiguous'
  scope_rationale: string
  page_number: number
  confidence: number
  requires_attorney_review: boolean
}

/**
 * Remediation requirement extraction result
 */
export interface RemediationExtraction {
  remediation_requirement_quote: string
  remediation_type: 'policy' | 'system' | 'training' | 'personnel' | 'monitoring' | 'other'
  completion_deadline?: string
  deadline_type?: 'specific_date' | 'relative' | 'phased' | 'ongoing'
  implementation_phases: string[]
  verification_required?: string
  reporting_requirement?: string
  page_number: number
  paragraph_number?: string
  section_heading?: string
  priority_indicated: 'immediate' | 'high' | 'standard' | 'not_specified'
  consequences_of_non_compliance?: string
  confidence: number
  extraction_rationale: string
  requires_attorney_review: boolean
}

/**
 * Complete extraction pipeline result
 */
export interface RegulatoryExtractionResult {
  document_id: string
  matter_id: string
  alleged_conduct: AllegedConductExtraction[]
  violations: ViolationExtraction[]
  obligations: ObligationExtraction[]
  request_scope: RequestScopeAnalysis[]
  remediation: RemediationExtraction[]
  overall_confidence: number
  total_extractions: number
  extractions_requiring_review: number
  extraction_timestamp: string
  prompt_versions: {
    alleged_conduct: string
    violations: string
    obligations: string
    request_scope: string
    remediation: string
  }
}

/**
 * Regulatory Extraction Pipeline Service
 * Chains multiple extraction prompts for comprehensive document analysis
 */
export class RegulatoryExtractionPipeline {
  private db: D1Database
  private geminiApiKey: string

  constructor(db: D1Database, geminiApiKey: string) {
    this.db = db
    this.geminiApiKey = geminiApiKey
  }

  /**
   * Execute full extraction pipeline on a regulatory document
   */
  async extractFacts(
    documentId: string,
    matterId: string,
    documentText: string
  ): Promise<RegulatoryExtractionResult> {
    // Get extraction prompts from registry
    const prompts = await this.getExtractionPrompts()

    // Run parallel extractions
    const [
      allegedConduct,
      violations,
      obligations,
      requestScope,
      remediation
    ] = await Promise.all([
      this.extractAllegedConduct(documentText, prompts.alleged_conduct),
      this.extractViolations(documentText, prompts.violations),
      this.extractObligations(documentText, prompts.obligations),
      this.extractRequestScope(documentText, prompts.request_scope),
      this.extractRemediation(documentText, prompts.remediation)
    ])

    // Calculate overall statistics
    const totalExtractions = 
      allegedConduct.length + 
      violations.length + 
      obligations.length + 
      requestScope.length + 
      remediation.length

    const extractionsRequiringReview = 
      allegedConduct.filter(e => e.requires_attorney_review).length +
      violations.filter(e => e.requires_attorney_review).length +
      obligations.filter(e => e.requires_attorney_review).length +
      requestScope.filter(e => e.requires_attorney_review).length +
      remediation.filter(e => e.requires_attorney_review).length

    // Calculate overall confidence
    const allConfidences = [
      ...allegedConduct.map(e => e.confidence),
      ...violations.map(e => e.confidence),
      ...obligations.map(e => e.confidence),
      ...requestScope.map(e => e.confidence),
      ...remediation.map(e => e.confidence)
    ]

    const overallConfidence = allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0

    const result: RegulatoryExtractionResult = {
      document_id: documentId,
      matter_id: matterId,
      alleged_conduct: allegedConduct,
      violations: violations,
      obligations: obligations,
      request_scope: requestScope,
      remediation: remediation,
      overall_confidence: overallConfidence,
      total_extractions: totalExtractions,
      extractions_requiring_review: extractionsRequiringReview,
      extraction_timestamp: new Date().toISOString(),
      prompt_versions: {
        alleged_conduct: prompts.alleged_conduct.version,
        violations: prompts.violations.version,
        obligations: prompts.obligations.version,
        request_scope: prompts.request_scope.version,
        remediation: prompts.remediation.version
      }
    }

    // Store extraction results in database
    await this.storeExtractionResults(result)

    return result
  }

  /**
   * Get extraction prompts from database
   */
  private async getExtractionPrompts() {
    const prompts = await this.db
      .prepare(`
        SELECT id, prompt_text, prompt_version as version
        FROM prompt_registry
        WHERE id IN ('REG-EXTRACT-001', 'REG-EXTRACT-002', 'REG-EXTRACT-003', 'REG-EXTRACT-004', 'REG-EXTRACT-005')
          AND is_active = 1
          AND status = 'approved'
      `)
      .all()

    if (!prompts.results || prompts.results.length !== 5) {
      throw new Error('Regulatory extraction prompts not found or not approved')
    }

    const promptMap = new Map(prompts.results.map((p: any) => [p.id, p]))

    return {
      alleged_conduct: promptMap.get('REG-EXTRACT-001') as any,
      violations: promptMap.get('REG-EXTRACT-002') as any,
      obligations: promptMap.get('REG-EXTRACT-003') as any,
      request_scope: promptMap.get('REG-EXTRACT-004') as any,
      remediation: promptMap.get('REG-EXTRACT-005') as any
    }
  }

  /**
   * Extract alleged conduct using Gemini
   */
  private async extractAllegedConduct(
    documentText: string,
    prompt: any
  ): Promise<AllegedConductExtraction[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'alleged_conduct_extraction'
    )

    const extractions = JSON.parse(response)
    return extractions.map((e: any) => ({
      ...e,
      requires_attorney_review: e.confidence < 0.85
    }))
  }

  /**
   * Extract violations using Gemini
   */
  private async extractViolations(
    documentText: string,
    prompt: any
  ): Promise<ViolationExtraction[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'violation_extraction'
    )

    const extractions = JSON.parse(response)
    return extractions.map((e: any) => ({
      ...e,
      requires_attorney_review: e.confidence < 0.90
    }))
  }

  /**
   * Extract obligations using Gemini
   */
  private async extractObligations(
    documentText: string,
    prompt: any
  ): Promise<ObligationExtraction[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'obligation_extraction'
    )

    const extractions = JSON.parse(response)
    return extractions.map((e: any) => ({
      ...e,
      requires_attorney_review: e.confidence < 0.85
    }))
  }

  /**
   * Extract request scope using Gemini
   */
  private async extractRequestScope(
    documentText: string,
    prompt: any
  ): Promise<RequestScopeAnalysis[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'request_scope_analysis'
    )

    const analyses = JSON.parse(response)
    return analyses.map((e: any) => ({
      ...e,
      requires_attorney_review: e.confidence < 0.85 || e.scope_assessment === 'ambiguous'
    }))
  }

  /**
   * Extract remediation requirements using Gemini
   */
  private async extractRemediation(
    documentText: string,
    prompt: any
  ): Promise<RemediationExtraction[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'remediation_extraction'
    )

    const extractions = JSON.parse(response)
    return extractions.map((e: any) => ({
      ...e,
      requires_attorney_review: e.confidence < 0.90
    }))
  }

  /**
   * Call Gemini API for extraction
   */
  private async callGemini(
    systemPrompt: string,
    documentText: string,
    extractionType: string
  ): Promise<string> {
    const model = 'gemini-1.5-flash-latest'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`

    // Truncate document if too long
    const maxChars = 30000
    const truncatedText = documentText.length > maxChars 
      ? documentText.substring(0, maxChars) + '\n\n[Document truncated for analysis]'
      : documentText

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ 
            text: `${systemPrompt}\n\n---REGULATORY DOCUMENT TO ANALYZE---\n${truncatedText}\n\n---END DOCUMENT---\n\nProvide your extraction in the specified JSON array format.` 
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistency
          maxOutputTokens: 8000,
          topP: 0.95,
          topK: 40
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE'
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${error}`)
    }

    const data = await response.json() as any
    const text = data.candidates[0].content.parts[0].text

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      return jsonMatch[1].trim()
    }

    // Try to find JSON array directly
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/)
    if (jsonArrayMatch) {
      return jsonArrayMatch[0]
    }

    return text
  }

  /**
   * Store extraction results in database
   */
  private async storeExtractionResults(result: RegulatoryExtractionResult): Promise<void> {
    // Store alleged conduct extractions
    for (const extraction of result.alleged_conduct) {
      await this.storeExtraction(
        result.matter_id,
        result.document_id,
        'alleged_conduct',
        extraction.alleged_conduct_quote,
        extraction.confidence,
        extraction.page_number,
        JSON.stringify(extraction),
        extraction.requires_attorney_review
      )
    }

    // Store violation extractions
    for (const extraction of result.violations) {
      await this.storeExtraction(
        result.matter_id,
        result.document_id,
        'violation',
        extraction.violation_statement_quote,
        extraction.confidence,
        extraction.page_number,
        JSON.stringify(extraction),
        extraction.requires_attorney_review
      )
    }

    // Store obligation extractions
    for (const extraction of result.obligations) {
      await this.storeExtraction(
        result.matter_id,
        result.document_id,
        'obligation',
        extraction.obligation_quote,
        extraction.confidence,
        extraction.page_number,
        JSON.stringify(extraction),
        extraction.requires_attorney_review
      )
    }

    // Store request scope analyses
    for (const analysis of result.request_scope) {
      await this.storeExtraction(
        result.matter_id,
        result.document_id,
        'request_scope',
        analysis.request_text_verbatim,
        analysis.confidence,
        analysis.page_number,
        JSON.stringify(analysis),
        analysis.requires_attorney_review
      )
    }

    // Store remediation extractions
    for (const extraction of result.remediation) {
      await this.storeExtraction(
        result.matter_id,
        result.document_id,
        'remediation',
        extraction.remediation_requirement_quote,
        extraction.confidence,
        extraction.page_number,
        JSON.stringify(extraction),
        extraction.requires_attorney_review
      )
    }
  }

  /**
   * Store individual extraction in regulatory_extractions table
   */
  private async storeExtraction(
    matterId: string,
    documentId: string,
    extractionType: string,
    extractedValue: string,
    confidence: number,
    pageNumber: number,
    metadata: string,
    requiresReview: boolean
  ): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO regulatory_extractions (
          matter_id,
          document_id,
          extraction_type,
          extracted_value,
          confidence_score,
          source_page,
          extraction_metadata,
          extracted_at,
          attorney_reviewed,
          attorney_approved,
          requires_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
      `)
      .bind(
        matterId,
        documentId,
        extractionType,
        extractedValue,
        confidence,
        pageNumber,
        metadata,
        new Date().toISOString(),
        requiresReview ? 1 : 0
      )
      .run()
  }
}
