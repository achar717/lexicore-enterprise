/**
 * LexiCore™ Investigations - Extraction Services
 * Phase 3: Investigations-Specific GenSpark Prompt Pipelines
 * 
 * CRITICAL: These services extract ONLY verbatim facts.
 * NO conclusions, NO credibility assessments, NO intent inference.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { AIProviderService } from './ai-providers'

/**
 * Classification result structure
 */
interface ClassificationResult {
  document_type: string
  confidence: number
  classification_rationale: string
  document_indicators: string[]
  sensitivity_level: string
  potentially_privileged: boolean
  requires_manual_review: boolean
}

/**
 * Fact extraction result structure
 */
interface FactExtractionResult {
  document_metadata: {
    document_date: string | null
    author: string | null
    sender: string | null
    recipient: string[]
  }
  individuals_mentioned: Array<{
    name: string
    title_role: string | null
    page_number: number
    paragraph_number: string
    context: string
  }>
  organizations_mentioned: Array<{
    organization: string
    page_number: number
    paragraph_number: string
    context: string
  }>
  dates_and_events: Array<{
    date_text: string
    date_parsed: string | null
    event_description: string
    page_number: number
    paragraph_number: string
  }>
  alleged_conduct: Array<{
    conduct_quote: string
    who: string | null
    what: string | null
    when: string | null
    where: string | null
    page_number: number
    paragraph_number: string
    confidence: number
  }>
  requests_or_demands: Array<{
    request_quote: string
    requested_by: string
    deadline: string | null
    page_number: number
    confidence: number
  }>
}

/**
 * AI configuration interface
 */
interface AIConfig {
  OPENAI_API_KEY?: string
  GEMINI_API_KEY?: string
  AI_DEFAULT_PROVIDER?: string
  GEMINI_MODEL?: string
  OPENAI_MODEL?: string
}

/**
 * Classify an investigation document
 * Uses INV-DOC-CLASS-001 prompt for conservative classification
 */
