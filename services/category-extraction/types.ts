/**
 * LexiCore™ - Category-Based Extraction Types
 * 
 * Type definitions for category-based document extraction system
 * Supports all 8 legal document categories across all practice areas
 */

// ============================================================================
// CORE EXTRACTION TYPES
// ============================================================================

export type DocumentCategory = 
  | 'ADR' 
  | 'Appellate' 
  | 'Case Management' 
  | 'Discovery' 
  | 'Motion' 
  | 'Pleading' 
  | 'Settlement' 
  | 'Trial'

export interface ExtractionRequest {
  extractionType: string         // type_code from taxonomy (e.g., 'CASE-CMO')
  typeName?: string              // Human-readable name (e.g., 'Case Management Order')
  category?: DocumentCategory    // Document category
  documentText: string           // Full document text
  documentId?: string            // Optional document ID for logging
  matterId?: string              // Optional matter ID for context
  userId?: string                // Optional user ID for audit
  aiProvider?: 'openai' | 'gemini'  // AI provider preference
  apiKeys?: {                    // API keys for AI providers
    openai?: string
    gemini?: string
  }
  options?: ExtractionOptions    // Additional options
}

export interface ExtractionOptions {
  maxTokens?: number             // Max tokens for AI response (default: 4000)
  temperature?: number           // AI temperature (default: 0.1)
  includeConfidence?: boolean    // Include confidence scores (default: true)
  extractAllPages?: boolean      // Extract from all pages vs sample (default: false)
  maxCharacters?: number         // Max characters to process (default: 50000)
}

export interface ExtractionResult {
  success: boolean
  extractionId?: string
  data: ExtractedData
  metadata: ExtractionMetadata
  warnings?: string[]
  errors?: string[]
}

export interface ExtractionMetadata {
  extractionType: string
  category: DocumentCategory
  aiModel: string
  aiProvider: string
  processingTimeMs: number
  tokensUsed: number
  confidenceScore: number
  extractedAt: string
  extractedBy?: string
}

// ============================================================================
// EXTRACTED DATA STRUCTURES
// ============================================================================

/**
 * Common Case Information (extracted for ALL categories)
 */
export interface CommonCaseInfo {
  caseNumber: ExtractedField<string>
  parties: {
    plaintiffs: string[]
    defendants: string[]
    verbatim: string
    page: number
    confidence: number
  }
  jurisdiction: {
    court: string
    venue: string
    verbatim: string
    page: number
    confidence: number
  }
}

/**
 * Base extracted data (all categories extend this)
 */
export interface ExtractedData extends CommonCaseInfo {
  documentType?: string
  dates?: string[]
  categorySpecific?: any  // Category-specific fields
}

/**
 * Generic extracted field with metadata
 */
export interface ExtractedField<T> {
  value: T
  verbatim: string
  page: number
  confidence: number
}

/**
 * Extracted array item with metadata
 */
export interface ExtractedArrayItem {
  verbatim: string
  page: number
  confidence: number
}

// ============================================================================
// CATEGORY-SPECIFIC DATA STRUCTURES
// ============================================================================

/**
 * Case Management Category Data
 */
export interface CaseManagementData extends ExtractedData {
  categorySpecific: {
    orderDetails: {
      orderType: string
      orderDate: string
      issuedBy: string
      verbatim: string
      page: number
      confidence: number
    }
    scheduleItems: Array<{
      event: string
      date: string
      party: string
      verbatim: string
      page: number
      confidence: number
    }>
    requirements: Array<{
      requirement: string
      applicableTo: string
      deadline?: string
      verbatim: string
      page: number
      confidence: number
    }>
    rulings: Array<{
      ruling: string
      verbatim: string
      page: number
      confidence: number
    }>
    attachments?: Array<{
      attachment: string
      description: string
      page: number
    }>
  }
}

/**
 * Motion Category Data
 */
export interface MotionData extends ExtractedData {
  categorySpecific: {
    motionDetails: {
      motionType: string
      filingDate: string
      filedBy: string
      verbatim: string
      page: number
      confidence: number
    }
    relief: {
      requested: string
      verbatim: string
      page: number
      confidence: number
    }
    grounds: Array<{
      ground: string
      legalAuthority?: string
      verbatim: string
      page: number
      confidence: number
    }>
    arguments: Array<{
      argument: string
      verbatim: string
      page: number
      confidence: number
    }>
    supportingEvidence: Array<{
      evidence: string
      description: string
      page: number
    }>
    proposedOrder?: {
      included: boolean
      orderText?: string
      page?: number
    }
  }
}

/**
 * ADR Category Data
 */
export interface ADRData extends ExtractedData {
  categorySpecific: {
    adrDetails: {
      documentType: string
      adrType: 'Arbitration' | 'Mediation' | 'Other'
      dateExecuted?: string
      verbatim: string
      page: number
      confidence: number
    }
    adrProviders: Array<{
      name: string
      role: string
      organization?: string
      verbatim: string
      page: number
      confidence: number
    }>
    terms: Array<{
      term: string
      description: string
      verbatim: string
      page: number
      confidence: number
    }>
    decisions?: Array<{
      decision: string
      award?: string
      inFavorOf?: string
      verbatim: string
      page: number
      confidence: number
    }>
    signatures: Array<{
      signatory: string
      capacity: string
      dateSigned?: string
      page: number
    }>
  }
}

