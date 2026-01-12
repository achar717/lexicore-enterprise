// LexiCore™ Contract Parser Service
// © 2024 LexiCore. Advisory Tool Only - Extracts Facts, Not Legal Advice.

/**
 * CRITICAL LEGAL PRINCIPLES (NON-NEGOTIABLE):
 * 1. Extract ONLY factual, explicitly stated information
 * 2. NEVER interpret ambiguous language - flag for attorney review
 * 3. NEVER provide legal conclusions or advice
 * 4. ALWAYS include verbatim clause text and source reference
 * 5. Confidence scores indicate extraction certainty, NOT legal validity
 */

export interface ContractExtraction {
  field_category: string
  field_name: string
  field_value: string
  verbatim_clause: string
  section_reference: string
  page_number?: number
  clause_number?: string
  confidence_score: number
  is_ambiguous: boolean
  ambiguity_reason?: string
}

export interface ContractParseResult {
  extractions: ContractExtraction[]
  total_pages: number
  contract_summary: string
}

export class ContractParser {
  
  /**
   * Build extraction prompt for Gemini AI
   * 
   * CRITICAL: This prompt enforces legal compliance principles
   */
  static buildExtractionPrompt(contractText: string, contractType: string): string {
    // Increase limit to 40000 characters for better extraction
    // This is approximately 10,000 tokens, well within Gemini's 32K limit
    const limitedText = contractText.substring(0, 40000)
    
    return `You are a legal document analysis assistant for LexiCore™ Transactional.

⚠️ CRITICAL INSTRUCTIONS (NON-NEGOTIABLE):
1. Extract ONLY factual, explicitly stated information - NO interpretation
2. If a value is NOT found in the text, DO NOT create a placeholder extraction
3. ONLY extract facts that have actual values explicitly stated
4. If language is ambiguous, flag it with is_ambiguous: true and explain why
5. NEVER provide legal conclusions, advice, or risk assessments
6. ALWAYS include the exact verbatim clause text (minimum 20 characters)
7. ALWAYS include section/article reference (e.g., "Section 5.2", "Article III(b)")
8. Confidence scores indicate extraction certainty, NOT legal validity
9. Extract AT LEAST 15-20 key facts that have actual stated values

CONTRACT TYPE: ${contractType}

CONTRACT TEXT (First 40,000 characters - SEARCH THOROUGHLY):
${limitedText}

EXTRACT THE FOLLOWING FACTUAL INFORMATION:

For each extracted fact, provide a JSON object with these REQUIRED fields:
- field_category: One of [party_information, defined_terms, term_and_termination, governing_law, payment_terms, conditions_precedent, notice_provisions, assignment_change_of_control, representations_warranties, indemnification, confidentiality, intellectual_property, dispute_resolution, force_majeure, miscellaneous]
- field_name: Descriptive name (e.g., "Governing Law Jurisdiction", "Payment Due Date", "Notice Address - Buyer")
- field_value: The extracted factual value (be concise but complete)
- verbatim_clause: EXACT text from contract (must be at least 20 characters)
- section_reference: Section/Article/Clause reference from contract
- page_number: Page number if available (integer or null)
- clause_number: Clause/subsection number if available (e.g., "5.2(a)")
- confidence_score: 0.0 to 1.0 (1.0 = completely certain, explicit statement)
- is_ambiguous: true if language is unclear, contradictory, or requires interpretation
- ambiguity_reason: If ambiguous, explain why (e.g., "Multiple conflicting clauses found")

EXTRACTION CATEGORIES TO FOCUS ON:

1. PARTY INFORMATION:
   - Party legal names (exact as stated)
   - Party roles (e.g., "Buyer", "Seller", "Licensor")
   - Party addresses
   - Signatory names and titles

2. DEFINED TERMS:
   - Key defined terms with their definitions
   - Only if explicitly defined in a definitions section

3. TERM AND TERMINATION (PRIORITY - ALWAYS EXTRACT DATES):
   - Contract effective date (exact date or phrase like "Dated as of the date set forth on Schedule A")
   - Contract expiration/end date (if stated)
   - Term length (e.g., "5 years", "until December 31, 2025")
   - Auto-renewal provisions (yes/no and conditions)
   - Termination rights (factual trigger events only, NO interpretation)
   - Notice period for termination (e.g., "30 days written notice")

4. GOVERNING LAW:
   - Governing law jurisdiction (e.g., "State of Delaware")
   - Venue for disputes
   - Choice of law provisions

5. PAYMENT TERMS (PRIORITY - ALWAYS EXTRACT AMOUNTS AND DATES):
   ⚠️ CRITICAL: DO NOT extract if value is "Not specified" or missing
   - Loan amounts: Look for specific dollar amounts in Article 2 or Article 3
   - Interest rates: Look for percentage rates (e.g., "5.25%", "LIBOR + 2%")
   - Payment schedules: Look for specific dates or frequencies
   - Late fees: Look for specific penalty amounts or percentages
   - ONLY extract if you find the ACTUAL VALUE in the text
   - If not found, SKIP this field entirely (do not create placeholder)

6. CONDITIONS PRECEDENT:
   - Conditions that must be satisfied (factual statements only)

7. NOTICE PROVISIONS:
   - How notices must be sent (methods)
   - Notice addresses for each party
   - Deemed delivery timeframes

8. ASSIGNMENT AND CHANGE OF CONTROL:
   - Assignment restrictions (factual prohibitions only)
   - Change of control provisions
   - Required consents

9. REPRESENTATIONS AND WARRANTIES:
   - Explicit representations made by each party (factual statements)

10. INDEMNIFICATION:
    - Indemnifying party
    - Indemnified party
    - Scope of indemnity (factual coverage areas)

11. CONFIDENTIALITY:
    - Confidentiality obligations (factual duties)
    - Exceptions to confidentiality
    - Confidentiality term/duration

12. INTELLECTUAL PROPERTY:
    - IP ownership statements
    - License grants (scope and limitations)

13. DISPUTE RESOLUTION:
    - Arbitration clauses (yes/no, location, rules)
    - Mediation requirements
    - Court jurisdiction

14. FORCE MAJEURE:
    - Force majeure definition (events listed)
    - Effect of force majeure (factual consequences)

15. MISCELLANEOUS:
    - Entire agreement clause
    - Amendment provisions
    - Severability
    - Counterparts

⚠️ CRITICAL - DO NOT EXTRACT IF VALUE NOT FOUND:
If you see an article header but NO actual value (e.g., "Interest Rate" header but no percentage stated):
- DO NOT create an extraction with "Not specified in the provided text"
- DO NOT set confidence to 50%
- SKIP this field entirely
- ONLY extract fields where you found the ACTUAL VALUE

AMBIGUITY DETECTION:
Flag as ambiguous if:
- Multiple contradictory clauses exist
- Language is vague or open to interpretation
- Cross-references are broken or unclear
- Defined terms are used but not defined
- Dates or amounts are inconsistent

RESPONSE FORMAT:
Return a JSON object with this EXACT structure. Extract AT LEAST 15-20 facts:

{
  "extractions": [
    {
      "field_category": "party_information",
      "field_name": "Lender Name",
      "field_value": "ABC Bank Corp",
      "verbatim_clause": "This Loan Agreement is entered into between ABC Bank Corp (the 'Lender') and XYZ Company Inc (the 'Borrower').",
      "section_reference": "Preamble",
      "page_number": 1,
      "clause_number": null,
      "confidence_score": 1.0,
      "is_ambiguous": false
    },
    {
      "field_category": "payment_terms",
      "field_name": "Principal Amount",
      "field_value": "$500,000",
      "verbatim_clause": "The Lender agrees to loan the Borrower the principal sum of Five Hundred Thousand Dollars ($500,000).",
      "section_reference": "Section 2.1",
      "page_number": 2,
      "clause_number": "2.1",
      "confidence_score": 1.0,
      "is_ambiguous": false
    },
    {
      "field_category": "term_and_termination",
      "field_name": "Effective Date",
      "field_value": "Date set forth on Schedule A",
      "verbatim_clause": "Dated as of the date set forth on Schedule A",
      "section_reference": "Preamble",
      "page_number": 1,
      "clause_number": null,
      "confidence_score": 1.0,
      "is_ambiguous": false
    },
    {
      "field_category": "payment_terms",
      "field_name": "Maximum Debt Amount",
      "field_value": "Not to exceed the Maximum UST Debt Amount",
      "verbatim_clause": "in an aggregate principal amount not to exceed the Maximum UST Debt Amount at any one time outstanding.",
      "section_reference": "Recitals",
      "page_number": 1,
      "clause_number": null,
      "confidence_score": 1.0,
      "is_ambiguous": false
    }
  ],
  "contract_summary": "Brief 2-3 sentence summary of the contract's purpose and key parties"
}

CRITICAL REQUIREMENTS: 
- Extract AT LEAST 15-20 facts from the contract
- ALWAYS extract: all party names, all dates (effective, expiration, etc.), all payment amounts/terms, governing law
- Be thorough - look for facts in: preamble, recitals, definitions, body sections, schedules
- If a date or amount is referenced but defined elsewhere (e.g., "Schedule A"), extract the reference phrase
- ONLY return valid JSON. Do NOT include any other text, explanations, or markdown formatting.
- Start your response with { and end with }
- Do NOT wrap in markdown code blocks

FOCUS AREAS (EXTRACT FROM THESE SECTIONS):
1. Preamble/Header: parties, effective date, recitals
2. Definitions (Section 1): key defined terms
3. Payment/Loan Terms (Sections 2-3): amounts, rates, schedules
4. Conditions (Section 4): conditions precedent, conditions to loans
5. Representations & Warranties (Section 5): key reps
6. Covenants (Section 6): affirmative/negative covenants
7. Events of Default (Section 7): default triggers
8. Remedies (Section 8): remedies upon default
9. Governing Law & Dispute Resolution (Sections 9-10): jurisdiction, arbitration
10. Miscellaneous (Final sections): notices, amendments, counterparts`
  }