export async function classifyInvestigationDocument(
  env: { DB: D1Database } & AIConfig,
  documentId: number,
  matterId: number,
  userId: number,
  documentText?: string
): Promise<{
  success: boolean
  extraction?: any
  error?: string
}> {
  try {
    // Get document
    const doc = await env.DB.prepare(`
      SELECT * FROM investigation_documents WHERE id = ?
    `).bind(documentId).first()

    if (!doc) {
      return { success: false, error: 'Document not found' }
    }

    // Get prompt
    const prompt = await env.DB.prepare(`
      SELECT * FROM prompt_registry WHERE id = 'INV-DOC-CLASS-001'
    `).first() as any

    if (!prompt) {
      return { success: false, error: 'Classification prompt not found' }
    }

    // Initialize AI classification
    let classification: ClassificationResult
    let modelUsed = 'mock-classifier'

    // Check if AI providers are configured
    if ((env.OPENAI_API_KEY || env.GEMINI_API_KEY) && documentText) {
      try {
        console.log('🤖 Using live AI for investigation document classification')
        
        // Initialize AI service
        const aiService = new AIProviderService({
          openaiApiKey: env.OPENAI_API_KEY,
          geminiApiKey: env.GEMINI_API_KEY,
          defaultProvider: (env.AI_DEFAULT_PROVIDER || 'gemini') as 'openai' | 'gemini',
          fallbackEnabled: true
        })

        // Build classification prompt
        const classificationPrompt = `${prompt.prompt_text}

DOCUMENT TO CLASSIFY:
${documentText.substring(0, 6000)}

TASK: Analyze this investigation document and return a JSON object with this EXACT structure:
{
  "document_type": "one of: email, interview_notes, whistleblower_complaint, internal_correspondence, regulatory_subpoena, government_inquiry, transaction_log, policy_document, chronology, investigation_memo, witness_statement, other",
  "confidence": number (0.0-1.0),
  "classification_rationale": "brief explanation of why this document type was identified",
  "document_indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "sensitivity_level": "one of: standard, sensitive, highly_sensitive, board_level",
  "potentially_privileged": boolean (true if potentially attorney-client privileged or work product),
  "requires_manual_review": boolean (true if ambiguous or high-sensitivity)
}

CRITICAL REQUIREMENTS:
- Be CONSERVATIVE in classification
- Flag ambiguous documents for manual review
- Mark potentially privileged documents (attorney communications, work product)
- Base sensitivity on content indicators (allegations, individuals named, regulatory involvement)
- NO conclusions about wrongdoing or liability
- ONLY classify based on document structure and explicit content

Return ONLY the JSON object, no other text.`

        // Call AI
        const response = await aiService.generateCompletion(
          [
            { role: 'system', content: 'You are an investigation document classifier. Return only valid JSON. Be conservative and flag uncertainty.' },
            { role: 'user', content: classificationPrompt }
          ],
          {
            temperature: 0.2, // Low temperature for consistent classification
            maxTokens: 1000,
            provider: (env.AI_DEFAULT_PROVIDER || 'gemini') as 'openai' | 'gemini'
          }
        )

        // Parse AI response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error('AI response is not valid JSON')
        }

        const aiClassification = JSON.parse(jsonMatch[0])
        
        classification = {
          document_type: aiClassification.document_type || 'other',
          confidence: aiClassification.confidence || 0.5,
          classification_rationale: aiClassification.classification_rationale || 'AI-based classification',
          document_indicators: aiClassification.document_indicators || [],
          sensitivity_level: aiClassification.sensitivity_level || 'standard',
          potentially_privileged: aiClassification.potentially_privileged || false,
          requires_manual_review: aiClassification.requires_manual_review || false
        }

        modelUsed = `${response.provider}-${response.model}`
        
        console.log('✅ AI classification complete:', {
          document_type: classification.document_type,
          confidence: classification.confidence,
          model: modelUsed
        })

      } catch (aiError: any) {
        console.error('❌ AI classification failed, using fallback:', aiError.message)
        // Fallback to conservative mock classification
        classification = {
          document_type: 'other',
          confidence: 0.5,
          classification_rationale: `AI classification failed: ${aiError.message}. Manual review required.`,
          document_indicators: ['classification_error'],
          sensitivity_level: 'sensitive',
          potentially_privileged: false,
          requires_manual_review: true
        }
        modelUsed = 'fallback-mock'
      }
    } else {
      // No AI configured or no document text - use conservative mock
      console.log('⚠️ No AI provider configured or no document text, using mock classification')
      classification = {
        document_type: documentText ? 'other' : 'unknown',
        confidence: 0.5,
        classification_rationale: 'Mock classification - AI provider not configured',
        document_indicators: ['mock_data'],
        sensitivity_level: 'sensitive',
        potentially_privileged: false,
        requires_manual_review: true
      }
      modelUsed = 'mock-classifier'
    }

    // Store extraction
    const extractionResult = await env.DB.prepare(`
      INSERT INTO investigation_extractions (
        document_id,
        matter_id,
        prompt_id,
        prompt_version,
        extraction_type,
        extraction_data,
        confidence_overall,
        requires_attorney_review,
        extracted_by,
        model_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      documentId,
      matterId,
      'INV-DOC-CLASS-001',
      'v1.0.0',
      'classification',
      JSON.stringify(classification),
      classification.confidence,
      classification.requires_manual_review ? 1 : 0,
      userId,
      modelUsed
    ).run()

    const extractionId = extractionResult.meta.last_row_id

    // Update document with classification
    await env.DB.prepare(`
      UPDATE investigation_documents 
      SET document_type = ?,
          sensitivity_level = ?,
          potentially_privileged = ?,
          classification_status = 'classified',
          classification_confidence = ?,
          classified_at = CURRENT_TIMESTAMP,
          classified_by = ?
      WHERE id = ?
    `).bind(
      classification.document_type,
      classification.sensitivity_level,
      classification.potentially_privileged ? 1 : 0,
      classification.confidence,
      userId,
      documentId
    ).run()

    // Add chain of custody
    await env.DB.prepare(`
      INSERT INTO investigation_chain_of_custody (
        document_id,
        matter_id,
        event_type,
        event_description,
        performed_by,
        document_hash
      ) VALUES (?, ?, 'classification', ?, ?, ?)
    `).bind(
      documentId,
      matterId,
      `AI-assisted classification: ${classification.document_type} (confidence: ${classification.confidence})`,
      userId,
      doc.file_hash
    ).run()

    return {
      success: true,
      extraction: {
        extraction_id: extractionId,
        ...classification
      }
    }

  } catch (error: any) {
    console.error('Classification error:', error)
    return {
      success: false,
      error: error.message || 'Classification failed'
    }
  }
}

/**
 * Extract facts from investigation document
 * Uses INV-FACT-EXT-001 prompt for verbatim fact extraction
 */
export async function extractInvestigationFacts(
  env: { DB: D1Database } & AIConfig,
  documentId: number,
  matterId: number,
  userId: number,
  documentText?: string
): Promise<{
  success: boolean
  extraction?: any
  error?: string
}> {
  try {
    // Get document
    const doc = await env.DB.prepare(`
      SELECT * FROM investigation_documents WHERE id = ?
    `).bind(documentId).first()

    if (!doc) {
      return { success: false, error: 'Document not found' }
    }

    // Get prompt
    const prompt = await env.DB.prepare(`
      SELECT * FROM prompt_registry WHERE id = 'INV-FACT-EXT-001'
    `).first() as any

    if (!prompt) {
      return { success: false, error: 'Fact extraction prompt not found' }
    }

    // Initialize fact extraction
    let factExtraction: FactExtractionResult
    let avgConfidence: number
    let requiresReview: boolean
    let modelUsed = 'mock-extractor'

    // Check if AI providers are configured
    if ((env.OPENAI_API_KEY || env.GEMINI_API_KEY) && documentText) {
      try {
        console.log('🤖 Using live AI for investigation fact extraction')
        
        // Initialize AI service
        const aiService = new AIProviderService({
          openaiApiKey: env.OPENAI_API_KEY,
          geminiApiKey: env.GEMINI_API_KEY,
          defaultProvider: (env.AI_DEFAULT_PROVIDER || 'gemini') as 'openai' | 'gemini',
          fallbackEnabled: true
        })

        // Build fact extraction prompt
        const factExtractionPrompt = `${prompt.prompt_text}

DOCUMENT TO ANALYZE:
${documentText.substring(0, 8000)}

TASK: Extract ONLY explicitly stated facts from this investigation document. Return a JSON object with this EXACT structure:
{
  "document_metadata": {
    "document_date": "YYYY-MM-DD or null",
    "author": "author name or null",
    "sender": "sender email/name or null",
    "recipient": ["recipient1", "recipient2"] or []
  },
  "individuals_mentioned": [{
    "name": "exact name from document",
    "title_role": "title or role if stated, else null",
    "page_number": 1,
    "paragraph_number": "paragraph identifier",
    "context": "verbatim sentence mentioning this person"
  }],
  "organizations_mentioned": [{
    "organization": "exact organization name",
    "page_number": 1,
    "paragraph_number": "paragraph identifier",
    "context": "verbatim sentence mentioning this organization"
  }],
  "dates_and_events": [{
    "date_text": "date as written in document",
    "date_parsed": "YYYY-MM-DD or null",
    "event_description": "verbatim description of event",
    "page_number": 1,
    "paragraph_number": "paragraph identifier"
  }],
  "alleged_conduct": [{
    "conduct_quote": "VERBATIM quote describing alleged conduct",
    "who": "person if stated, else null",
    "what": "action if stated, else null",
    "when": "timeframe if stated, else null",
    "where": "location if stated, else null",
    "page_number": 1,
    "paragraph_number": "paragraph identifier",
    "confidence": number (0.0-1.0)
  }],
  "requests_or_demands": [{
    "request_quote": "VERBATIM quote of request or demand",
    "requested_by": "requester if stated",
    "deadline": "YYYY-MM-DD or null",
    "page_number": 1,
    "confidence": number (0.0-1.0)
  }]
}

CRITICAL REQUIREMENTS:
- Extract ONLY information EXPLICITLY stated in the document
- Use VERBATIM quotes for conduct, requests, and context
- Do NOT infer intent, motive, or credibility
- Do NOT assess wrongdoing or draw conclusions
- Do NOT connect facts that aren't explicitly connected
- Mark ambiguous items with low confidence scores
- If information is absent, use null or empty arrays
- For each field, provide exact page/paragraph references

Return ONLY the JSON object, no other text.`

        // Call AI
        const response = await aiService.generateCompletion(
          [
            { role: 'system', content: 'You are an investigation fact extractor. Extract ONLY verbatim facts. NO conclusions. NO inferences. Return only valid JSON.' },
            { role: 'user', content: factExtractionPrompt }
          ],
          {
            temperature: 0.1, // Very low temperature for accurate fact extraction
            maxTokens: 3000,
            provider: (env.AI_DEFAULT_PROVIDER || 'gemini') as 'openai' | 'gemini'
          }
        )

        // Parse AI response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error('AI response is not valid JSON')
        }

        factExtraction = JSON.parse(jsonMatch[0]) as FactExtractionResult

        // Calculate overall confidence
        const confidenceScores = [
          ...factExtraction.alleged_conduct.map(a => a.confidence),
          ...factExtraction.requests_or_demands.map(r => r.confidence)
        ]
        avgConfidence = confidenceScores.length > 0 
          ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
          : 0.95

        requiresReview = avgConfidence < 0.70

        modelUsed = `${response.provider}-${response.model}`
        
        console.log('✅ AI fact extraction complete:', {
          individuals: factExtraction.individuals_mentioned.length,
          organizations: factExtraction.organizations_mentioned.length,
          dates: factExtraction.dates_and_events.length,
          alleged_conduct: factExtraction.alleged_conduct.length,
          requests: factExtraction.requests_or_demands.length,
          confidence: avgConfidence,
          model: modelUsed
        })

      } catch (aiError: any) {
        console.error('❌ AI fact extraction failed, using fallback:', aiError.message)
        // Fallback to minimal mock extraction
        factExtraction = {
          document_metadata: {
            document_date: null,
            author: null,
            sender: null,
            recipient: []
          },
          individuals_mentioned: [],
          organizations_mentioned: [],
          dates_and_events: [],
          alleged_conduct: [],
          requests_or_demands: []
        }
        avgConfidence = 0.5
        requiresReview = true
        modelUsed = 'fallback-mock'
      }
    } else {
      // No AI configured or no document text - use minimal mock
      console.log('⚠️ No AI provider configured or no document text, using mock extraction')
      factExtraction = {
        document_metadata: {
          document_date: '2024-12-15',
          author: 'Mock Data',
          sender: 'mock@example.com',
          recipient: ['recipient@example.com']
        },
        individuals_mentioned: [],
        organizations_mentioned: [],
        dates_and_events: [],
        alleged_conduct: [],
        requests_or_demands: []
      }
      avgConfidence = 0.5
      requiresReview = true
      modelUsed = 'mock-extractor'
    }

    // Store extraction
    const extractionResult = await env.DB.prepare(`
      INSERT INTO investigation_extractions (
        document_id,
        matter_id,
        prompt_id,
        prompt_version,
        extraction_type,
        extraction_data,
        confidence_overall,
        requires_attorney_review,
        attorney_review_reason,
        extracted_by,
        model_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      documentId,
      matterId,
      'INV-FACT-EXT-001',
      'v1.0.0',
      'fact_extraction',
      JSON.stringify(factExtraction),
      avgConfidence,
      requiresReview ? 1 : 0,
      requiresReview ? 'Low confidence score requires attorney review' : null,
      userId,
      modelUsed
    ).run()

    const extractionId = extractionResult.meta.last_row_id

    // Store extracted entities
    for (const individual of factExtraction.individuals_mentioned) {
      await env.DB.prepare(`
        INSERT INTO investigation_extracted_entities (
          document_id,
          matter_id,
          entity_type,
          entity_text,
          entity_normalized,
          page_number,
          paragraph_number,
          sentence_context,
          confidence,
          extraction_method,
          extracted_by
        ) VALUES (?, ?, 'person', ?, ?, ?, ?, ?, 0.95, 'ai', ?)
      `).bind(
        documentId,
        matterId,
        individual.name,
        individual.name,
        individual.page_number,
        individual.paragraph_number,
        individual.context,
        userId
      ).run()
    }

    // Store extracted dates
    for (const dateEvent of factExtraction.dates_and_events) {
      await env.DB.prepare(`
        INSERT INTO investigation_extracted_dates (
          document_id,
          matter_id,
          date_text,
          date_parsed,
          date_type,
          page_number,
          paragraph_number,
          context_text,
          confidence,
          extracted_by
        ) VALUES (?, ?, ?, ?, 'event_date', ?, ?, ?, 0.95, ?)
      `).bind(
        documentId,
        matterId,
        dateEvent.date_text,
        dateEvent.date_parsed,
        dateEvent.page_number,
        dateEvent.paragraph_number,
        dateEvent.event_description,
        userId
      ).run()
    }

    // Add chain of custody
    await env.DB.prepare(`
      INSERT INTO investigation_chain_of_custody (
        document_id,
        matter_id,
        event_type,
        event_description,
        performed_by,
        document_hash
      ) VALUES (?, ?, 'extraction', ?, ?, ?)
    `).bind(
      documentId,
      matterId,
      `Fact extraction completed (confidence: ${avgConfidence.toFixed(2)})`,
      userId,
      doc.file_hash
    ).run()

    return {
      success: true,
      extraction: {
        extraction_id: extractionId,
        fact_extraction: factExtraction,
        confidence_overall: avgConfidence,
        requires_attorney_review: requiresReview
      }
    }

  } catch (error: any) {
    console.error('Fact extraction error:', error)
    return {
      success: false,
      error: error.message || 'Fact extraction failed'
    }
  }
}
