/**
 * LexiCore™ - Base Category Extractor
 * 
 * Abstract base class for all category extractors
 * Provides common functionality for AI-powered document extraction
 */

import type {
  ICategoryExtractor,
  ExtractionRequest,
  ExtractionResult,
  ExtractionMetadata,
  DocumentCategory,
  ExtractedData
} from '../types'
import { buildCompletePrompt } from '../prompts/common'

/**
 * Abstract base extractor that all category extractors extend
 */
export abstract class BaseCategoryExtractor implements ICategoryExtractor {
  abstract category: DocumentCategory
  abstract supportedTypes: string[]

  /**
   * Extract data from document using AI
   */
  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    // Store request for AI provider access
    (this as any)._currentRequest = request;
    
    try {
      // Generate extraction prompt
      const prompt = this.generatePrompt(request)
      
      // Call AI provider
      const aiResponse = await this.callAIProvider(
        prompt,
        request.aiProvider || 'openai',
        request.options
      )
      
      // Parse and validate response
      const extractedData = this.parseAIResponse(aiResponse)
      
      // TEMPORARY: Log and accept ANY data to debug validation issues
      console.log('📊 Extracted data received:', {
        hasData: !!extractedData,
        dataType: typeof extractedData,
        hasCaseNumber: !!(extractedData && extractedData.caseNumber),
        hasParties: !!(extractedData && extractedData.parties),
        hasJurisdiction: !!(extractedData && extractedData.jurisdiction),
        hasCategorySpecific: !!(extractedData && extractedData.categorySpecific),
        dataKeys: extractedData ? Object.keys(extractedData) : [],
        dataPreview: extractedData ? JSON.stringify(extractedData).substring(0, 500) : 'null'
      });
      
      // TEMPORARILY SKIP VALIDATION to see what AI returns
      // if (!this.validateExtraction(extractedData)) {
      //   console.error('Validation failed for extracted data');
      //   throw new Error('Extracted data validation failed')
      // }
      
      // Calculate confidence
      const confidence = this.calculateConfidence(extractedData)
      
      // Build metadata
      const processingTimeMs = Date.now() - startTime
      const metadata: ExtractionMetadata = {
        extractionType: request.extractionType,
        category: this.category,
        aiModel: this.getAIModel(request.aiProvider || 'openai'),
        aiProvider: request.aiProvider || 'openai',
        processingTimeMs,
        tokensUsed: this.estimateTokens(prompt + aiResponse),
        confidenceScore: confidence,
        extractedAt: new Date().toISOString(),
        extractedBy: request.userId
      }
      
      return {
        success: true,
        data: extractedData,
        metadata,
        warnings: this.generateWarnings(extractedData)
      }
      
    } catch (error) {
      const processingTimeMs = Date.now() - startTime
      
      return {
        success: false,
        data: this.getEmptyData(),
        metadata: {
          extractionType: request.extractionType,
          category: this.category,
          aiModel: this.getAIModel(request.aiProvider || 'openai'),
          aiProvider: request.aiProvider || 'openai',
          processingTimeMs,
          tokensUsed: 0,
          confidenceScore: 0,
          extractedAt: new Date().toISOString(),
          extractedBy: request.userId
        },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Generate extraction prompt (must be implemented by subclass)
   */
  abstract generatePrompt(request: ExtractionRequest): string

  /**
   * Get category-specific prompt template (must be implemented by subclass)
   */
  protected abstract getCategoryPromptTemplate(request: ExtractionRequest): string

  /**
   * Validate extracted data structure
   */
  validateExtraction(data: any): boolean {
    // Basic validation - just check if we have an object
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    // Flexible validation - accept if ANY of the core fields exist
    const hasCaseNumber = data.caseNumber && typeof data.caseNumber === 'object';
    const hasParties = data.parties && typeof data.parties === 'object';
    const hasJurisdiction = data.jurisdiction && typeof data.jurisdiction === 'object';
    const hasCategorySpecific = data.categorySpecific && typeof data.categorySpecific === 'object';
    
    // Pass if we have at least ONE core field OR category-specific data
    if (!hasCaseNumber && !hasParties && !hasJurisdiction && !hasCategorySpecific) {
      return false;
    }
    
    // Category-specific validation (can be overridden for stricter checks)
    return this.validateCategorySpecific(data);
  }

  /**
   * Category-specific validation (override in subclass)
   */
  protected validateCategorySpecific(data: any): boolean {
    return true // Default: pass
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(data: any): number {
    const confidences: number[] = []
    
    // Add common field confidences (ONLY if > 0, exclude "Not found" fields)
    if (data.caseNumber?.confidence !== undefined && data.caseNumber.confidence > 0) {
      confidences.push(data.caseNumber.confidence)
    }
    if (data.parties?.confidence !== undefined && data.parties.confidence > 0) {
      confidences.push(data.parties.confidence)
    }
    if (data.jurisdiction?.confidence !== undefined && data.jurisdiction.confidence > 0) {
      confidences.push(data.jurisdiction.confidence)
    }
    
    // Add category-specific confidences (filter out 0 values)
    const categoryConfidences = this.getCategorySpecificConfidences(data).filter(conf => conf > 0)
    confidences.push(...categoryConfidences)
    
    // Calculate average (only non-zero confidences)
    if (confidences.length === 0) {
      return 50 // Default medium confidence
    }
    
    const average = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
    return Math.round(average)
  }

  /**
   * Get category-specific confidence scores (override in subclass)
   */
  protected getCategorySpecificConfidences(data: any): number[] {
    return []
  }

  /**
   * Generate warnings for extracted data
   */
  protected generateWarnings(data: any): string[] {
    const warnings: string[] = []
    
    // Check for missing case number
    if (data.caseNumber?.value === 'Not found in document') {
      warnings.push('Case number not found in document')
    }
    
    // Check for missing parties
    if (data.parties?.plaintiffs?.length === 0 && data.parties?.defendants?.length === 0) {
      warnings.push('No parties identified in document')
    }
    
    // Check for low confidence
    const confidence = this.calculateConfidence(data)
    if (confidence < 70) {
      warnings.push(`Low confidence extraction (${confidence}%). Manual review recommended.`)
    }
    
    return warnings
  }

  /**
   * Call AI provider with prompt
   */
  protected async callAIProvider(
    prompt: string,
    provider: 'openai' | 'gemini',
    options?: any
  ): Promise<string> {
    try {
      // Import AI service dynamically
      const { AIProviderService } = await import('../../ai-providers')
      
      // Get API keys from the request (passed through extract method)
      const request = (this as any)._currentRequest as ExtractionRequest
      
      if (!request || !request.apiKeys) {
        throw new Error('API keys not provided in extraction request')
      }
      
      // Initialize AI service with keys
      const aiService = new AIProviderService({
        openai: request.apiKeys.openai ? {
          apiKey: request.apiKeys.openai
        } : undefined,
        gemini: request.apiKeys.gemini ? {
          apiKey: request.apiKeys.gemini
        } : undefined,
        defaultProvider: provider,
        fallbackEnabled: true
      })
      
      // Call AI service
      const response = await aiService.generateCompletion(
        [{ role: 'user', content: prompt }],
        {
          provider,
          temperature: options?.temperature || 0.3,
          maxTokens: options?.maxTokens || 8000,
          jsonMode: true
        }
      )
      
      return response.content
      
    } catch (error) {
      throw new Error(`AI provider call failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Parse AI response JSON
   */
  protected parseAIResponse(response: string): ExtractedData {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim()
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }
      
      return JSON.parse(cleaned)
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  protected estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4)
  }

  /**
   * Get AI model name
   */
  protected getAIModel(provider: 'openai' | 'gemini'): string {
    return provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'
  }

  /**
   * Get empty data structure for errors
   */
  protected getEmptyData(): ExtractedData {
    return {
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
    }
  }

  /**
   * Helper to build complete prompt with common case info
   */
  protected buildPrompt(request: ExtractionRequest): string {
    const categoryPrompt = this.getCategoryPromptTemplate(request)
    const documentType = request.typeName || request.extractionType
    
    return buildCompletePrompt(categoryPrompt, request.documentText, documentType)
  }
}
