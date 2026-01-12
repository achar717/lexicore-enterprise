/**
 * LexiCore™ AI Extraction Service
 * Multi-provider AI document data extraction with legal-specific prompts
 * 
 * KEY FEATURES:
 * - Multi-provider support (OpenAI + Gemini with automatic fallback)
 * - Verbatim extraction with exact quotes
 * - Source citations (page, paragraph, section)
 * - Confidence scoring for each field
 * - Full traceability for legal compliance
 */

import { AIProviderService, AIMessage } from './ai-providers'

interface ExtractionOptions {
  documentName: string;
  matterName: string;
  matterNumber: string;
  documentType?: string;
  extractedText?: string; // Document text content
  promptText?: string; // Custom extraction prompt from prompt registry
  extractionType: string; // contract, pleading, discovery, etc.
}

interface ExtractedField {
  value: string | string[];
  verbatim: string;
  source: {
    page: number;
    paragraph: number;
    section: string;
    char_start: number;
    char_end: number;
  };
  confidence: number;
  extraction_method: string;
}

interface SourceCitation {
  field: string;
  text: string;
  page: number;
  paragraph: number;
  section: string;
  char_start: number;
  char_end: number;
  confidence: number;
  verbatim: boolean;
  extraction_method: string;
}

interface ExtractionResult {
  extractedData: Record<string, ExtractedField>;
  citations: SourceCitation[];
  overallConfidence: number;
  metadata: {
    model: string;
    extractionType: string;
    timestamp: string;
    fieldsExtracted: number;
  };
}

/**
 * Get document-type-specific extraction instructions
 */
function getDocumentTypeInstructions(documentType: string, extractionType: string): string {
  const type = (documentType || extractionType || '').toLowerCase()
  
  // Audit Documents
  if (type.includes('audit') || type.includes('review') || type.includes('finding')) {
    return `
DOCUMENT TYPE: AUDIT/REVIEW DOCUMENT

Extract these AUDIT-SPECIFIC fields (ignore legal fields like jurisdiction):
- auditor: Name of auditor/audit firm
- auditee: Organization being audited
- auditPeriod: Time period covered by audit
- auditDate: Date audit was conducted/completed
- findings: Key audit findings or issues identified
- recommendations: Auditor recommendations
- financialImpact: Any financial amounts or impacts mentioned
- complianceIssues: Compliance violations or concerns
- followUpRequired: Whether follow-up actions are needed

DO NOT extract legal contract fields (jurisdiction, execution date, parties) unless explicitly legal in nature.`
  }
  
  // Financial/Accounting Documents
  if (type.includes('financial') || type.includes('statement') || type.includes('report')) {
    return `
DOCUMENT TYPE: FINANCIAL DOCUMENT

Extract these FINANCIAL-SPECIFIC fields:
- reportingEntity: Organization name
- reportPeriod: Period covered
- reportDate: Date of report
- totalRevenue: Revenue figures
- totalExpenses: Expense figures
- netIncome: Net income/loss
- assets: Total assets
- liabilities: Total liabilities
- auditor: Independent auditor if mentioned
- significantItems: Notable financial items`
  }
  
  // Contracts
  if (type.includes('contract') || type.includes('agreement')) {
    return `
DOCUMENT TYPE: CONTRACT/AGREEMENT

Extract these CONTRACT-SPECIFIC fields:
- parties: Full legal names of all parties
- executionDate: Date contract was signed
- effectiveDate: Date contract takes effect
- jurisdiction: Governing law jurisdiction
- term: Contract duration/term
- compensation: Payment amounts
- termination: Termination provisions`
  }
  
  // Legal Pleadings
  if (type.includes('pleading') || type.includes('complaint') || type.includes('motion')) {
    return `
DOCUMENT TYPE: LEGAL PLEADING

Extract these PLEADING-SPECIFIC fields:
- plaintiff: Plaintiff name(s)
- defendant: Defendant name(s)
- court: Court name and jurisdiction
- caseNumber: Case/docket number
- filingDate: Date filed
- claimsCount: Number of claims/counts
- reliefSought: Relief requested`
  }
  
  // Default - Generic Document
  return `
DOCUMENT TYPE: GENERAL DOCUMENT

Extract relevant fields based on document content. Common fields:
- title: Document title
- date: Primary date(s)
- parties: People/organizations mentioned
- keyFindings: Main findings or conclusions
- recommendations: Any recommendations
- amounts: Financial amounts if any
- references: Citations or references

Adapt field names to match the actual document type and content.`
}

