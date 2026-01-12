// LexiCore™ - Regulatory Document Classification Service
// Phase 2: Document Ingestion & Classification

import type { D1Database } from '@cloudflare/workers-types'

/**
 * Document classification result
 */
export interface RegulatoryClassificationResult {
  document_type: string
  confidence_score: number
  evidence_text: string
  evidence_page: number
  secondary_classification?: string
  classification_rationale: string
  requires_attorney_review: boolean
}

/**
 * Authority identification result
 */
export interface AuthorityIdentificationResult {
  primary_authority: string
  primary_authority_abbreviation?: string
  secondary_authorities: string[]
  authority_evidence_text: string
  authority_evidence_page: number
  authority_confidence: number
  authority_type: 'federal' | 'state' | 'self_regulatory' | 'multiple'
  specific_division?: string
  requires_attorney_review: boolean
}

/**
 * Citation extraction result
 */
export interface CitationExtractionResult {
  citation_text: string
  citation_type: 'federal_statute' | 'federal_regulation' | 'state_statute' | 'agency_rule' | 'other'
  citation_full_name?: string
  context_before: string
  context_after: string
  page_number: number
  section_heading?: string
  confidence: number
  requires_attorney_review: boolean
}

/**
 * Deadline extraction result
 */
export interface DeadlineExtractionResult {
  deadline_date: string
  deadline_date_normalized: string
  deadline_type: 'response' | 'production' | 'compliance' | 'procedural' | 'other'
  deadline_description: string
  business_days_specified: boolean
  extension_provisions?: string
  page_number: number
  confidence: number
  urgency_level: 'immediate' | 'high' | 'medium' | 'low'
  requires_attorney_review: boolean
}

/**
 * Document request extraction result
 */
export interface DocumentRequestResult {
  request_number: string
  request_text: string
  request_subparts: string[]
  date_range_start?: string
  date_range_end?: string
  document_types_specified: string[]
  custodians_specified: string[]
  format_requirements?: string
  definitions_applicable: string[]
  page_number: number
  estimated_scope: 'narrow' | 'moderate' | 'broad' | 'unclear'
  confidence: number
  requires_attorney_review: boolean
}

/**
 * Complete document analysis result
 */
export interface RegulatoryDocumentAnalysis {
  document_id: string
  classification: RegulatoryClassificationResult
  authority: AuthorityIdentificationResult
  citations: CitationExtractionResult[]
  deadlines: DeadlineExtractionResult[]
  document_requests: DocumentRequestResult[]
  overall_confidence: number
  requires_attorney_review: boolean
  analysis_timestamp: string
  prompt_versions: {
    classification: string
    authority: string
    citation: string
    deadline: string
    request: string
  }
}

/**
 * Regulatory Document Classification Service
 * Handles document type detection, authority identification, and extraction
 */
export class RegulatoryClassificationService {
  private db: D1Database
  private geminiApiKey: string

  constructor(db: D1Database, geminiApiKey: string) {
    this.db = db
    this.geminiApiKey = geminiApiKey
  }

  /**
   * Classify regulatory document and extract metadata
   */
  async classifyDocument(
    documentId: string,
    documentText: string,
    matterId: string
  ): Promise<RegulatoryDocumentAnalysis> {
    // Get prompts from registry
    const prompts = await this.getRegularizationPrompts()

    // Run parallel classification and extraction
    const [
      classification,
      authority,
      citations,
      deadlines,
      documentRequests
    ] = await Promise.all([
      this.classifyDocumentType(documentText, prompts.classification),
      this.identifyAuthority(documentText, prompts.authority),
      this.extractCitations(documentText, prompts.citation),
      this.extractDeadlines(documentText, prompts.deadline),
      this.extractDocumentRequests(documentText, prompts.request)
    ])

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence([
      classification.confidence_score,
      authority.authority_confidence,
      ...citations.map(c => c.confidence),
      ...deadlines.map(d => d.confidence),
      ...documentRequests.map(r => r.confidence)
    ])

    // Determine if attorney review required
    const requiresAttorneyReview = 
      classification.requires_attorney_review ||
      authority.requires_attorney_review ||
      citations.some(c => c.requires_attorney_review) ||
      deadlines.some(d => d.requires_attorney_review) ||
      documentRequests.some(r => r.requires_attorney_review) ||
      overallConfidence < 0.85

    const analysis: RegulatoryDocumentAnalysis = {
      document_id: documentId,
      classification,
      authority,
      citations,
      deadlines,
      document_requests: documentRequests,
      overall_confidence: overallConfidence,
      requires_attorney_review: requiresAttorneyReview,
      analysis_timestamp: new Date().toISOString(),
      prompt_versions: {
        classification: prompts.classification.version,
        authority: prompts.authority.version,
        citation: prompts.citation.version,
        deadline: prompts.deadline.version,
        request: prompts.request.version
      }
    }

    // Store classification results in database
    await this.storeClassificationResults(matterId, documentId, analysis)

    return analysis
  }

