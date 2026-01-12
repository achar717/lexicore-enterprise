/**
 * LexiCore™ - Enhanced Drafting Prompt Registry
 * 
 * Extends the central prompt registry with structured, versioned drafting prompts
 * Provides JSON schema validation and safety controls
 * Integrates with existing PromptRegistryService without impacting other practices
 */

import { PromptRegistryService } from './prompt-registry'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DraftingPromptConfig {
  id: string
  version: string
  practiceAreas: string[]
  module: 'drafting'
  taskType: string
  title: string
  description: string
  system: string
  userTemplate: (params: Record<string, any>) => string
  outputSchema: Record<string, any>
  safetyRules: string[]
  temperature: number
  maxTokens: number
  reviewerRole: string
  confidenceThreshold: number
  approvedForProduction: boolean
  legalReviewDate?: string
  reviewedBy?: string
}

export interface PromptRenderResult {
  system: string
  user: string
  temperature: number
  maxTokens: number
  responseFormat: 'json' | 'text'
}

// ============================================================================
// GLOBAL SAFETY RULES
// ============================================================================

export const GLOBAL_SAFETY_RULES = [
  'NOT LEGAL ADVICE: All outputs are templates requiring attorney review before use',
  'TEMPLATE-ONLY: Use only provided templates, clauses, and source materials',
  'MISSING INFO: Return [NEEDS INPUT] placeholders for unknown information',
  'NO INVENTION: Never fabricate citations, parties, jurisdictions, or case law',
  'STRUCTURED OUTPUT: Return valid JSON only, no markdown or explanatory text',
  'CONCISE: Keep outputs structured, precise, and actionable',
  'ATTORNEY REVIEW: Flag all high-risk items for mandatory attorney review',
  'JURISDICTION: Respect jurisdiction-specific laws and regulations',
  'CONFIDENTIALITY: Never log or store sensitive client information',
  'AUDIT TRAIL: All prompt executions must be logged for compliance'
]

// ============================================================================
// DRAFTING PROMPT REGISTRY
// ============================================================================

