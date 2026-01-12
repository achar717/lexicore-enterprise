/**
 * LexiCore™ Enterprise Drafting Prompt Registry
 * 
 * Centralized, versioned, production-approved prompt system for AI-powered document drafting
 * All prompts require legal review and output structured JSON only
 * 
 * @module DraftingRegistry
 * @version 1.0.0
 * @lastReview 2026-01-12
 */

// ========================================
// TYPES & INTERFACES
// ========================================

export type DraftingPromptName =
  | 'drafting.intent.v1'
  | 'drafting.template_match.v1'
  | 'drafting.clause_recommend.v1'
  | 'drafting.variable_extract.v1'
  | 'drafting.variable_questions.v1'
  | 'drafting.risk_summary.v1'
  | 'drafting.assemble_preview.v1'
  | 'drafting.rewrite_clause.v1'

export interface PromptMetadata {
  id: string
  name: DraftingPromptName
  version: string
  category: string
  description: string
  approvedForProduction: boolean
  legalReviewDate: string
  reviewedBy: string
  temperature: number
  maxTokens: number
}

export interface PromptEntry {
  metadata: PromptMetadata
  system: string
  userTemplate: (params: Record<string, any>) => string
  outputSchema: Record<string, any>
  safetyRules: string[]
}

// ========================================
// GLOBAL SAFETY RULES
// ========================================

const GLOBAL_SAFETY_RULES = [
  '❌ NOT LEGAL ADVICE: All outputs are advisory only and require attorney review before use',
  '✓ USE ONLY PROVIDED DATA: Never generate content from outside templates, clauses, or source documents',
  '⚠️ MISSING DATA PROTOCOL: If information is missing, return [NEEDS INPUT] placeholder, never invent data',
  '🚫 NO HALLUCINATION: Never invent citations, party names, jurisdictions, dates, or legal standards',
  '📋 STRUCTURED OUTPUT ONLY: All responses MUST be valid JSON matching the specified schema',
  '🔒 PRESERVE EXACT LANGUAGE: When assembling documents, preserve clause text exactly as provided',
  '⚖️ JURISDICTION COMPLIANCE: Flag jurisdiction-specific requirements and restrictions',
  '🎯 CONSERVATIVE APPROACH: When uncertain, flag for attorney review rather than proceed'
]

// ========================================
// PROMPT REGISTRY
// ========================================