/**
 * Trial Category Data
 */
export interface TrialData extends ExtractedData {
  categorySpecific: {
    trialDetails: {
      trialDate?: string
      trialType: string
      judge?: string
      verbatim: string
      page: number
      confidence: number
    }
    witnesses: Array<{
      name: string
      role: string
      testimony?: string
      verbatim: string
      page: number
      confidence: number
    }>
    exhibits: Array<{
      exhibitId: string
      description: string
      admittedBy?: string
      verbatim: string
      page: number
    }>
    verdict?: {
      verdict: string
      inFavorOf?: string
      damages?: string
      verbatim: string
      page: number
      confidence: number
    }
    findings: Array<{
      finding: string
      verbatim: string
      page: number
      confidence: number
    }>
  }
}

/**
 * Appellate Category Data
 */
export interface AppellateData extends ExtractedData {
  categorySpecific: {
    appealDetails: {
      appealFrom: string
      appellant: string
      appellee: string
      filingDate?: string
      verbatim: string
      page: number
      confidence: number
    }
    appealGrounds: Array<{
      ground: string
      standardOfReview?: string
      verbatim: string
      page: number
      confidence: number
    }>
    disposition: {
      decision: string
      reasoning?: string
      verbatim: string
      page: number
      confidence: number
    }
    mandate?: {
      mandateDate?: string
      mandateText: string
      page: number
    }
  }
}

/**
 * Settlement Category Data
 */
export interface SettlementData extends ExtractedData {
  categorySpecific: {
    settlementDetails: {
      settlementType: string
      settlementDate?: string
      verbatim: string
      page: number
      confidence: number
    }
    terms: Array<{
      term: string
      description: string
      verbatim: string
      page: number
      confidence: number
    }>
    amount?: {
      totalAmount: string
      paymentStructure?: string
      verbatim: string
      page: number
      confidence: number
    }
    releases: Array<{
      releasingParty: string
      releasedParty: string
      scope: string
      verbatim: string
      page: number
      confidence: number
    }>
    confidentiality?: {
      isConfidential: boolean
      scope?: string
      verbatim: string
      page: number
    }
    signatures: Array<{
      signatory: string
      capacity: string
      dateSigned?: string
      page: number
    }>
  }
}

/**
 * Pleading Category Data
 */
export interface PleadingData extends ExtractedData {
  categorySpecific: {
    pleadingType: string
    filingDate?: string
    claims: Array<{
      claim: string
      verbatim: string
      page: number
      paragraph?: number
      confidence: number
    }>
    allegations: Array<{
      allegation: string
      verbatim: string
      page: number
      paragraph?: number
      confidence: number
    }>
    defenses?: Array<{
      defense: string
      verbatim: string
      page: number
      confidence: number
    }>
    reliefSought: {
      relief: string
      verbatim: string
      page: number
      confidence: number
    }
    jurisdictionalBasis?: {
      basis: string
      verbatim: string
      page: number
      confidence: number
    }
    exhibits: Array<{
      exhibit: string
      description: string
      verbatim: string
      page: number
      confidence: number
    }>
  }
}

/**
 * Discovery Category Data
 */
export interface DiscoveryData extends ExtractedData {
  categorySpecific: {
    discoveryType: {
      type: string
      from: string
      to: string
      date?: string
      set?: string
      verbatim: string
      page: number
      confidence: number
    }
    requests: Array<{
      number: string
      request: string
      verbatim: string
      page: number
      confidence: number
    }>
    responses?: Array<{
      number: string
      response: string
      verbatim: string
      page: number
      confidence: number
    }>
    objections?: Array<{
      number: string
      objection: string
      grounds: string
      verbatim: string
      page: number
      confidence: number
    }>
    definitions?: Array<{
      term: string
      definition: string
      verbatim: string
      page: number
    }>
  }
}

// ============================================================================
// PROMPT TEMPLATE TYPES
// ============================================================================

export interface PromptTemplate {
  category: DocumentCategory
  template: string
  variables: string[]
  examples?: PromptExample[]
}

export interface PromptExample {
  input: string
  output: any
}

// ============================================================================
// EXTRACTOR INTERFACE
// ============================================================================

export interface ICategoryExtractor {
  category: DocumentCategory
  supportedTypes: string[]  // List of type_codes this extractor handles
  
  /**
   * Extract data from document text
   */
  extract(request: ExtractionRequest): Promise<ExtractionResult>
  
  /**
   * Generate extraction prompt
   */
  generatePrompt(request: ExtractionRequest): string
  
  /**
   * Validate extracted data
   */
  validateExtraction(data: any): boolean
  
  /**
   * Calculate confidence score
   */
  calculateConfidence(data: any): number
}
