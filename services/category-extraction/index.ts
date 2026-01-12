/**
 * LexiCore™ - Category-Based Extraction Service
 * 
 * Main service for extracting data from legal documents using category-based handlers
 * Supports all 121 document types across 8 categories
 * Reusable across litigation, regulatory, investigations, IP, and other practice areas
 */

import type {
  ExtractionRequest,
  ExtractionResult,
  DocumentCategory,
  ICategoryExtractor
} from './types'

// Import all 8 category extractors
import { CaseManagementExtractor } from './extractors/case-management'
import { MotionExtractor } from './extractors/motion'
import { ADRExtractor } from './extractors/adr'
import { TrialExtractor } from './extractors/trial'
import { AppellateExtractor } from './extractors/appellate'
import { SettlementExtractor } from './extractors/settlement'
import { PleadingExtractor } from './extractors/pleading'
import { DiscoveryExtractor } from './extractors/discovery'

/**
 * Main Category Extraction Service
 * 
 * Routes extraction requests to appropriate category handler
 * Provides fallback for unmapped types
 */
export class CategoryExtractionService {
  private extractors: Map<DocumentCategory, ICategoryExtractor>
  private typeToCategory: Map<string, DocumentCategory>

  constructor() {
    this.extractors = new Map()
    this.typeToCategory = new Map()
    
    // Initialize extractors
    this.initializeExtractors()
  }

  /**
   * Initialize all category extractors
   */
  private initializeExtractors() {
    // Case Management
    const caseManagement = new CaseManagementExtractor()
    this.extractors.set('Case Management', caseManagement)
    caseManagement.supportedTypes.forEach(type => {
      this.typeToCategory.set(type, 'Case Management')
    })

    // Motion
    const motion = new MotionExtractor()
    this.extractors.set('Motion', motion)
    motion.supportedTypes.forEach(type => {
      this.typeToCategory.set(type, 'Motion')
    })

    // ADR
    const adr = new ADRExtractor()
    this.extractors.set('ADR', adr)
    adr.supportedTypes.forEach(type => {
      this.typeToCategory.set(type, 'ADR')
    })

    // Trial
    const trial = new TrialExtractor()
    this.extractors.set('Trial', trial)
    trial.supportedTypes.forEach(type => this.typeToCategory.set(type, 'Trial'))

    // Appellate
    const appellate = new AppellateExtractor()
    this.extractors.set('Appellate', appellate)
    appellate.supportedTypes.forEach(type => this.typeToCategory.set(type, 'Appellate'))

    // Settlement
    const settlement = new SettlementExtractor()
    this.extractors.set('Settlement', settlement)
    settlement.supportedTypes.forEach(type => this.typeToCategory.set(type, 'Settlement'))

    // Pleading
    const pleading = new PleadingExtractor()
    this.extractors.set('Pleading', pleading)
    pleading.supportedTypes.forEach(type => this.typeToCategory.set(type, 'Pleading'))

    // Discovery
    const discovery = new DiscoveryExtractor()
    this.extractors.set('Discovery', discovery)
    discovery.supportedTypes.forEach(type => this.typeToCategory.set(type, 'Discovery'))
  }