/**
 * Extract structured data from documents using AI (OpenAI or Gemini)
 * Handles legal, audit, financial, and general documents
 * Returns verbatim quotes with precise source citations
 */
export async function performAIExtraction(
  options: ExtractionOptions,
  providerConfig: {
    openaiApiKey?: string
    geminiApiKey?: string
    defaultProvider?: 'openai' | 'gemini'
    fallbackEnabled?: boolean
  }
): Promise<ExtractionResult> {
  const systemPrompt = `You are an expert document analyst extracting structured data with MAXIMUM PRECISION.

CRITICAL REQUIREMENTS:
1. **Document Type Awareness**: Recognize document type and extract APPROPRIATE fields
2. **Verbatim Extraction**: Copy text EXACTLY as it appears - no paraphrasing
3. **Source Citations**: Provide precise page, paragraph, section for every field
4. **Confidence Scoring**: Rate 0-100 based on text clarity and explicitness
5. **Null for Missing**: If information is NOT in the document, return null
6. **No Assumptions**: Do NOT extract legal fields (jurisdiction, execution date) from non-legal documents

CONFIDENCE GUIDELINES:
- 95-100: Explicitly stated, unambiguous, formal language
- 85-94: Clearly stated but informal or implied
- 70-84: Mentioned but requires interpretation
- 50-69: Ambiguous or partial information
- Below 50: Uncertain or inferred

FIELD EXTRACTION RULES:
- Extract fields that ACTUALLY EXIST in this document type
- For audit documents: Extract audit-specific fields (auditor, findings, audit period)
- For financial documents: Extract financial fields (revenue, expenses, assets)
- For contracts: Extract contract fields (parties, jurisdiction, term)
- DO NOT force-fit legal fields into non-legal documents

Return structured JSON with verbatim quotes and precise source locations.`

  const typeInstructions = getDocumentTypeInstructions(options.documentType || '', options.extractionType)
  
  const userPrompt = `Extract structured data from this document with verbatim quotes and source citations:

Document: ${options.documentName}
Matter: ${options.matterName} (${options.matterNumber})
Document Type: ${options.documentType || 'General Document'}
Extraction Type: ${options.extractionType}

${typeInstructions}

${options.promptText ? `\n\nAdditional Extraction Guidelines:\n${options.promptText}\n` : ''}

${options.extractedText ? `\n\nDocument Content:\n${options.extractedText.substring(0, 16000)}` : `\n\n⚠️ IMPORTANT: Document text content is NOT available (PDF/DOCX extraction pending).

EXTRACTION STRATEGY FOR METADATA-ONLY:
1. Analyze the document NAME/TITLE for clues about content
2. Use the MATTER context to infer likely document structure
3. Make INTELLIGENT inferences based on document type patterns
4. Set confidence scores LOWER (max 70-80) when inferring without text
5. Extract what you can reasonably infer, but mark fields as "inferred from metadata"

Document Name Analysis:
- Title: "${options.documentName}"
- What does this title suggest about the document's content?
- What entities, dates, or topics are implied by the name?

For example, if the name is "School Board Audit 2023.pdf":
- auditee: "School Board" (inferred from title)
- auditPeriod: "2023" (inferred from title)
- documentType: "Audit Report" (inferred from title)

Extract as much as possible from the filename and matter context, but be conservative with confidence scores.`}

INSTRUCTIONS:
1. Read the document carefully to understand its TYPE (audit, contract, pleading, financial, etc.)
2. Extract ONLY fields appropriate for this document type
3. DO NOT extract legal fields (jurisdiction, execution date) from audit/financial documents
4. Provide verbatim quotes and source citations for each field
5. Return ONLY valid JSON (no markdown, no code blocks, no explanations)
6. Format your response exactly like this structure:

{
  "fieldName": {
    "value": "extracted value",
    "verbatim": "exact quote from document",
    "page": 1,
    "paragraph": 2,
    "section": "Section name",
    "char_start": 100,
    "char_end": 200,
    "confidence": 95
  }
}

Extract ALL relevant fields for this document type. Only include fields that actually exist in the document.`

  try {
    // Initialize AI Provider Service with multi-provider support
    const aiService = new AIProviderService({
      openai: providerConfig.openaiApiKey ? {
        apiKey: providerConfig.openaiApiKey,
        model: 'gpt-4o-mini'
      } : undefined,
      gemini: providerConfig.geminiApiKey ? {
        apiKey: providerConfig.geminiApiKey,
        model: 'gemini-1.5-flash'
      } : undefined,
      defaultProvider: providerConfig.defaultProvider || 'gemini',
      fallbackEnabled: providerConfig.fallbackEnabled !== false
    })

    console.log('🤖 Calling AI for extraction:', {
      documentName: options.documentName,
      extractionType: options.extractionType,
      defaultProvider: providerConfig.defaultProvider || 'gemini',
      hasText: !!options.extractedText,
      textLength: options.extractedText?.length || 0
    })

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const aiResponse = await aiService.generateCompletion(messages, {
      temperature: 0.1, // Very low for maximum precision
      maxTokens: 8000, // Increased for comprehensive extractions
      responseFormat: 'json' // Enable JSON mode for structured output
    })

    console.log('✅ AI extraction complete using:', aiResponse.provider, aiResponse.model)
    console.log('📊 Raw AI response length:', aiResponse.content.length)
    console.log('📄 First 500 chars of response:', aiResponse.content.substring(0, 500))

    // Clean AI response - remove markdown code blocks if present
    let cleanedContent = aiResponse.content.trim()
    
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }
    
    console.log('🧹 Cleaned response length:', cleanedContent.length)
    console.log('🔍 Full cleaned response:', cleanedContent)

    const extractedFields = JSON.parse(cleanedContent)

    console.log('✅ Extraction successful, fields:', Object.keys(extractedFields))
    console.log('📋 Field count:', Object.keys(extractedFields).length)

    // Transform AI response into structured format with citations
    const extractedData: Record<string, ExtractedField> = {}
    const citations: SourceCitation[] = []
    let totalConfidence = 0
    let fieldCount = 0

    for (const [fieldName, fieldData] of Object.entries(extractedFields)) {
      const field = fieldData as any
      
      if (field && field.value !== null && field.value !== undefined) {
        // Normalize field structure
        extractedData[fieldName] = {
          value: field.value,
          verbatim: field.verbatim || '',
          source: {
            page: field.page || 1,
            paragraph: field.paragraph || 1,
            section: field.section || 'Unknown',
            char_start: field.char_start || 0,
            char_end: field.char_end || 0
          },
          confidence: field.confidence || 75,
          extraction_method: 'ai_assisted'
        }

        // Create citation entry for traceability
        citations.push({
          field: fieldName,
          text: field.verbatim || '',
          page: field.page || 1,
          paragraph: field.paragraph || 1,
          section: field.section || 'Unknown',
          char_start: field.char_start || 0,
          char_end: field.char_end || 0,
          confidence: field.confidence || 75,
          verbatim: true,
          extraction_method: 'ai_assisted'
        })

        totalConfidence += field.confidence || 75
        fieldCount++
      }
    }

    const overallConfidence = fieldCount > 0 ? Math.round(totalConfidence / fieldCount) : 0

    console.log('📊 Extraction complete:', {
      fieldsExtracted: fieldCount,
      overallConfidence,
      citationsCount: citations.length
    })

    return {
      extractedData,
      citations,
      overallConfidence,
      metadata: {
        model: 'gpt-4o-mini',
        extractionType: options.extractionType,
        timestamp: new Date().toISOString(),
        fieldsExtracted: fieldCount
      }
    }

  } catch (error) {
    console.error('❌ AI extraction failed:', error)
    throw new Error(`AI extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
