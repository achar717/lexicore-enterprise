// LexiCore™ Extraction Service
// AI-assisted document classification and data extraction
// 
// AI PROVIDERS:
// - Supports OpenAI and Google Gemini
// - Automatic provider fallback
// - Cost optimization

import type { Bindings, ExtractedField, IdentifiedClause } from '../types'
import { generateUUID } from '../utils/crypto'
import { AIProviderService, type AIProviderConfig } from './ai-providers'

export class ExtractionService {
  private aiService?: AIProviderService

  constructor(
    private db: D1Database,
    aiConfig?: AIProviderConfig
  ) {
    if (aiConfig) {
      this.aiService = new AIProviderService(aiConfig)
    }
  }

  /**
   * Classify document type with confidence scoring
   */
  async classifyDocument(params: {
    documentId: string;
    documentText: string;
    promptVersion: string;
  }): Promise<{
    documentType: string;
    confidence: number;
  }> {
    const { documentId, documentText, promptVersion } = params;

    // Simulated classification logic
    // In production, this would call an AI service
    const classification = this.simulateClassification(documentText);

    // Update document with classification
    await this.db
      .prepare(`
        UPDATE documents
        SET document_type = ?,
            classification_confidence = ?,
            classification_timestamp = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(classification.documentType, classification.confidence, documentId)
      .run();

    return classification;
  }

  /**
   * Extract fields from document
   */
  async extractFields(params: {
    documentId: string;
    documentText: string;
    fieldDefinitions: Array<{
      fieldName: string;
      fieldType: 'text' | 'date' | 'number' | 'boolean' | 'list';
      extractionPrompt: string;
    }>;
    promptVersion: string;
    extractedBy?: string;
  }): Promise<ExtractedField[]> {
    const { documentId, documentText, fieldDefinitions, promptVersion, extractedBy } = params;

    const extractedFields: ExtractedField[] = [];

    for (const fieldDef of fieldDefinitions) {
      // Simulate AI extraction
      const extraction = this.simulateFieldExtraction(
        documentText,
        fieldDef.fieldName,
        fieldDef.fieldType
      );

      const fieldId = generateUUID();

      // Insert extracted field
      await this.db
        .prepare(`
          INSERT INTO extracted_fields (
            id, document_id, field_name, field_value, field_type,
            source_page, source_paragraph, source_quote, confidence_score,
            extraction_method, prompt_version, extracted_at, extracted_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assisted', ?, datetime('now'), ?)
        `)
        .bind(
          fieldId,
          documentId,
          fieldDef.fieldName,
          extraction.value,
          fieldDef.fieldType,
          extraction.sourcePage,
          extraction.sourceParagraph,
          extraction.sourceQuote,
          extraction.confidence,
          promptVersion,
          extractedBy || null
        )
        .run();

      const field: ExtractedField = {
        id: fieldId,
        document_id: documentId,
        field_name: fieldDef.fieldName,
        field_value: extraction.value,
        field_type: fieldDef.fieldType,
        source_page: extraction.sourcePage,
        source_paragraph: extraction.sourceParagraph,
        source_quote: extraction.sourceQuote,
        confidence_score: extraction.confidence,
        extraction_method: 'ai_assisted',
        prompt_version: promptVersion,
        model_version: null,
        extracted_at: new Date().toISOString(),
        extracted_by: extractedBy || null,
        review_status: 'pending',
        reviewed_at: null,
        reviewed_by: null,
        reviewer_notes: null,
        original_value: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      extractedFields.push(field);
    }

    // Update document processing status
    await this.db
      .prepare(`
        UPDATE documents
        SET processing_status = 'extracted',
            extraction_completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(documentId)
      .run();

    return extractedFields;
  }

  /**
   * Identify clauses in document (non-interpretive)
   */
  async identifyClauses(params: {
    documentId: string;
    documentText: string;
    clauseTypes: string[];
    promptVersion: string;
    identifiedBy?: string;
  }): Promise<IdentifiedClause[]> {
    const { documentId, documentText, clauseTypes, promptVersion, identifiedBy } = params;

    const identifiedClauses: IdentifiedClause[] = [];

    for (const clauseType of clauseTypes) {
      // Simulate clause identification
      const identified = this.simulateClauseIdentification(documentText, clauseType);

      if (identified.found) {
        const clauseId = generateUUID();

        await this.db
          .prepare(`
            INSERT INTO identified_clauses (
              id, document_id, clause_type, source_page, source_paragraph,
              clause_text, confidence_score, identified_at, identified_by, prompt_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
          `)
          .bind(
            clauseId,
            documentId,
            clauseType,
            identified.sourcePage,
            identified.sourceParagraph,
            identified.clauseText,
            identified.confidence,
            identifiedBy || null,
            promptVersion
          )
          .run();

        const clause: IdentifiedClause = {
          id: clauseId,
          document_id: documentId,
          clause_type: clauseType as any,
          source_page: identified.sourcePage,
          source_paragraph: identified.sourceParagraph,
          clause_text: identified.clauseText,
          confidence_score: identified.confidence,
          identified_at: new Date().toISOString(),
          identified_by: identifiedBy || null,
          prompt_version: promptVersion,
          review_status: 'pending',
          reviewed_at: null,
          reviewed_by: null,
          reviewer_notes: null,
          created_at: new Date().toISOString()
        };

        identifiedClauses.push(clause);
      }
    }

    return identifiedClauses;
  }

  /**
   * Get extracted fields for document
   */
  async getExtractedFields(documentId: string): Promise<ExtractedField[]> {
    const result = await this.db
      .prepare('SELECT * FROM extracted_fields WHERE document_id = ? ORDER BY field_name')
      .bind(documentId)
      .all();

    return (result.results || []) as ExtractedField[];
  }

  /**
   * Get identified clauses for document
   */
  async getIdentifiedClauses(documentId: string): Promise<IdentifiedClause[]> {
    const result = await this.db
      .prepare('SELECT * FROM identified_clauses WHERE document_id = ? ORDER BY clause_type')
      .bind(documentId)
      .all();

    return (result.results || []) as IdentifiedClause[];
  }

  /**
   * Get extraction statistics for matter
   */
  async getMatterExtractionStats(matterId: string): Promise<{
    documentsExtracted: number;
    totalFields: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    avgConfidence: number;
  }> {
    // Documents with extractions
    const docsResult = await this.db
      .prepare(`
        SELECT COUNT(DISTINCT document_id) as count
        FROM extracted_fields ef
        JOIN documents d ON ef.document_id = d.id
        WHERE d.matter_id = ?
      `)
      .bind(matterId)
      .first() as any;

    // Total fields
    const fieldsResult = await this.db
      .prepare(`
        SELECT COUNT(*) as count, AVG(confidence_score) as avg_conf
        FROM extracted_fields ef
        JOIN documents d ON ef.document_id = d.id
        WHERE d.matter_id = ?
      `)
      .bind(matterId)
      .first() as any;

    // By review status
    const pendingResult = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM extracted_fields ef
        JOIN documents d ON ef.document_id = d.id
        WHERE d.matter_id = ? AND ef.review_status = 'pending'
      `)
      .bind(matterId)
      .first() as any;

    const approvedResult = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM extracted_fields ef
        JOIN documents d ON ef.document_id = d.id
        WHERE d.matter_id = ? AND ef.review_status = 'approved'
      `)
      .bind(matterId)
      .first() as any;

    const rejectedResult = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM extracted_fields ef
        JOIN documents d ON ef.document_id = d.id
        WHERE d.matter_id = ? AND ef.review_status = 'rejected'
      `)
      .bind(matterId)
      .first() as any;

    return {
      documentsExtracted: docsResult?.count || 0,
      totalFields: fieldsResult?.count || 0,
      pendingReview: pendingResult?.count || 0,
      approved: approvedResult?.count || 0,
      rejected: rejectedResult?.count || 0,
      avgConfidence: fieldsResult?.avg_conf || 0
    };
  }

  // =============================================================================
  // SIMULATION METHODS (Replace with actual AI service calls in production)
  // =============================================================================

  private simulateClassification(text: string): {
    documentType: string;
    confidence: number;
  } {
    // Simple heuristic-based classification
    const lowerText = text.toLowerCase();

    if (lowerText.includes('complaint') || lowerText.includes('plaintiff') || lowerText.includes('defendant')) {
      return { documentType: 'pleading', confidence: 0.85 };
    }

    if (lowerText.includes('agreement') || lowerText.includes('contract') || lowerText.includes('whereas')) {
      return { documentType: 'contract', confidence: 0.90 };
    }

    if (lowerText.includes('interrogator') || lowerText.includes('request for production')) {
      return { documentType: 'discovery', confidence: 0.88 };
    }

    if (lowerText.includes('dear') || lowerText.includes('sincerely')) {
      return { documentType: 'correspondence', confidence: 0.75 };
    }

    if (lowerText.includes('motion') || lowerText.includes('memorandum')) {
      return { documentType: 'filing', confidence: 0.82 };
    }

    return { documentType: 'other', confidence: 0.60 };
  }

  private simulateFieldExtraction(
    text: string,
    fieldName: string,
    fieldType: string
  ): {
    value: string | null;
    sourcePage: number | null;
    sourceParagraph: number | null;
    sourceQuote: string | null;
    confidence: number;
  } {
    // Simulate extraction with mock data
    const mockExtractions: Record<string, any> = {
      party_names: {
        value: 'John Doe and Jane Smith',
        sourcePage: 1,
        sourceParagraph: 2,
        sourceQuote: 'This Agreement is entered into between John Doe ("Party A") and Jane Smith ("Party B")',
        confidence: 0.92
      },
      effective_date: {
        value: '2024-01-15',
        sourcePage: 1,
        sourceParagraph: 3,
        sourceQuote: 'Effective as of January 15, 2024',
        confidence: 0.95
      },
      governing_law: {
        value: 'State of California',
        sourcePage: 5,
        sourceParagraph: 12,
        sourceQuote: 'This Agreement shall be governed by the laws of the State of California',
        confidence: 0.88
      },
      jurisdiction: {
        value: 'Northern District of California',
        sourcePage: 1,
        sourceParagraph: 1,
        sourceQuote: 'Filed in the United States District Court, Northern District of California',
        confidence: 0.93
      }
    };

    return mockExtractions[fieldName] || {
      value: 'Not found in document',
      sourcePage: null,
      sourceParagraph: null,
      sourceQuote: null,
      confidence: 0.10
    };
  }

  private simulateClauseIdentification(
    text: string,
    clauseType: string
  ): {
    found: boolean;
    sourcePage: number | null;
    sourceParagraph: number | null;
    clauseText: string | null;
    confidence: number;
  } {
    const lowerText = text.toLowerCase();

    const clausePatterns: Record<string, string[]> = {
      indemnification: ['indemnify', 'hold harmless', 'indemnification'],
      termination: ['termination', 'terminate', 'cancel'],
      confidentiality: ['confidential', 'proprietary', 'non-disclosure'],
      arbitration: ['arbitration', 'arbitrate', 'arbitrator'],
      choice_of_law: ['governed by', 'governing law', 'applicable law'],
      venue: ['venue', 'jurisdiction', 'forum'],
      notice: ['notice', 'notification', 'notify']
    };

    const patterns = clausePatterns[clauseType] || [];
    const found = patterns.some(pattern => lowerText.includes(pattern));

    if (found) {
      return {
        found: true,
        sourcePage: 3,
        sourceParagraph: 8,
        clauseText: `[Simulated ${clauseType} clause text from document]`,
        confidence: 0.85
      };
    }

    return {
      found: false,
      sourcePage: null,
      sourceParagraph: null,
      clauseText: null,
      confidence: 0.0
    };
  }
}