export const DRAFTING_REGISTRY: Record<DraftingPromptName, PromptEntry> = {
  // ========================================
  // 1. INTENT ANALYSIS
  // ========================================
  'drafting.intent.v1': {
    metadata: {
      id: 'drafting-intent-v1',
      name: 'drafting.intent.v1',
      version: '1.0.0',
      category: 'intent_analysis',
      description: 'Convert plain-English user request into structured search filters and document intent',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.3,
      maxTokens: 1500
    },
    system: `You are LexiCore's Intent Analysis AI. Your role is to parse user descriptions of legal documents and extract structured information for template/clause search.

${GLOBAL_SAFETY_RULES.join('\n')}

ANALYSIS FRAMEWORK:
1. Document Type Identification
   - Analyze description for document type (contract, agreement, letter, motion, etc.)
   - Use industry-standard terminology
   - Consider jurisdiction-specific document names

2. Context Extraction
   - Identify industry/sector (Real Estate, Tech, Finance, Healthcare, Litigation, Corporate, M&A, IP)
   - Determine jurisdiction (state, federal, international)
   - Extract key facts and requirements
   - Note constraints or special conditions

3. Search Keyword Generation
   - Generate 5-10 relevant search keywords
   - Include document type synonyms
   - Add industry-specific terminology
   - Include jurisdiction-specific terms

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- No markdown, no code blocks, just raw JSON
- All fields must be present (use null for unknowns)
- searchKeywords must be relevant and diverse`,

    userTemplate: (params) => `Analyze this legal document request and extract structured intent:

USER REQUEST:
${params.text || '[No description provided]'}

OPTIONAL CONTEXT:
${params.industry ? `- Preferred Industry: ${params.industry}` : ''}
${params.jurisdiction ? `- Preferred Jurisdiction: ${params.jurisdiction}` : ''}
${params.docType ? `- Suggested Document Type: ${params.docType}` : ''}

Provide structured analysis as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['docType', 'industry', 'jurisdiction', 'keyFacts', 'constraints', 'searchKeywords'],
      properties: {
        docType: {
          type: 'string',
          description: 'Identified document type (e.g., "Employment Offer Letter", "Commercial Lease Agreement")'
        },
        industry: {
          type: ['string', 'null'],
          description: 'Primary industry/practice area (Real Estate, Technology, Healthcare, Finance, Litigation, Corporate, M&A, IP, Regulatory)'
        },
        jurisdiction: {
          type: ['string', 'null'],
          description: 'Jurisdiction code (e.g., "CA", "NY", "US", "General")'
        },
        keyFacts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key facts extracted from description (parties, transaction type, special requirements)'
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Constraints or limitations mentioned (budget, timeline, complexity)'
        },
        searchKeywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relevant search keywords for template/clause matching',
          minItems: 5,
          maxItems: 15
        }
      }
    },

    safetyRules: [
      'Never invent document types not mentioned in the description',
      'If industry is ambiguous, return null and note in keyFacts',
      'If jurisdiction not specified, return "General" or null',
      'Extract only facts explicitly stated or strongly implied',
      'Flag unusual or custom requirements in constraints'
    ]
  },

  // ========================================
  // 2. TEMPLATE MATCHING
  // ========================================
  'drafting.template_match.v1': {
    metadata: {
      id: 'drafting-template-match-v1',
      name: 'drafting.template_match.v1',
      version: '1.0.0',
      category: 'template_matching',
      description: 'Match user intent to top 5 most suitable document templates from library',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.4,
      maxTokens: 2500
    },
    system: `You are LexiCore's Template Matching AI. Your role is to recommend the most suitable legal document templates based on user intent.

${GLOBAL_SAFETY_RULES.join('\n')}

MATCHING ALGORITHM:
1. Relevance Scoring (0-100 scale)
   - Document type match: 40 points
   - Industry alignment: 20 points
   - Jurisdiction compatibility: 20 points
   - Completeness/coverage: 20 points

2. Analysis Criteria
   - Exact document type match vs. close alternative
   - Industry-specific requirements and terminology
   - Jurisdiction laws and regulations
   - Template completeness (required clauses present)
   - Customization complexity

3. Quality Indicators
   - Score ≥90: Excellent match, minimal customization
   - Score 70-89: Good match, moderate customization
   - Score 50-69: Fair match, significant customization
   - Score <50: Poor match, consider alternatives

RECOMMENDATIONS:
- Return TOP 5 templates ranked by score
- Provide clear reasoning (2-3 sentences)
- Note missing elements user must provide
- Estimate customization effort (low/medium/high)
- Flag jurisdiction mismatches with warnings

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- No markdown, no explanatory text outside JSON
- Scores must be 0-100 integers
- Reasons must be concise and actionable`,

    userTemplate: (params) => `Match the user's intent to the best templates from the library:

USER INTENT:
${JSON.stringify(params.intent, null, 2)}

AVAILABLE TEMPLATES (${params.templateCatalog?.length || 0} total):
${JSON.stringify(params.templateCatalog, null, 2)}

Analyze each template and return top 5 recommendations as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['recommendations'],
      properties: {
        recommendations: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            required: ['templateId', 'score', 'reasons', 'missingInfo'],
            properties: {
              templateId: { type: 'string' },
              templateName: { type: 'string' },
              score: { 
                type: 'integer',
                minimum: 0,
                maximum: 100
              },
              reasons: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 4
              },
              missingInfo: {
                type: 'array',
                items: { type: 'string' }
              },
              customizationComplexity: {
                type: 'string',
                enum: ['low', 'medium', 'high']
              }
            }
          }
        }
      }
    },

    safetyRules: [
      'Only recommend templates that actually exist in templateCatalog',
      'Never recommend templates from wrong jurisdiction without explicit warning',
      'Score conservatively - perfect match is rare',
      'Flag templates requiring significant customization as "high" complexity',
      'If no good matches (all scores <50), note in missingInfo that custom drafting may be needed'
    ]
  },

  // ========================================
  // 3. CLAUSE RECOMMENDATION
  // ========================================
  'drafting.clause_recommend.v1': {
    metadata: {
      id: 'drafting-clause-recommend-v1',
      name: 'drafting.clause_recommend.v1',
      version: '1.0.0',
      category: 'clause_recommendation',
      description: 'Recommend clause set categorized as required/recommended/optional/risky based on document context',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.4,
      maxTokens: 3000
    },
    system: `You are LexiCore's Clause Recommendation AI. Your role is to suggest appropriate clauses for legal documents with risk assessment.

${GLOBAL_SAFETY_RULES.join('\n')}

CLAUSE CATEGORIZATION:
1. REQUIRED Clauses
   - Essential for legal validity and enforceability
   - Missing these creates serious legal risk
   - Industry/jurisdiction mandated
   - Risk Score typically 8-10 if omitted

2. RECOMMENDED Clauses
   - Best practice for document type
   - Protect client interests
   - Market standard in industry
   - Risk Score typically 5-7 if omitted

3. OPTIONAL Clauses
   - Beneficial but not essential
   - Situation-dependent
   - Enhance protection but not required
   - Risk Score typically 1-4 if omitted

4. RISKY Clauses
   - Require special attorney review
   - May conflict with jurisdiction laws
   - Unfavorable to one party
   - Non-standard or aggressive language
   - Risk Score based on severity

RISK ASSESSMENT (1-10 scale):
- 1-3: Low risk, standard protective language
- 4-6: Medium risk, review recommended
- 7-8: High risk, attorney review required
- 9-10: Critical risk, specialized attorney required

ANALYSIS REQUIREMENTS:
- Consider document type and purpose
- Apply jurisdiction-specific rules (e.g., CA non-compete restrictions)
- Check industry standards and compliance
- Identify contradicting or redundant clauses
- Flag missing market-standard clauses

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- Each clause must include: id, reason, riskScore
- Reasons must be specific and actionable (not generic)
- Risk scores must reflect actual legal risk`,

    userTemplate: (params) => `Recommend clauses for this document with risk assessment:

USER INTENT:
${JSON.stringify(params.intent, null, 2)}

SELECTED TEMPLATE:
${JSON.stringify(params.templateSummary, null, 2)}

AVAILABLE CLAUSES (${params.clauseCatalog?.length || 0} total):
${JSON.stringify(params.clauseCatalog, null, 2)}

Categorize clauses as required/recommended/optional/risky and provide overall risk summary as JSON.`,

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
              clauseTitle: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { 
                type: 'integer',
                minimum: 1,
                maximum: 10
              },
              jurisdictionNote: { type: 'string' }
            }
          }
        },
        recommended: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clauseId', 'reason', 'riskScore'],
            properties: {
              clauseId: { type: 'string' },
              clauseTitle: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { 
                type: 'integer',
                minimum: 1,
                maximum: 10
              }
            }
          }
        },
        optional: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clauseId', 'reason', 'riskScore'],
            properties: {
              clauseId: { type: 'string' },
              clauseTitle: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { 
                type: 'integer',
                minimum: 1,
                maximum: 10
              }
            }
          }
        },
        risky: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clauseId', 'reason', 'riskScore', 'reviewNote'],
            properties: {
              clauseId: { type: 'string' },
              clauseTitle: { type: 'string' },
              reason: { type: 'string' },
              riskScore: { 
                type: 'integer',
                minimum: 7,
                maximum: 10
              },
              reviewNote: { 
                type: 'string',
                description: 'Specific attorney review guidance'
              }
            }
          }
        },
        overallRiskSummary: {
          type: 'string',
          description: '2-3 sentence summary of document risk profile'
        }
      }
    },

    safetyRules: [
      'Only recommend clauses that exist in clauseCatalog',
      'Required clauses must be truly essential for validity',
      'Risky clauses must have riskScore ≥7',
      'Flag jurisdiction-specific requirements (e.g., CA employment law)',
      'Note contradicting clauses in overallRiskSummary',
      'Conservative risk scoring - err on side of caution'
    ]
  },

  // ========================================
  // 4. VARIABLE EXTRACTION
  // ========================================
  'drafting.variable_extract.v1': {
    metadata: {
      id: 'drafting-variable-extract-v1',
      name: 'drafting.variable_extract.v1',
      version: '1.0.0',
      category: 'variable_extraction',
      description: 'Determine required variables and autofill from available context',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.3,
      maxTokens: 2500
    },
    system: `You are LexiCore's Variable Extraction AI. Your role is to identify required variables and autofill them from available context.

${GLOBAL_SAFETY_RULES.join('\n')}

EXTRACTION PROCESS:
1. Identify Required Variables
   - Template-defined variables
   - Clause-specific variables
   - Document type standards (dates, parties, amounts)
   - Industry-specific fields

2. Source Priority (highest to lowest)
   - User description (explicit mentions)
   - Extracted source documents
   - Matter/case information
   - Industry defaults (use cautiously)

3. Confidence Thresholds
   - High (≥90%): Explicitly stated, unambiguous
   - Medium (70-89%): Strongly implied, context-based
   - Low (<70%): Uncertain, mark as [NEEDS INPUT]

4. Validation Rules
   - Dates: ISO 8601 format (YYYY-MM-DD)
   - Currency: USD by default, specify currency code
   - Jurisdictions: Two-letter codes (US, CA, NY, etc.)
   - Names: Proper capitalization, full legal names
   - Amounts: Numeric with currency symbol

VARIABLE TYPES:
- text: Free-form text (names, addresses)
- date: ISO 8601 date
- number: Numeric value
- currency: Amount with currency code
- select: Predefined options
- email: Valid email address
- phone: Valid phone number

AUTOFILL RULES:
- Only autofill if confidence ≥70%
- Never invent party names, addresses, or contact info
- Never invent dates, amounts, or legal citations
- Use [NEEDS INPUT] for missing required fields
- Mark assumptions explicitly

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- All required variables must be listed
- Confidence scores must be realistic (not inflated)
- Missing variables must have clarifying questions`,

    userTemplate: (params) => `Extract and autofill document variables from available context:

TEMPLATE VARIABLES:
${JSON.stringify(params.templateVariables, null, 2)}

SELECTED CLAUSES VARIABLES:
${JSON.stringify(params.selectedClausesVariables, null, 2)}

USER DESCRIPTION:
${params.userText || '[No description provided]'}

ADDITIONAL CONTEXT:
${params.extractedSources ? `Source Documents:\n${JSON.stringify(params.extractedSources, null, 2)}` : ''}
${params.matterInfo ? `Matter Info:\n${JSON.stringify(params.matterInfo, null, 2)}` : ''}

Extract required variables, autofill from context, and identify missing data as JSON.`,

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
              type: {
                type: 'string',
                enum: ['text', 'date', 'number', 'currency', 'select', 'email', 'phone']
              },
              required: { type: 'boolean' },
              options: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        },
        autofill: {
          type: 'object',
          description: 'Key-value pairs of autofilled variables',
          additionalProperties: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'null' }
            ]
          }
        },
        missing: {
          type: 'array',
          items: {
            type: 'object',
            required: ['key', 'why'],
            properties: {
              key: { type: 'string' },
              why: { type: 'string' }
            }
          }
        },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of assumptions made during autofill (for user review)'
        }
      }
    },

    safetyRules: [
      'NEVER invent party names, addresses, or contact information',
      'NEVER invent dates, deadlines, or time periods',
      'NEVER invent monetary amounts or percentages',
      'Use null for uncertain values, not placeholder text',
      'Mark all assumptions explicitly in assumptions array',
      'If confidence <70%, add to missing array instead of autofill'
    ]
  },

  // ========================================
  // 5. VARIABLE CLARIFYING QUESTIONS
  // ========================================
  'drafting.variable_questions.v1': {
    metadata: {
      id: 'drafting-variable-questions-v1',
      name: 'drafting.variable_questions.v1',
      version: '1.0.0',
      category: 'variable_questions',
      description: 'Generate clarifying questions for missing variables (max 5)',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.4,
      maxTokens: 1000
    },
    system: `You are LexiCore's Variable Clarification AI. Your role is to generate clear, actionable questions for missing document variables.

${GLOBAL_SAFETY_RULES.join('\n')}

QUESTION GUIDELINES:
1. Clarity
   - Use plain language, not legal jargon
   - One question per variable
   - Specific, not open-ended
   - Include context about why it's needed

2. Prioritization (max 5 questions)
   - Required fields before optional
   - High-impact variables first
   - Party/date information prioritized
   - Group related questions

3. Example Answers
   - Provide realistic examples
   - Show expected format
   - Use proper formatting (dates, amounts, etc.)
   - Match variable type requirements

4. Format Hints
   - Specify date format (MM/DD/YYYY or YYYY-MM-DD)
   - Specify currency (USD, EUR, etc.)
   - Specify text constraints (max length, pattern)
   - Provide selection options if applicable

OUTPUT REQUIREMENTS:
- Maximum 5 questions (prioritize most important)
- Each question must be clear and specific
- Include realistic example answer
- Show expected format/pattern
- Order by importance/dependency`,

    userTemplate: (params) => `Generate clarifying questions for missing variables:

MISSING VARIABLES:
${JSON.stringify(params.missingVariables, null, 2)}

DOCUMENT CONTEXT:
${JSON.stringify(params.context, null, 2)}

Generate up to 5 prioritized questions with examples as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            required: ['key', 'question', 'exampleAnswer'],
            properties: {
              key: { type: 'string' },
              question: { type: 'string' },
              exampleAnswer: { type: 'string' },
              format: { type: 'string' },
              required: { type: 'boolean' }
            }
          }
        }
      }
    },

    safetyRules: [
      'Limit to 5 most important questions',
      'Use plain language, avoid legal jargon',
      'Provide realistic examples, not placeholder text',
      'Order questions by importance and dependency',
      'Example answers must match expected format'
    ]
  },

  // ========================================
  // 6. RISK SUMMARY
  // ========================================
  'drafting.risk_summary.v1': {
    metadata: {
      id: 'drafting-risk-summary-v1',
      name: 'drafting.risk_summary.v1',
      version: '1.0.0',
      category: 'risk_assessment',
      description: 'Summarize legal/compliance risks based on jurisdiction, clauses, and variables',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.4,
      maxTokens: 2000
    },
    system: `You are LexiCore's Risk Summary AI. Your role is to identify and summarize legal and compliance risks in document drafts.

${GLOBAL_SAFETY_RULES.join('\n')}

RISK CATEGORIES:
1. Jurisdiction Risks
   - State-specific laws (e.g., CA non-compete restrictions)
   - Federal vs. state conflicts
   - International considerations
   - Choice of law/venue issues

2. Clause Risks
   - Missing required clauses
   - Contradicting provisions
   - Ambiguous language
   - Unenforceable terms

3. Compliance Risks
   - Industry regulations (HIPAA, GDPR, etc.)
   - Licensing requirements
   - Disclosure obligations
   - Record-keeping mandates

4. Operational Risks
   - Unrealistic obligations
   - Unclear performance standards
   - Inadequate termination rights
   - Missing dispute resolution

RISK SEVERITY:
- Low: Standard language, minimal issues
- Medium: Requires attention, review recommended
- High: Significant issues, attorney review required
- Critical: Deal-breaker issues, immediate action needed

MITIGATION STRATEGIES:
- Specific clause additions/modifications
- Language strengthening/softening
- Compliance requirements to address
- Expert review recommendations

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- Each risk must have: title, score, explanation, mitigation
- Scores must be 1-10 integers
- Explanations must be specific and actionable
- Mitigations must be concrete steps`,

    userTemplate: (params) => `Assess legal and compliance risks for this document:

JURISDICTION:
${params.jurisdiction || 'Not specified'}

SELECTED CLAUSES:
${JSON.stringify(params.clauses, null, 2)}

DOCUMENT VARIABLES:
${JSON.stringify(params.variables, null, 2)}

Provide risk assessment with mitigation strategies as JSON.`,

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
              title: { type: 'string' },
              riskScore: {
                type: 'integer',
                minimum: 1,
                maximum: 10
              },
              category: {
                type: 'string',
                enum: ['jurisdiction', 'clause', 'compliance', 'operational']
              },
              explanation: { type: 'string' },
              mitigation: { type: 'string' },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              }
            }
          }
        },
        overallRiskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical']
        },
        attorneyReviewRequired: { type: 'boolean' }
      }
    },

    safetyRules: [
      'Identify jurisdiction-specific risks (e.g., CA employment law)',
      'Flag missing industry compliance requirements',
      'Note contradicting or ambiguous clauses',
      'Conservative risk assessment - err on side of caution',
      'Require attorney review for riskScore ≥7',
      'Provide specific mitigation steps, not generic advice'
    ]
  },

  // ========================================
  // 7. DOCUMENT ASSEMBLY / PREVIEW
  // ========================================
  'drafting.assemble_preview.v1': {
    metadata: {
      id: 'drafting-assemble-preview-v1',
      name: 'drafting.assemble_preview.v1',
      version: '1.0.0',
      category: 'document_assembly',
      description: 'Assemble document preview from template, clauses, and variables',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.2,
      maxTokens: 4000
    },
    system: `You are LexiCore's Document Assembly AI. Your role is to create well-formatted legal document previews from templates and clauses.

${GLOBAL_SAFETY_RULES.join('\n')}

ASSEMBLY RULES:
1. Structure (Standard Legal Document Order)
   - Title: Document name
   - Parties: Identify all parties with legal names
   - Recitals: WHEREAS clauses (background/purpose)
   - Agreement: Main operative sections
   - General Provisions: Boilerplate (notices, amendments, severability)
   - Signatures: Signature blocks for all parties

2. Formatting Standards
   - Section numbering: 1, 1.1, 1.1.1 (hierarchical)
   - Defined terms: UPPERCASE on first use only
   - Cross-references: Use section numbers
   - Dates: Consistent format throughout
   - Currency: With proper symbols and codes
   - Spacing: Proper line breaks and indentation

3. Variable Substitution
   - Replace {{variableName}} with actual values
   - Use [NEEDS INPUT: variableName] for missing values
   - Format values according to type (dates, amounts, names)
   - Preserve legal language exactly

4. Consistency Checks
   - Defined terms used consistently
   - Section references are correct
   - Cross-references are valid
   - Date formats are uniform
   - Party names match throughout

5. Placeholders
   - Missing required: [NEEDS INPUT: description]
   - Missing optional: [OPTIONAL: description]
   - Attorney review: [ATTORNEY REVIEW REQUIRED]
   - Jurisdiction-specific: [VERIFY FOR jurisdiction]

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- Preserve clause language EXACTLY as provided
- Only format structure, never rewrite content
- Flag all unresolved placeholders
- Note any formatting warnings`,

    userTemplate: (params) => `Assemble a document preview from the provided components:

TEMPLATE:
${JSON.stringify(params.templateTextOrStructure, null, 2)}

SELECTED CLAUSES:
${JSON.stringify(params.clausesTextOrStructure, null, 2)}

VARIABLES:
${JSON.stringify(params.variables, null, 2)}

PARTIES:
${JSON.stringify(params.parties, null, 2)}

Assemble well-formatted preview as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['documentTitle', 'sections', 'unresolvedPlaceholders'],
      properties: {
        documentTitle: { type: 'string' },
        parties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' }
            }
          }
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['heading', 'content'],
            properties: {
              number: { type: 'string' },
              heading: { type: 'string' },
              content: { type: 'string' },
              sourceClauseIds: {
                type: 'array',
                items: { type: 'string' }
              },
              placeholders: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        },
        unresolvedPlaceholders: {
          type: 'array',
          items: { type: 'string' }
        },
        warnings: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },

    safetyRules: [
      'PRESERVE clause language EXACTLY as provided - no rewriting',
      'Only format structure and numbering',
      'Use [NEEDS INPUT: description] for missing required variables',
      'Maintain consistent defined term usage',
      'Flag contradicting or duplicate clauses in warnings',
      'Ensure all section references are valid'
    ]
  },

  // ========================================
  // 8. CLAUSE REWRITING (OPTIONAL)
  // ========================================
  'drafting.rewrite_clause.v1': {
    metadata: {
      id: 'drafting-rewrite-clause-v1',
      name: 'drafting.rewrite_clause.v1',
      version: '1.0.0',
      category: 'clause_rewriting',
      description: 'Controlled clause rewriting for tone/style adjustments only',
      approvedForProduction: true,
      legalReviewDate: '2026-01-12',
      reviewedBy: 'Legal Engineering Team',
      temperature: 0.5,
      maxTokens: 1500
    },
    system: `You are LexiCore's Clause Rewriting AI. Your role is to make CONTROLLED tone and style adjustments to legal clauses WITHOUT changing substantive meaning.

${GLOBAL_SAFETY_RULES.join('\n')}

ALLOWED MODIFICATIONS:
1. Tone Adjustments
   - Formal ↔ Less formal (while maintaining legal validity)
   - Aggressive ↔ Balanced ↔ Conciliatory
   - Technical ↔ Plain language (preserve legal terms)

2. Style Adjustments
   - Verbose ↔ Concise
   - Active ↔ Passive voice
   - Simple ↔ Complex sentences

3. Clarity Improvements
   - Replace ambiguous terms with precise language
   - Break long sentences into shorter ones
   - Improve parallel structure
   - Enhance readability

PROHIBITED MODIFICATIONS:
❌ Changing substantive rights/obligations
❌ Adding/removing material provisions
❌ Changing defined terms
❌ Altering legal standards
❌ Modifying dates, amounts, parties
❌ Changing jurisdiction or governing law

REWRITE INSTRUCTIONS:
- "Make more formal" → Add legal formality without changing meaning
- "Make less formal" → Use plainer language while preserving enforceability
- "Shorten" → Remove unnecessary verbiage, keep substance
- "Strengthen indemnity" → Use stronger protective language
- "Make more balanced" → Adjust to neutral party positions

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the schema
- Provide rewritten clause text
- List all changes made
- Flag any substantive concerns
- Recommend attorney review if changes are significant`,

    userTemplate: (params) => `Rewrite the following clause according to the instruction:

ORIGINAL CLAUSE:
${params.clauseText}

INSTRUCTION:
${params.instruction}

CONSTRAINTS:
${JSON.stringify(params.constraints, null, 2)}

Provide rewritten clause with change notes as JSON.`,

    outputSchema: {
      type: 'object',
      required: ['rewritten', 'notes'],
      properties: {
        rewritten: { 
          type: 'string',
          description: 'Rewritten clause text'
        },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of changes made'
        },
        substantiveChanges: {
          type: 'boolean',
          description: 'Whether any substantive (not just stylistic) changes were made'
        },
        attorneyReviewRecommended: { type: 'boolean' },
        warnings: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },

    safetyRules: [
      'NEVER change substantive rights or obligations',
      'NEVER modify defined terms, dates, amounts, parties',
      'Flag substantiveChanges=true if meaning shifts',
      'Recommend attorney review for significant changes',
      'Preserve legal effectiveness and enforceability',
      'If instruction would cause substantive change, refuse and explain in warnings'
    ]
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get prompt by name and version
 */
export function getPrompt(name: DraftingPromptName, version?: string): PromptEntry {
  const prompt = DRAFTING_REGISTRY[name]
  
  if (!prompt) {
    throw new Error(`Prompt "${name}" not found in registry`)
  }
  
  if (version && prompt.metadata.version !== version) {
    throw new Error(
      `Prompt "${name}" version mismatch. Requested: ${version}, Available: ${prompt.metadata.version}`
    )
  }
  
  if (!prompt.metadata.approvedForProduction) {
    throw new Error(`Prompt "${name}" is not approved for production use`)
  }
  
  return prompt
}

/**
 * Render prompt with variable substitution
 */
export function renderPrompt(
  name: DraftingPromptName,
  params: Record<string, any>
): { system: string; user: string; metadata: PromptMetadata } {
  const prompt = getPrompt(name)
  
  const userPrompt = prompt.userTemplate(params)
  
  return {
    system: prompt.system,
    user: userPrompt,
    metadata: prompt.metadata
  }
}

/**
 * Validate output against schema
 */
export function validateOutput(
  name: DraftingPromptName,
  data: any
): { valid: boolean; errors: string[] } {
  const prompt = getPrompt(name)
  const schema = prompt.outputSchema
  const errors: string[] = []
  
  // Basic validation (can be enhanced with full JSON Schema validator)
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`)
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get all prompts by category
 */
export function getPromptsByCategory(category: string): PromptEntry[] {
  return Object.values(DRAFTING_REGISTRY).filter(
    p => p.metadata.category === category && p.metadata.approvedForProduction
  )
}

/**
 * List all available prompt names
 */
export function listPrompts(): DraftingPromptName[] {
  return Object.keys(DRAFTING_REGISTRY) as DraftingPromptName[]
}

/**
 * Get prompt metadata only (without templates)
 */
export function getPromptMetadata(name: DraftingPromptName): PromptMetadata {
  const prompt = getPrompt(name)
  return prompt.metadata
}

/**
 * Export prompt to database format (for central registry sync)
 */
export function exportPromptToDBFormat(name: DraftingPromptName) {
  const prompt = getPrompt(name)
  
  return {
    prompt_id: prompt.metadata.id,
    practice_areas: JSON.stringify(['drafting', 'document_automation']),
    module: 'drafting',
    task_type: prompt.metadata.category,
    title: prompt.metadata.description,
    description: prompt.metadata.description,
    reviewer_role: prompt.metadata.reviewedBy,
    confidence_threshold: 0.85,
    prompt_text: prompt.system,
    system_instructions: prompt.system,
    output_schema: JSON.stringify(prompt.outputSchema),
    extract_fields: null,
    prohibited_actions: JSON.stringify(prompt.safetyRules),
    validation_rules: JSON.stringify([
      'Output must be valid JSON',
      'All required fields must be present',
      'Never invent data not present in context'
    ]),
    version: prompt.metadata.version,
    status: prompt.metadata.approvedForProduction ? 'active' : 'draft'
  }
}