  /**
   * Extract data from document
   * 
   * Routes to appropriate category handler or uses fallback
   */
  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    try {
      // Determine category
      const category = this.determineCategory(request)
      
      if (!category) {
        return this.createErrorResult(
          request,
          'Category not determined',
          'Unable to determine document category for extraction'
        )
      }

      // Get extractor for category
      const extractor = this.extractors.get(category)
      
      if (!extractor) {
        return this.createErrorResult(
          request,
          'Extractor not found',
          `No extractor available for category: ${category}`
        )
      }

      // Execute extraction
      return await extractor.extract(request)

    } catch (error) {
      return this.createErrorResult(
        request,
        'Extraction failed',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Determine document category from request
   */
  private determineCategory(request: ExtractionRequest): DocumentCategory | null {
    // 1. If category provided explicitly, use it
    if (request.category) {
      return request.category
    }

    // 2. Look up category by type_code
    if (request.extractionType) {
      const category = this.typeToCategory.get(request.extractionType)
      if (category) {
        return category
      }
    }

    // 3. Try to infer from type name
    if (request.typeName) {
      return this.inferCategoryFromTypeName(request.typeName)
    }

    return null
  }

  /**
   * Infer category from type name (fallback)
   */
  private inferCategoryFromTypeName(typeName: string): DocumentCategory | null {
    const lowerName = typeName.toLowerCase()

    if (lowerName.includes('order') || lowerName.includes('scheduling') || 
        lowerName.includes('conference') || lowerName.includes('notice')) {
      return 'Case Management'
    }

    if (lowerName.includes('motion') || lowerName.includes('dismiss') || 
        lowerName.includes('summary judgment') || lowerName.includes('compel')) {
      return 'Motion'
    }

    if (lowerName.includes('arbitration') || lowerName.includes('mediation') || 
        lowerName.includes('adr')) {
      return 'ADR'
    }

    if (lowerName.includes('trial') || lowerName.includes('verdict') || 
        lowerName.includes('witness') || lowerName.includes('exhibit')) {
      return 'Trial'
    }

    if (lowerName.includes('appeal') || lowerName.includes('brief') || 
        lowerName.includes('appellant') || lowerName.includes('appellee')) {
      return 'Appellate'
    }

    if (lowerName.includes('settlement') || lowerName.includes('release')) {
      return 'Settlement'
    }

    if (lowerName.includes('complaint') || lowerName.includes('answer') || 
        lowerName.includes('counterclaim') || lowerName.includes('pleading')) {
      return 'Pleading'
    }

    if (lowerName.includes('discovery') || lowerName.includes('interrogator') || 
        lowerName.includes('request for production') || lowerName.includes('admission') ||
        lowerName.includes('subpoena')) {
      return 'Discovery'
    }

    return null
  }

  /**
   * Create error result
   */
  private createErrorResult(
    request: ExtractionRequest,
    errorType: string,
    errorMessage: string
  ): ExtractionResult {
    return {
      success: false,
      data: {
        caseNumber: {
          value: 'Extraction failed',
          verbatim: '',
          page: 0,
          confidence: 0
        },
        parties: {
          plaintiffs: [],
          defendants: [],
          verbatim: '',
          page: 0,
          confidence: 0
        },
        jurisdiction: {
          court: 'Extraction failed',
          venue: '',
          verbatim: '',
          page: 0,
          confidence: 0
        }
      },
      metadata: {
        extractionType: request.extractionType,
        category: request.category || 'Unknown' as DocumentCategory,
        aiModel: 'none',
        aiProvider: request.aiProvider || 'openai',
        processingTimeMs: 0,
        tokensUsed: 0,
        confidenceScore: 0,
        extractedAt: new Date().toISOString(),
        extractedBy: request.userId
      },
      errors: [`${errorType}: ${errorMessage}`]
    }
  }

  /**
   * Get list of supported document types by category
   */
  getSupportedTypes(): Map<DocumentCategory, string[]> {
    const supported = new Map<DocumentCategory, string[]>()
    
    this.extractors.forEach((extractor, category) => {
      supported.set(category, extractor.supportedTypes)
    })
    
    return supported
  }

  /**
   * Check if a document type is supported
   */
  isTypeSupported(typeCode: string): boolean {
    return this.typeToCategory.has(typeCode)
  }

  /**
   * Get category for a document type
   */
  getCategoryForType(typeCode: string): DocumentCategory | null {
    return this.typeToCategory.get(typeCode) || null
  }

  /**
   * Get statistics about the service
   */
  getStats() {
    const stats = {
      categoriesImplemented: this.extractors.size,
      totalSupportedTypes: 0,
      byCategory: {} as Record<string, number>
    }

    this.extractors.forEach((extractor, category) => {
      const count = extractor.supportedTypes.length
      stats.totalSupportedTypes += count
      stats.byCategory[category] = count
    })

    return stats
  }
}

// Export singleton instance
export const categoryExtractionService = new CategoryExtractionService()

// Export types and all 8 extractors for testing
export type { ExtractionRequest, ExtractionResult, DocumentCategory }
export { 
  CaseManagementExtractor, 
  MotionExtractor, 
  ADRExtractor,
  TrialExtractor,
  AppellateExtractor,
  SettlementExtractor,
  PleadingExtractor,
  DiscoveryExtractor
}