export const DRAFTING_PROMPT_REGISTRY: Record<string, DraftingPromptConfig> = {
  
  // -------------------------------------------------------------------------
  // 1. INTENT ANALYSIS
  // -------------------------------------------------------------------------
  'drafting.intent.v1': {
    id: 'drafting.intent.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'intent_analysis',
    title: 'Intent Analysis - Convert user request to structured intent',
    description: 'Parses natural language document request into structured search filters and key facts',
    temperature: 0.3,
    maxTokens: 1000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.7,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',
    
    system: `You are LexiCore's Intent Analysis AI. Your role is to convert plain-English document requests into structured search filters.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

TASK: Analyze user input and extract:
1. Document type (employment offer, NDA, lease, etc.)
2. Industry context (if mentioned)
3. Jurisdiction (state/country if mentioned)
4. Key facts and requirements
5. Constraints or special conditions
6. Search keywords for template/clause matching

OUTPUT: Return ONLY valid JSON matching the schema. No markdown, no explanations.`,

    userTemplate: (params) => `Analyze this document request:

USER REQUEST: ${params.text}

${params.industry ? `SUGGESTED INDUSTRY: ${params.industry}` : ''}
${params.jurisdiction ? `SUGGESTED JURISDICTION: ${params.jurisdiction}` : ''}
${params.docType ? `SUGGESTED DOC TYPE: ${params.docType}` : ''}

Extract structured intent as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['docType', 'keyFacts', 'searchKeywords'],
      properties: {
        docType: { type: 'string', description: 'Document type identified' },
        industry: { type: ['string', 'null'], description: 'Industry context' },
        jurisdiction: { type: ['string', 'null'], description: 'Legal jurisdiction' },
        keyFacts: { type: 'array', items: { type: 'string' }, description: 'Key facts extracted' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints or conditions' },
        searchKeywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for search' }
      }
    },

    safetyRules: [
      'Extract only explicitly stated information',
      'Do not infer jurisdiction unless clearly mentioned',
      'Mark ambiguous document types as "General Agreement"',
      'Flag missing critical information in keyFacts'
    ]
  },

  // -------------------------------------------------------------------------
  // 2. TEMPLATE MATCHING
  // -------------------------------------------------------------------------
  'drafting.template_match.v1': {
    id: 'drafting.template_match.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'template_selection',
    title: 'Template Matching - Find best templates for intent',
    description: 'Scores and ranks templates based on user intent and requirements',
    temperature: 0.3,
    maxTokens: 2000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.6,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Template Matching AI. Your role is to score and recommend the best document templates.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

SCORING CRITERIA (0-100):
- Document type match (30%)
- Industry relevance (20%)
- Jurisdiction compatibility (20%)
- Feature completeness (20%)
- Usage success rate (10%)

RULES:
- Return top 5 templates only
- Score must be 0-100 integer
- Provide specific reasons for each recommendation
- Flag missing information that affects score
- Never recommend templates outside user's jurisdiction without warning

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Match templates to this intent:

INTENT:
${JSON.stringify(params.intent, null, 2)}

AVAILABLE TEMPLATES:
${JSON.stringify(params.templateCatalog, null, 2)}

Score each template and return top 5 recommendations as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['recommendations'],
      properties: {
        recommendations: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            required: ['templateId', 'score', 'reasons'],
            properties: {
              templateId: { type: 'string' },
              score: { type: 'integer', minimum: 0, maximum: 100 },
              reasons: { type: 'array', items: { type: 'string' } },
              missingInfo: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    },

    safetyRules: [
      'Never score above 95 - perfection requires human review',
      'Flag jurisdiction mismatches as high-priority missing info',
      'Prefer general templates over specialized when uncertain',
      'Document all scoring rationale in reasons array'
    ]
  },

  // -------------------------------------------------------------------------
  // 3. CLAUSE RECOMMENDATION
  // -------------------------------------------------------------------------
  'drafting.clause_recommend.v1': {
    id: 'drafting.clause_recommend.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'clause_selection',
    title: 'Clause Recommendation - Suggest clause set with risk assessment',
    description: 'Categorizes clauses as required/recommended/optional/risky with risk scores',
    temperature: 0.4,
    maxTokens: 3000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.7,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Clause Recommendation AI. Your role is to suggest appropriate clauses and assess risks.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

CLAUSE CATEGORIES:
1. REQUIRED: Essential for legal validity (severability, governing law, signatures)
2. RECOMMENDED: Best practice for document type (confidentiality, termination, indemnity)
3. OPTIONAL: Beneficial but not essential (arbitration, force majeure, notice provisions)
4. RISKY: Requires attorney review (non-compete, liquidated damages, broad liability waivers)

RISK SCORING (1-10):
- 1-3: Low risk, standard language
- 4-6: Medium risk, needs attention
- 7-8: High risk, attorney review recommended
- 9-10: Critical risk, attorney review MANDATORY

JURISDICTION CONSIDERATIONS:
- CA: Non-competes limited, strict employment law
- NY: Strong contract law, arbitration friendly
- TX: Business-friendly, broad contract freedom
- Federal: Complex regulations, compliance critical

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Recommend clauses for this document:

INTENT:
${JSON.stringify(params.intent, null, 2)}

TEMPLATE SUMMARY:
${JSON.stringify(params.templateSummary, null, 2)}

AVAILABLE CLAUSES:
${JSON.stringify(params.clauseCatalog, null, 2)}

Categorize and score each clause. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['required', 'recommended', 'optional', 'risky', 'overallRiskSummary'],
      properties: {
        required: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clauseId', 'reason', 'riskScore'],
            properties: {
              clauseId: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { type: 'integer', minimum: 1, maximum: 10 }
            }
          }
        },
        recommended: { type: 'array', items: { type: 'object' } },
        optional: { type: 'array', items: { type: 'object' } },
        risky: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clauseId', 'reason', 'riskScore', 'reviewNote'],
            properties: {
              clauseId: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { type: 'integer', minimum: 7, maximum: 10 },
              reviewNote: { type: 'string', description: 'Attorney review guidance' }
            }
          }
        },
        overallRiskSummary: { type: 'string' }
      }
    },

    safetyRules: [
      'Always include governing law and severability as required',
      'Flag non-standard clauses as risky regardless of content',
      'Consider jurisdiction-specific limitations (e.g., CA non-compete)',
      'Provide specific attorney review notes for all risky clauses',
      'Never recommend clauses that contradict each other'
    ]
  },

  // -------------------------------------------------------------------------
  // 4. VARIABLE EXTRACTION
  // -------------------------------------------------------------------------
  'drafting.variable_extract.v1': {
    id: 'drafting.variable_extract.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'variable_extraction',
    title: 'Variable Extraction - Identify and autofill document variables',
    description: 'Determines required variables from template/clauses and attempts autofill from context',
    temperature: 0.3,
    maxTokens: 2000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.75,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Variable Extraction AI. Your role is to identify required document variables and autofill from available context.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

VARIABLE TYPES:
- text: Free-form text (names, addresses, descriptions)
- date: ISO 8601 dates (YYYY-MM-DD)
- number: Numeric values (salary, amounts, terms)
- select: Predefined options (jurisdiction, entity type)

AUTOFILL RULES:
- Extract only explicitly stated information
- Never infer dates, amounts, or names
- Use null for uncertain values
- Document assumptions in assumptions array
- Flag all missing required variables

VALIDATION:
- Dates must be ISO 8601 format
- Amounts must include currency (USD default)
- Jurisdictions must be 2-letter codes or full names
- Names must be properly capitalized

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Extract and autofill variables:

TEMPLATE VARIABLES:
${JSON.stringify(params.templateVariables, null, 2)}

CLAUSE VARIABLES:
${JSON.stringify(params.selectedClausesVariables, null, 2)}

USER TEXT:
${params.userText}

${params.extractedSources ? `ADDITIONAL SOURCES:\n${JSON.stringify(params.extractedSources, null, 2)}` : ''}

Identify all required variables and attempt autofill. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['requiredVariables', 'autofill', 'missing', 'assumptions'],
      properties: {
        requiredVariables: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'label', 'type', 'required'],
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              type: { type: 'string', enum: ['text', 'date', 'number', 'select'] },
              required: { type: 'boolean' },
              options: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        autofill: {
          type: 'object',
          description: 'Key-value pairs of autofilled variables'
        },
        missing: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'why'],
            properties: {
              key: { type: 'string' },
              why: { type: 'string', description: 'Reason value cannot be determined' }
            }
          }
        },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of assumptions made during autofill'
        }
      }
    },

    safetyRules: [
      'Never invent party names or legal entities',
      'Never guess dates - require explicit input',
      'Never infer financial terms or compensation',
      'Always validate date formats before returning',
      'Document all assumptions explicitly',
      'Flag ambiguous values as missing rather than guessing'
    ]
  },

  // -------------------------------------------------------------------------
  // 5. VARIABLE QUESTIONS
  // -------------------------------------------------------------------------
  'drafting.variable_questions.v1': {
    id: 'drafting.variable_questions.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'user_interaction',
    title: 'Variable Questions - Generate clarifying questions for missing variables',
    description: 'Creates clear, specific questions to collect missing information from user',
    temperature: 0.4,
    maxTokens: 1000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.8,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Variable Questions AI. Your role is to generate clear, specific questions for missing document variables.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

QUESTION GUIDELINES:
- Maximum 5 questions at a time (avoid overwhelming user)
- Prioritize required variables over optional
- Use plain English, avoid legal jargon
- Provide helpful example answers
- Group related variables when possible
- Be specific about format requirements (dates, amounts)

QUESTION QUALITY:
- GOOD: "What is the employee's start date? (Example: 2026-02-01)"
- BAD: "When does the person start?"
- GOOD: "What is the annual salary in USD? (Example: 170000)"
- BAD: "How much?"

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Generate questions for missing variables:

MISSING VARIABLES:
${JSON.stringify(params.missingVariables, null, 2)}

CONTEXT:
${JSON.stringify(params.context, null, 2)}

Create max 5 clear questions with examples. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            required: ['key', 'question', 'exampleAnswer'],
            properties: {
              key: { type: 'string', description: 'Variable key' },
              question: { type: 'string', description: 'Clear, specific question' },
              exampleAnswer: { type: 'string', description: 'Example answer with format' }
            }
          }
        }
      }
    },

    safetyRules: [
      'Prioritize required over optional variables',
      'Group related questions (all party info together)',
      'Provide format examples for dates, amounts, codes',
      'Use plain English, avoid legalese',
      'Never ask leading or suggestive questions'
    ]
  },

  // -------------------------------------------------------------------------
  // 6. RISK SUMMARY
  // -------------------------------------------------------------------------
  'drafting.risk_summary.v1': {
    id: 'drafting.risk_summary.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'risk_assessment',
    title: 'Risk Summary - Assess legal and compliance risks',
    description: 'Analyzes selected clauses and variables to identify legal risks and compliance issues',
    temperature: 0.4,
    maxTokens: 2500,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.8,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Risk Summary AI. Your role is to identify legal and compliance risks in document drafts.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

RISK ANALYSIS AREAS:
1. Jurisdiction compliance (state/federal law)
2. Contradicting clauses
3. Missing required clauses
4. Overly broad/narrow language
5. Industry-specific regulations
6. Enforceability issues

RISK SCORING (1-10):
- 1-3: Minor issue, easily resolved
- 4-6: Moderate risk, needs review
- 7-8: Significant risk, attorney input required
- 9-10: Critical risk, must address before execution

MITIGATION:
- Provide specific, actionable recommendations
- Reference applicable laws/regulations
- Suggest alternative language when appropriate
- Flag items requiring attorney consultation

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Assess risks for this document:

JURISDICTION: ${params.jurisdiction}

SELECTED CLAUSES:
${JSON.stringify(params.clauses, null, 2)}

VARIABLES:
${JSON.stringify(params.variables, null, 2)}

Identify all legal and compliance risks. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['riskItems'],
      properties: {
        riskItems: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'riskScore', 'explanation', 'mitigation'],
            properties: {
              title: { type: 'string', description: 'Risk title (brief)' },
              riskScore: { type: 'integer', minimum: 1, maximum: 10 },
              explanation: { type: 'string', description: 'Detailed risk explanation' },
              mitigation: { type: 'string', description: 'Recommended mitigation steps' },
              affectedClauses: { type: 'array', items: { type: 'string' } },
              lawsRegulations: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    },

    safetyRules: [
      'Always flag jurisdiction-specific issues (CA non-compete, etc.)',
      'Identify contradicting clauses as high-risk',
      'Reference specific laws when possible',
      'Provide actionable mitigation, not generic advice',
      'Be conservative - err on side of flagging risks'
    ]
  },

  // -------------------------------------------------------------------------
  // 7. DOCUMENT ASSEMBLY / PREVIEW
  // -------------------------------------------------------------------------
  'drafting.assemble_preview.v1': {
    id: 'drafting.assemble_preview.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'document_assembly',
    title: 'Document Assembly - Generate formatted preview',
    description: 'Assembles final document structure with proper formatting and variable substitution',
    temperature: 0.2,
    maxTokens: 4000,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.9,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Document Assembly AI. Your role is to create properly formatted legal documents.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

FORMATTING RULES:
- Use proper section numbering (1, 1.1, 1.1.1)
- UPPERCASE defined terms on first use
- Consistent heading styles
- Proper signature blocks
- Date placeholders as [DATE: description]
- Amount placeholders as [AMOUNT: description]
- Party placeholders as [PARTY: role]

STRUCTURE:
1. Title
2. Parties (with addresses)
3. Recitals (WHEREAS clauses)
4. Main Agreement Sections
5. General Provisions
6. Signatures

VARIABLE SUBSTITUTION:
- Replace {{variable}} with actual values
- Keep [PLACEHOLDER: description] for missing values
- Format dates consistently
- Format amounts with currency symbols

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Assemble document preview:

TEMPLATE:
${JSON.stringify(params.templateTextOrStructure, null, 2)}

CLAUSES:
${JSON.stringify(params.clausesTextOrStructure, null, 2)}

VARIABLES:
${JSON.stringify(params.variables, null, 2)}

PARTIES:
${JSON.stringify(params.parties, null, 2)}

Create formatted preview with proper structure. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['documentTitle', 'sections', 'unresolvedPlaceholders'],
      properties: {
        documentTitle: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['heading', 'content'],
            properties: {
              heading: { type: 'string' },
              content: { type: 'string', description: 'Formatted section content' },
              sourceClauseIds: { type: 'array', items: { type: 'string' } },
              placeholders: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        unresolvedPlaceholders: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of placeholders still needing values'
        }
      }
    },

    safetyRules: [
      'Never modify clause substantive language',
      'Preserve legal terminology exactly',
      'Use consistent formatting throughout',
      'Clearly mark all unresolved placeholders',
      'Maintain proper section hierarchy',
      'Include signature blocks for all signers'
    ]
  },

  // -------------------------------------------------------------------------
  // 8. CLAUSE REWRITE (Optional, Controlled)
  // -------------------------------------------------------------------------
  'drafting.rewrite_clause.v1': {
    id: 'drafting.rewrite_clause.v1',
    version: '1.0.0',
    practiceAreas: ['Corporate', 'Transactional', 'Real Estate', 'Employment', 'IP', 'Litigation'],
    module: 'drafting',
    taskType: 'clause_modification',
    title: 'Clause Rewrite - Controlled tone/style adjustments only',
    description: 'Rewrites clause text with tone changes ONLY - no substantive legal changes',
    temperature: 0.3,
    maxTokens: 1500,
    reviewerRole: 'attorney',
    confidenceThreshold: 0.85,
    approvedForProduction: true,
    legalReviewDate: '2026-01-13',
    reviewedBy: 'Legal Engineering Team',

    system: `You are LexiCore's Clause Rewrite AI. Your role is to adjust tone and style ONLY - NO substantive legal changes.

${GLOBAL_SAFETY_RULES.map(rule => `- ${rule}`).join('\n')}

ALLOWED CHANGES:
- Tone adjustments (formal <-> conversational)
- Sentence structure improvements
- Clarity enhancements (removing ambiguity)
- Plain language alternatives (when legally equivalent)

STRICTLY PROHIBITED:
- Changing legal rights or obligations
- Adding or removing substantive terms
- Altering liability or risk allocation
- Modifying defined terms
- Changing scope or applicability

VALIDATION:
- Rewritten text must have same legal effect
- Document ALL changes in notes array
- Flag any ambiguities for attorney review
- Preserve defined terms exactly

OUTPUT: Return ONLY valid JSON matching the schema.`,

    userTemplate: (params) => `Rewrite this clause with controlled changes:

ORIGINAL CLAUSE:
${params.clauseText}

INSTRUCTION:
${params.instruction}

CONSTRAINTS:
${JSON.stringify(params.constraints, null, 2)}

Rewrite with tone/style changes only. Document all changes. Return JSON only.`,

    outputSchema: {
      type: 'object',
      required: ['rewritten', 'notes'],
      properties: {
        rewritten: { type: 'string', description: 'Rewritten clause text' },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of all changes made with justification'
        },
        legalEquivalence: {
          type: 'boolean',
          description: 'Confirms legal effect unchanged'
        },
        reviewRequired: {
          type: 'boolean',
          description: 'Flags need for attorney review'
        }
      }
    },

    safetyRules: [
      'NEVER change substantive legal terms',
      'Document every single change in notes',
      'Preserve defined terms exactly as written',
      'Flag any uncertainty for attorney review',
      'Maintain same level of specificity',
      'Do not add or remove obligations'
    ]
  }
}

// ============================================================================
// PROMPT REGISTRY SERVICE
// ============================================================================

export class DraftingPromptRegistry {
  private baseRegistry: PromptRegistryService

  constructor(db: D1Database) {
    this.baseRegistry = new PromptRegistryService(db)
  }

  /**
   * Get prompt configuration by ID and version
   */
  getPrompt(name: string, version?: string): DraftingPromptConfig | null {
    const key = version ? `${name}.${version}` : name
    return DRAFTING_PROMPT_REGISTRY[key] || null
  }

  /**
   * Render prompt with parameters
   */
  renderPrompt(name: string, params: Record<string, any>, version?: string): PromptRenderResult {
    const prompt = this.getPrompt(name, version)
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}${version ? `.${version}` : ''}`)
    }

    if (!prompt.approvedForProduction) {
      throw new Error(`Prompt not approved for production: ${name}`)
    }

    return {
      system: prompt.system,
      user: prompt.userTemplate(params),
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
      responseFormat: 'json'
    }
  }

  /**
   * Validate output against schema
   */
  validateOutput(name: string, data: any, version?: string): { valid: boolean; errors: string[] } {
    const prompt = this.getPrompt(name, version)
    if (!prompt) {
      return { valid: false, errors: [`Prompt not found: ${name}`] }
    }

    const errors: string[] = []
    const schema = prompt.outputSchema

    // Basic type checking (simplified - in production use a proper JSON schema validator)
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    // Validate nested structure
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      if (key in data) {
        const value = data[key]
        const prop = propSchema as any

        if (prop.type === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${key} must be an array`)
        }
        if (prop.type === 'object' && typeof value !== 'object') {
          errors.push(`Field ${key} must be an object`)
        }
        if (prop.type === 'string' && typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`)
        }
        if (prop.type === 'integer' && !Number.isInteger(value)) {
          errors.push(`Field ${key} must be an integer`)
        }

        // Validate ranges
        if (prop.minimum !== undefined && value < prop.minimum) {
          errors.push(`Field ${key} must be >= ${prop.minimum}`)
        }
        if (prop.maximum !== undefined && value > prop.maximum) {
          errors.push(`Field ${key} must be <= ${prop.maximum}`)
        }

        // Validate enums
        if (prop.enum && !prop.enum.includes(value)) {
          errors.push(`Field ${key} must be one of: ${prop.enum.join(', ')}`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Log prompt execution to database
   */
  async logExecution(
    promptId: string,
    params: {
      matterId?: number
      documentId?: number
      practiceArea?: string
      inputPreview?: string
      outputPreview?: string
      confidenceScore?: number
      executionTimeMs?: number
      validationPassed: boolean
      validationErrors?: string[]
      userId?: number
    }
  ): Promise<void> {
    const prompt = this.getPrompt(promptId)
    if (!prompt) return

    try {
      await this.baseRegistry.logUsage({
        prompt_id: promptId,
        matter_id: params.matterId,
        document_id: params.documentId,
        practice_area: params.practiceArea || prompt.practiceAreas[0],
        input_preview: params.inputPreview?.substring(0, 500),
        output_preview: params.outputPreview?.substring(0, 500),
        confidence_score: params.confidenceScore,
        execution_time_ms: params.executionTimeMs,
        validation_passed: params.validationPassed,
        validation_errors: params.validationErrors,
        user_id: params.userId
      })
    } catch (error) {
      console.error('Failed to log prompt execution:', error)
    }
  }

  /**
   * List all drafting prompts
   */
  listPrompts(): DraftingPromptConfig[] {
    return Object.values(DRAFTING_PROMPT_REGISTRY)
      .filter(p => p.approvedForProduction)
      .sort((a, b) => a.taskType.localeCompare(b.taskType))
  }

  /**
   * Get prompts by task type
   */
  getPromptsByTaskType(taskType: string): DraftingPromptConfig[] {
    return Object.values(DRAFTING_PROMPT_REGISTRY)
      .filter(p => p.taskType === taskType && p.approvedForProduction)
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick helper to get and render a prompt
 */
export function getDraftingPrompt(
  db: D1Database,
  name: string,
  params: Record<string, any>,
  version?: string
): PromptRenderResult {
  const registry = new DraftingPromptRegistry(db)
  return registry.renderPrompt(name, params, version)
}

/**
 * Quick helper to validate output
 */
export function validateDraftingOutput(
  db: D1Database,
  name: string,
  data: any,
  version?: string
): { valid: boolean; errors: string[] } {
  const registry = new DraftingPromptRegistry(db)
  return registry.validateOutput(name, data, version)
}