  /**
   * Get regulatory prompts from database
   */
  private async getRegularizationPrompts() {
    const prompts = await this.db
      .prepare(`
        SELECT prompt_id, prompt_text, version
        FROM prompt_registry
        WHERE prompt_id IN ('REG-DOC-001', 'REG-DOC-002', 'REG-DOC-003', 'REG-DOC-004', 'REG-DOC-005')
          AND is_active = 1
          AND approval_status = 'approved'
      `)
      .all()

    if (!prompts.results || prompts.results.length !== 5) {
      throw new Error('Regulatory classification prompts not found or not approved')
    }

    const promptMap = new Map(prompts.results.map((p: any) => [p.prompt_id, p]))

    return {
      classification: promptMap.get('REG-DOC-001') as any,
      authority: promptMap.get('REG-DOC-002') as any,
      citation: promptMap.get('REG-DOC-003') as any,
      deadline: promptMap.get('REG-DOC-004') as any,
      request: promptMap.get('REG-DOC-005') as any
    }
  }

  /**
   * Classify document type using Gemini
   */
  private async classifyDocumentType(
    documentText: string,
    prompt: any
  ): Promise<RegulatoryClassificationResult> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'classification'
    )

    const result = JSON.parse(response)
    result.requires_attorney_review = result.confidence_score < 0.85

    return result
  }

  /**
   * Identify regulatory authority using Gemini
   */
  private async identifyAuthority(
    documentText: string,
    prompt: any
  ): Promise<AuthorityIdentificationResult> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'authority_identification'
    )

    const result = JSON.parse(response)
    result.requires_attorney_review = result.authority_confidence < 0.90

    return result
  }

  /**
   * Extract statute and regulation citations
   */
  private async extractCitations(
    documentText: string,
    prompt: any
  ): Promise<CitationExtractionResult[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'citation_extraction'
    )

    const citations = JSON.parse(response)
    return citations.map((c: any) => ({
      ...c,
      requires_attorney_review: c.confidence < 0.95
    }))
  }

  /**
   * Extract deadlines and dates
   */
  private async extractDeadlines(
    documentText: string,
    prompt: any
  ): Promise<DeadlineExtractionResult[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'deadline_extraction'
    )

    const deadlines = JSON.parse(response)
    return deadlines.map((d: any) => ({
      ...d,
      requires_attorney_review: d.confidence < 0.90
    }))
  }

  /**
   * Extract document requests
   */
  private async extractDocumentRequests(
    documentText: string,
    prompt: any
  ): Promise<DocumentRequestResult[]> {
    const response = await this.callGemini(
      prompt.prompt_text,
      documentText,
      'request_extraction'
    )

    const requests = JSON.parse(response)
    return requests.map((r: any) => ({
      ...r,
      requires_attorney_review: r.confidence < 0.90 || r.estimated_scope === 'unclear'
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

    // Truncate document if too long (Gemini has token limits)
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
            text: `${systemPrompt}\n\n---DOCUMENT TO ANALYZE---\n${truncatedText}\n\n---END DOCUMENT---\n\nProvide your analysis in the specified JSON format.` 
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

    // Try to find JSON object directly
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/)
    if (jsonObjectMatch) {
      return jsonObjectMatch[0]
    }

    return text
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(scores: number[]): number {
    if (scores.length === 0) return 0
    const sum = scores.reduce((a, b) => a + b, 0)
    return sum / scores.length
  }

  /**
   * Store classification results in database
   */
  private async storeClassificationResults(
    matterId: string,
    documentId: string,
    analysis: RegulatoryDocumentAnalysis
  ): Promise<void> {
    // Store document classification
    await this.db
      .prepare(`
        INSERT INTO regulatory_document_classification (
          document_id,
          matter_id,
          regulatory_doc_type,
          sub_classification,
          issuing_authority,
          statutes_cited,
          regulations_cited,
          classification_confidence,
          classification_evidence,
          classified_at,
          requires_attorney_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        documentId,
        matterId,
        analysis.classification.document_type,
        analysis.classification.secondary_classification || null,
        analysis.authority.primary_authority,
        JSON.stringify(analysis.citations.filter(c => c.citation_type.includes('statute')).map(c => c.citation_text)),
        JSON.stringify(analysis.citations.filter(c => c.citation_type.includes('regulation')).map(c => c.citation_text)),
        analysis.overall_confidence,
        JSON.stringify({
          classification_evidence: analysis.classification.evidence_text,
          authority_evidence: analysis.authority.authority_evidence_text
        }),
        new Date().toISOString(),
        analysis.requires_attorney_review ? 1 : 0
      )
      .run()

    // Store extractions for each deadline
    for (const deadline of analysis.deadlines) {
      await this.storeExtraction(
        matterId,
        documentId,
        'deadline',
        deadline.deadline_description,
        deadline.confidence,
        deadline.page_number,
        JSON.stringify(deadline)
      )
    }

    // Store extractions for each document request
    for (const request of analysis.document_requests) {
      await this.storeExtraction(
        matterId,
        documentId,
        'document_request',
        request.request_text,
        request.confidence,
        request.page_number,
        JSON.stringify(request)
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
    metadata: string
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
          attorney_approved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `)
      .bind(
        matterId,
        documentId,
        extractionType,
        extractedValue,
        confidence,
        pageNumber,
        metadata,
        new Date().toISOString()
      )
      .run()
  }
}
