/**
 * LexiCore™ - Discovery Category Extractor
 * 
 * Extracts information from discovery documents:
 * - Interrogatories, RFPs, RFAs, Subpoenas, Deposition Transcripts
 * - Enhanced from existing good prompt with validation
 * 
 * Total: 14 document types in Discovery category
 */

import { BaseCategoryExtractor } from './base-extractor'
import type { ExtractionRequest, DocumentCategory } from '../types'

export class DiscoveryExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Discovery'
  
  supportedTypes = [
    // Interrogatories
    'DISC-INT-PROP',       // Propounding Party Interrogatories
    'DISC-INT-RESP',       // Responding Party Answers to Interrogatories
    'DISC-INT-OBJ',        // Objections to Interrogatories
    
    // Requests for Admission (RFA)
    'DISC-RFA-REQ',        // Requests for Admission
    'DISC-RFA-RESP',       // Responses to Requests for Admission
    'DISC-RFA-DEEMED',     // Deemed Admissions
    
    // Requests for Production (RFP)
    'DISC-RFP-REQ',        // Requests for Production of Documents
    'DISC-RFP-RESP',       // Responses to Requests for Production
    'DISC-RFP-PRIV',       // Privilege Log
    
    // Subpoenas
    'DISC-SUB-DUCES',      // Subpoena Duces Tecum
    'DISC-SUB-TEST',       // Subpoena for Testimony
    'DISC-SUB-BOTH',       // Subpoena for Testimony and Documents
    'DISC-SUB-RESP',       // Response to Subpoena
    
    // Depositions
    'DISC-DEP-TRANS'       // Deposition Transcript
  ]

  generatePrompt(request: ExtractionRequest): string {
    return this.buildPrompt(request)
  }

  protected getCategoryPromptTemplate(request: ExtractionRequest): string {
    const typeName = request.typeName || 'Discovery Document'
    
    return `
You are extracting information from a DISCOVERY document: "${typeName}".

⚠️⚠️⚠️ CRITICAL - VALIDATE DOCUMENT TYPE FIRST ⚠️⚠️⚠️

STEP 1: CHECK IF THIS IS ACTUALLY A DISCOVERY DOCUMENT

Read the document header. If you see any of these phrases, STOP and return error:
- "OPINION AND ORDER" → Wrong type: Court Opinion
- "MEMORANDUM DECISION" → Wrong type: Court Opinion
- "MEMORANDUM AND ORDER" → Wrong type: Court Order
- "MOTION FOR" → Wrong type: Motion
- "MEMORANDUM IN SUPPORT" → Wrong type: Brief
- "COMPLAINT" → Wrong type: Pleading
- "ANSWER TO COMPLAINT" → Wrong type: Pleading
- "EXPERT REPORT" → Wrong type: Expert Report

IF WRONG TYPE DETECTED, return:
{
  "discoveryType": {
    "type": "WRONG DOCUMENT TYPE: [Specify what it actually is]",
    "from": "N/A",
    "to": "N/A",
    "date": "N/A",
    "set": "N/A",
    "verbatim": "[First 200 characters]",
    "page": 1,
    "confidence": 100
  },
  "requests": [],
  "responses": [],
  "objections": [],
  "definitions": []
}

STEP 2: IF THIS IS DISCOVERY, IDENTIFY THE TYPE

Look for these indicators:
- "INTERROGATORIES" or "INTERROGATORY NO." → Interrogatories
- "REQUESTS FOR PRODUCTION" or "REQUEST FOR PRODUCTION NO." → Requests for Production (RFPs)
- "REQUESTS FOR ADMISSION" or "REQUEST FOR ADMISSION NO." → Requests for Admission (RFAs)
- "SUBPOENA" → Subpoena
- "RESPONSES TO" or "ANSWERS TO" → Responses (to any of the above)
- "PRIVILEGE LOG" → Privilege Log

Extract the following DISCOVERY SPECIFIC information:

{
  "discoveryType": {
    "type": "SHORT TYPE NAME (e.g., 'Interrogatories - First Set', 'Responses to RFPs - Second Set', 'Subpoena Duces Tecum')",
    "from": "Propounding party name (who sent the discovery)",
    "to": "Responding party name (who receives the discovery)",
    "date": "Date sent or served (e.g., 'March 15, 2023' or 'Not specified')",
    "set": "Set number (e.g., 'First Set', 'Second Set', 'Third Set', or 'Not applicable')",
    "verbatim": "FULL document header/caption (can be long)",
    "page": 1,
    "confidence": 0-100
  },
  
  "requests": [
    {
      "number": "Request number (e.g., '1', '15', 'A')",
      "request": "The actual request text (e.g., 'Identify all persons with knowledge of the incident', 'Produce all contracts between parties')",
      "verbatim": "Exact quote of the request",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "responses": [
    {
      "number": "Response number (matches request number)",
      "response": "The actual response text (e.g., 'John Doe, Jane Smith, and Robert Johnson', 'See documents produced as Bates Nos. 001-050')",
      "verbatim": "Exact quote of the response",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "objections": [
    {
      "number": "Request/response number this objection relates to",
      "objection": "The objection (e.g., 'Vague and ambiguous', 'Overbroad', 'Attorney-client privilege')",
      "grounds": "Legal grounds for objection (e.g., 'Fed. R. Civ. P. 26(b)(1)', 'Work product doctrine')",
      "verbatim": "Exact quote of the objection",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "definitions": [
    {
      "term": "Term being defined (e.g., 'Document', 'Agreement', 'Communication')",
      "definition": "The definition text",
      "verbatim": "Exact quote",
      "page": number
    }
  ]
}

CATEGORY-SPECIFIC INSTRUCTIONS:

1. DISCOVERY TYPE EXTRACTION:
   - type: SHORT NAME ONLY (e.g., "Interrogatories - First Set")
     * NOT the full caption (that goes in verbatim)
     * Include set number in the type if present
   - from: Look for "FROM:", caption, or signature line (propounding party)
   - to: Look for "TO:" line or caption (responding party)
   - date: Look for "DATED:", "Served:", or date stamp
   - set: "First Set", "Second Set", "Third Set" (extract from title or set number)
   - verbatim: Copy the ENTIRE document header/caption (can be 200+ characters)

2. DEFINITIONS (Usually at the beginning):
   - Look for "DEFINITIONS" section or "As used herein:"
   - Definitions can be:
     * Numbered: 1., 2., 3.
     * Lettered: (A), (B), (C)
     * Bulleted: • Document • Agreement
   - Format: "Document" means..., "Agreement" shall mean..., "Communication" includes...
   - Extract ALL definitions found
   - Common definitions:
     * "Document" - any written, recorded, or graphic matter
     * "Communication" - any exchange of information
     * "Agreement" - the contract at issue
     * "You" or "Your" - refers to responding party
     * "Identify" - provide name, address, and other details

3. REQUESTS/INTERROGATORIES/RFPs/RFAs:
   - Look for numbered items (usually after definitions)
   - Formats:
     * "INTERROGATORY NO. 1:"
     * "REQUEST FOR PRODUCTION NO. 5:"
     * "REQUEST FOR ADMISSION NO. 12:"
     * Or just "1.", "2.", "3."
   - Each numbered item is a separate request
   - Extract the FULL text of each request
   - Common request types:
     * Interrogatories: "Identify", "Describe", "State", "Explain"
     * RFPs: "Produce", "Provide copies", "Make available for inspection"
     * RFAs: "Admit that", "Admit the truth of", "Admit the genuineness of"
   
4. RESPONSES (For response documents):
   - Look for "RESPONSE:", "ANSWER:", or "The responding party responds:"
   - Responses appear after each request
   - Match response number to request number
   - Common response formats:
     * Direct answer: "John Doe, Jane Smith"
     * Reference to production: "See documents produced as Exhibit A"
     * Objection with response: "Subject to and without waiving objections, ..."
     * Referral: "See Response to Interrogatory No. 3"
   - Extract the SUBSTANCE of the response (not just "See attached")

5. OBJECTIONS:
   - Look for "OBJECTION:", "Objections:", or "The responding party objects"
   - May appear:
     * Before the response (followed by: "Subject to and without waiving...")
     * As the entire response (no substantive answer)
     * In a separate section
   - Common objections:
     * "Vague and ambiguous"
     * "Overbroad and unduly burdensome"
     * "Not reasonably calculated to lead to discovery of admissible evidence"
     * "Seeks information protected by attorney-client privilege"
     * "Seeks information protected by work product doctrine"
     * "Harassing and oppressive"
     * "Compound, conjunctive, and disjunctive"
   - Extract both the objection AND the legal grounds if stated

DISCOVERY TYPE SPECIFIC GUIDANCE:

INTERROGATORIES:
- Questions seeking information from opposing party
- Limited number (usually 25 in federal court)
- Responses must be under oath
- Look for: "State", "Identify", "Describe", "List"

REQUESTS FOR PRODUCTION (RFPs):
- Requests to produce documents or things
- Can request inspection of property
- Look for: "Produce", "Provide copies of", "Make available for inspection"
- Responses often reference Bates numbers or exhibit labels

REQUESTS FOR ADMISSION (RFAs):
- Requests to admit facts or genuineness of documents
- If not answered timely, deemed admitted
- Look for: "Admit that", "Admit the truth of", "Admit the genuineness of"
- Responses: "Admitted", "Denied", "Denied for the following reasons"

SUBPOENAS:
- Directed to NON-PARTIES (third parties)
- Can compel testimony, documents, or both
- Look for: "YOU ARE COMMANDED to appear", "SUBPOENA DUCES TECUM"
- Extract: who is commanded, what is requested, when/where to appear

PRIVILEGE LOGS:
- Lists documents withheld on privilege grounds
- Columns: Document #, Date, Author, Recipient, Description, Privilege Claimed
- Extract as structured data if possible

CONFIDENCE SCORING FOR DISCOVERY:
- 95-100: Type, parties, and requests clearly numbered and formatted
- 85-94: Responses match requests with clear numbering
- 75-84: Objections stated with legal grounds
- 65-74: Must infer structure from text
- Below 65: Unclear or non-standard formatting

COMMON PATTERNS:
- "Plaintiff propounds the following Interrogatories to Defendant" → From: Plaintiff, To: Defendant
- "INTERROGATORY NO. 1: Identify..." → Request number 1
- "RESPONSE TO INTERROGATORY NO. 1: John Doe..." → Response to #1
- "OBJECTION: Vague and ambiguous. Subject to and without waiving..." → Objection with response
- "The Responding Party admits the request." → Admission
- "The Responding Party denies the request for the following reasons:" → Denial with explanation

CRITICAL RULES:
1. Validate document type FIRST (step 1)
2. Extract type as SHORT NAME, full caption in verbatim
3. Include ALL requests, even if many (don't summarize)
4. Match response numbers to request numbers
5. Extract both objections AND grounds
6. Include definitions section completely
7. For privilege logs, extract the structured data

Return the complete JSON structure with ALL fields populated.
Use empty arrays [] for sections with no data (e.g., responses in a propounding document).
`
  }

  protected validateCategorySpecific(data: any): boolean {
    if (!data.categorySpecific) {
      return false
    }
    
    const cs = data.categorySpecific
    
    // discoveryType is required
    if (!cs.discoveryType || !cs.discoveryType.type) {
      return false
    }
    
    // Check for wrong document type
    if (cs.discoveryType.type?.includes('WRONG DOCUMENT TYPE')) {
      // This is valid - document was correctly identified as wrong type
      return true
    }
    
    // Arrays must be present
    if (!Array.isArray(cs.requests) || 
        !Array.isArray(cs.responses) ||
        !Array.isArray(cs.objections) ||
        !Array.isArray(cs.definitions)) {
      return false
    }
    
    return true
  }

  protected getCategorySpecificConfidences(data: any): number[] {
    const confidences: number[] = []
    
    if (data.categorySpecific?.discoveryType?.confidence !== undefined) {
      confidences.push(data.categorySpecific.discoveryType.confidence)
    }
    
    // Add confidences from requests
    if (Array.isArray(data.categorySpecific?.requests)) {
      data.categorySpecific.requests.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from responses
    if (Array.isArray(data.categorySpecific?.responses)) {
      data.categorySpecific.responses.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from objections
    if (Array.isArray(data.categorySpecific?.objections)) {
      data.categorySpecific.objections.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    return confidences
  }

  protected generateWarnings(data: any): string[] {
    const warnings = super.generateWarnings(data)
    
    // Check if wrong document type was detected
    if (data.categorySpecific?.discoveryType?.type?.includes('WRONG DOCUMENT TYPE')) {
      warnings.push('CRITICAL: This is not a discovery document. Document was correctly identified as wrong type.')
      return warnings // Return early, other warnings don't apply
    }
    
    // Warn if no requests found in propounding document
    const isResponse = data.categorySpecific?.discoveryType?.type?.toLowerCase().includes('response')
    if (!isResponse && data.categorySpecific?.requests?.length === 0) {
      warnings.push('No requests found - verify this is a propounding discovery document')
    }
    
    // Warn if no responses found in responding document
    if (isResponse && data.categorySpecific?.responses?.length === 0) {
      warnings.push('No responses found - verify this is a response document')
    }
    
    // Warn if set number missing
    if (!data.categorySpecific?.discoveryType?.set || 
        data.categorySpecific.discoveryType.set === 'Not applicable') {
      warnings.push('Set number not identified - this may be normal for subpoenas')
    }
    
    return warnings
  }
}