  /**
   * Parse Gemini response into structured extractions
   */
  static parseGeminiResponse(response: string): ContractParseResult {
    try {
      // Remove markdown code blocks if present
      let jsonText = response.trim()
      
      console.log('📋 Raw response length:', response.length)
      console.log('📋 First 200 chars:', response.substring(0, 200))
      
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '')
        console.log('🔧 Removed markdown code blocks')
      }
      
      const parsed = JSON.parse(jsonText)
      console.log('✅ JSON parsed successfully')
      
      // Validate response structure
      if (!parsed.extractions || !Array.isArray(parsed.extractions)) {
        console.error('❌ Missing extractions array:', parsed)
        throw new Error('Invalid response: missing extractions array')
      }
      
      console.log('📊 Total extractions in response:', parsed.extractions.length)
      
      // Validate each extraction
      const validExtractions = parsed.extractions.filter((ext: any) => {
        const isValid = ext.field_category && 
               ext.field_name && 
               ext.field_value && 
               ext.verbatim_clause &&
               ext.section_reference &&
               typeof ext.confidence_score === 'number' &&
               typeof ext.is_ambiguous === 'boolean'
        
        if (!isValid) {
          console.warn('⚠️ Invalid extraction:', ext)
        }
        
        return isValid
      })
      
      console.log('✅ Valid extractions after filtering:', validExtractions.length)
      
