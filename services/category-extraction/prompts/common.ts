/**
 * LexiCore™ - Common Extraction Prompts
 * 
 * Shared prompt components used across all category extractors
 */

/**
 * Common case information extraction prompt
 * Applied to ALL document categories for consistency
 */
export const COMMON_CASE_INFO_EXTRACTION = `
STEP 1: Extract basic case information from the document header/caption:

{
  "caseNumber": {
    "value": "Full case number exactly as shown (e.g., '19-CV-03343-JS-JMW', 'Case 2:19-cv-03343', 'Civil Action No. 19-3343')",
    "verbatim": "Exact quote showing the case number",
    "page": 1,
    "confidence": 0-100
  },
  "parties": {
    "plaintiffs": ["Full plaintiff name 1", "Full plaintiff name 2", ...],
    "defendants": ["Full defendant name 1", "Full defendant name 2", ...],
    "verbatim": "Exact quote showing party names (e.g., 'Plaintiff John Doe v. Defendant ABC Corp')",
    "page": 1,
    "confidence": 0-100
  },
  "jurisdiction": {
    "court": "Full court name (e.g., 'United States District Court, Eastern District of New York')",
    "venue": "Venue or location (e.g., 'Eastern District of New York, Long Island Office')",
    "verbatim": "Exact quote showing court name",
    "page": 1,
    "confidence": 0-100
  }
}

CRITICAL INSTRUCTIONS FOR CASE INFO:
1. Look in the FIRST PAGE header/caption for case information
2. Case numbers appear near top: "No.", "Case", "Civil Action", "Docket"
3. Parties shown in caption: "Plaintiff... v. Defendant..." or "... Plaintiff, v. ..., Defendant"
4. Court name is usually in ALL CAPS at top of document
5. If information is not found, use:
   - caseNumber.value: "Not found in document"
   - plaintiffs/defendants: [] (empty array)
   - court: "Not found in document"
6. ALWAYS include confidence score (0-100) based on clarity and completeness

`;

/**
 * Instructions for extracting dates
 */
export const DATE_EXTRACTION_INSTRUCTIONS = `
DATE EXTRACTION GUIDELINES:
- Extract dates in the format they appear (e.g., "March 15, 2023", "3/15/2023", "15 Mar 2023")
- Include full context (e.g., "Filed on March 15, 2023")
- For deadlines, include what is due and when
- Mark dates as "Not specified" if not found
- Include the page number where each date appears
`;

/**
 * Instructions for confidence scoring
 */
export const CONFIDENCE_SCORING_GUIDE = `
CONFIDENCE SCORING GUIDE (0-100):
- 95-100: Information explicitly stated with no ambiguity
- 85-94: Information clearly stated but requires minor interpretation
- 75-84: Information found but requires moderate interpretation
- 65-74: Information inferred from context
- 50-64: Information partially found or requires significant interpretation
- 0-49: Information not found or highly uncertain

FACTORS AFFECTING CONFIDENCE:
- Clarity: Is the information explicitly stated?
- Completeness: Is all required information present?
- Ambiguity: Are there multiple possible interpretations?
- Location: Is the information in the expected location?
- Consistency: Is the information consistent throughout the document?
`;

/**
 * Instructions for verbatim quotes
 */
export const VERBATIM_QUOTE_INSTRUCTIONS = `
VERBATIM QUOTE REQUIREMENTS:
- Copy EXACT text from the document (including punctuation, capitalization)
- Include enough context to make the quote meaningful (minimum 10 words)
- Use [...] to indicate omitted text within the quote
- Maximum quote length: 200 characters
- Include the page number where the quote appears
- For multiple locations, use the FIRST occurrence

EXAMPLE GOOD VERBATIM:
"The Court hereby GRANTS Defendant's Motion to Compel Arbitration pursuant to the Terms of Use agreement..."

EXAMPLE BAD VERBATIM:
"granted" (too short, no context)
"The motion is granted and the case is stayed pending arbitration and the parties shall..." (too long, should truncate)
`;

/**
 * JSON output format instructions
 */
export const JSON_OUTPUT_INSTRUCTIONS = `
CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON (no explanations, no markdown, no code blocks)
2. Use double quotes for all strings
3. Include ALL required fields (use empty arrays [] or "Not found" for missing data)
4. Ensure all confidence scores are integers between 0 and 100
5. Ensure all page numbers are positive integers
6. Use null for optional fields that are not found
7. Escape special characters in verbatim quotes (\\n, \\", \\t)

DO NOT INCLUDE:
- Markdown formatting (\`\`\`json)
- Explanatory text before or after JSON
- Comments within the JSON
- Additional fields not specified in the schema
`;

/**
 * Document analysis instructions
 */
export const DOCUMENT_ANALYSIS_INSTRUCTIONS = `
DOCUMENT ANALYSIS APPROACH:
1. READ the document header/caption first (first page)
2. IDENTIFY the document type and structure
3. SCAN for section headings and key information
4. EXTRACT information systematically from top to bottom
5. CROSS-REFERENCE information across sections
6. VERIFY consistency of extracted data
7. ASSIGN confidence scores based on clarity

DO NOT:
- Make up information that is not in the document
- Infer facts beyond what is explicitly stated
- Fill in placeholders (like "[DATE]" or "[PARTY NAME]")
- Assume information from similar documents
`;

/**
 * Helper function to build a complete prompt
 */
export function buildCompletePrompt(
  categorySpecificPrompt: string,
  documentText: string,
  documentType: string
): string {
  return `
You are an expert legal document analyst extracting information from a ${documentType}.

${COMMON_CASE_INFO_EXTRACTION}

STEP 2: Extract category-specific information:

${categorySpecificPrompt}

${DATE_EXTRACTION_INSTRUCTIONS}

${CONFIDENCE_SCORING_GUIDE}

${VERBATIM_QUOTE_INSTRUCTIONS}

${DOCUMENT_ANALYSIS_INSTRUCTIONS}

${JSON_OUTPUT_INSTRUCTIONS}

DOCUMENT TO ANALYZE:
---
${documentText.substring(0, 50000)}
---

Extract all information and return ONLY valid JSON.
`.trim();
}

/**
 * Helper function to create extraction schema template
 */
export function createSchemaExample(categoryFields: string): string {
  return `
{
  "caseNumber": {
    "value": "19-CV-03343-JS-JMW",
    "verbatim": "Case 2:19-cv-03343-JS-JMW",
    "page": 1,
    "confidence": 95
  },
  "parties": {
    "plaintiffs": ["Manuel Alvarez, Sr., individually and on behalf of all others similarly situated"],
    "defendants": ["Experian Information Solutions, Inc."],
    "verbatim": "MANUEL ALVAREZ, SR., individually and on behalf of all others similarly situated, Plaintiff, -against- EXPERIAN INFORMATION SOLUTIONS, INC., Defendant.",
    "page": 1,
    "confidence": 95
  },
  "jurisdiction": {
    "court": "United States District Court, Eastern District of New York",
    "venue": "Eastern District of New York, Long Island Office",
    "verbatim": "UNITED STATES DISTRICT COURT EASTERN DISTRICT OF NEW YORK",
    "page": 1,
    "confidence": 95
  },
  ${categoryFields}
}
`;
}