      return {
        extractions: validExtractions,
        total_pages: parsed.total_pages || 0,
        contract_summary: parsed.contract_summary || 'Contract parsed successfully'
      }
      
    } catch (error) {
      console.error('❌ Failed to parse Gemini response:', error)
      console.error('❌ Response text:', response.substring(0, 1000))
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Validate extraction meets quality standards
   */
  static validateExtraction(extraction: ContractExtraction): { valid: boolean; reason?: string } {
    // Verbatim clause must be at least 20 characters
    if (!extraction.verbatim_clause || extraction.verbatim_clause.length < 20) {
      return { valid: false, reason: 'Verbatim clause too short (minimum 20 characters)' }
    }
    
    // Must have section reference
    if (!extraction.section_reference || extraction.section_reference.trim().length === 0) {
      return { valid: false, reason: 'Missing section reference' }
    }
    
    // Confidence score must be between 0 and 1
    if (extraction.confidence_score < 0 || extraction.confidence_score > 1) {
      return { valid: false, reason: 'Invalid confidence score (must be 0-1)' }
    }
    
    // If ambiguous, must have reason
    if (extraction.is_ambiguous && !extraction.ambiguity_reason) {
      return { valid: false, reason: 'Ambiguous extraction missing reason' }
    }
    
    // Field value must not be empty
    if (!extraction.field_value || extraction.field_value.trim().length === 0) {
      return { valid: false, reason: 'Empty field value' }
    }
    
    return { valid: true }
  }

  /**
   * Check if extraction looks like legal advice (red flag)
   */
  static containsLegalAdvice(extraction: ContractExtraction): boolean {
    const prohibitedPhrases = [
      'should',
      'recommend',
      'suggest',
      'advise',
      'opinion',
      'likely to succeed',
      'strong case',
      'weak position',
      'risk level',
      'exposure',
      'liability assessment',
      'legal conclusion',
      'interpretation',
      'means that',
      'implies that',
      'indicates that'
    ]
    
    const textToCheck = `${extraction.field_value} ${extraction.verbatim_clause}`.toLowerCase()
    
    return prohibitedPhrases.some(phrase => textToCheck.includes(phrase))
  }
}
