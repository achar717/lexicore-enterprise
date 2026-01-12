/**
 * LexiCore™ - Motion Category Extractor
 * 
 * Extracts information from motion documents:
 * - Summary Judgment, Dismissal, Compel, Limine, etc.
 * 
 * Total: 20 document types in Motion category
 */

import { BaseCategoryExtractor } from './base-extractor'
import type { ExtractionRequest, DocumentCategory } from '../types'

export class MotionExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Motion'
  
  supportedTypes = [
    // Pre-Trial Motions
    'MOT-DISMISS-12B6',   // Motion to Dismiss (12(b)(6))
    'MOT-DISMISS-12B1',   // Motion to Dismiss (12(b)(1))
    'MOT-DISMISS-12B2',   // Motion to Dismiss (12(b)(2))
    'MOT-DISMISS-12B3',   // Motion to Dismiss (12(b)(3))
    'MOT-DISMISS-12C',    // Motion for Judgment on Pleadings
    'MOT-SJ',             // Motion for Summary Judgment
    'MOT-MSJ-PARTIAL',    // Motion for Partial Summary Judgment
    'MOT-LIMINE',         // Motion in Limine
    'MOT-SEVER',          // Motion to Sever
    'MOT-CONSOLIDATE',    // Motion to Consolidate
    
    // Discovery Motions
    'MOT-COMPEL',         // Motion to Compel Discovery
    'MOT-COMPEL-DEP',     // Motion to Compel Deposition
    'MOT-PROTECT',        // Motion for Protective Order
    'MOT-QUASH',          // Motion to Quash Subpoena
    'MOT-EXTEND-DISC',    // Motion to Extend Discovery Deadline
    'MOT-SANCTION-DISC',  // Motion for Discovery Sanctions
    
    // Case Management Motions
    'MOT-CONTINUE',       // Motion for Continuance
    'MOT-AMEND-PLEAD',    // Motion for Leave to Amend Pleading
    'MOT-WITHDRAW',       // Motion to Withdraw as Counsel
    'MOT-JOINDER',        // Motion for Joinder
    
    // Responses
    'MOT-OPPOSITION',     // Opposition to Motion
    'MOT-REPLY',          // Reply Brief
    'MOT-SURREPLY'        // Surreply Brief
  ]

  generatePrompt(request: ExtractionRequest): string {
    return this.buildPrompt(request)
  }

  protected getCategoryPromptTemplate(request: ExtractionRequest): string {
    const typeName = request.typeName || 'Motion'
    
    return `
You are extracting information from a MOTION document: "${typeName}".

This is a formal request to the court for a ruling or order.

Extract the following MOTION SPECIFIC information:

{
  "motionDetails": {
    "motionType": "${typeName}",
    "filingDate": "Date motion was filed (e.g., 'March 1, 2023' or 'Not found')",
    "filedBy": "Party filing the motion (e.g., 'Plaintiff John Doe', 'Defendant ABC Corp', 'Defendants')",
    "verbatim": "Exact quote of motion title from document",
    "page": 1,
    "confidence": 0-100
  },
  
  "relief": {
    "requested": "What the moving party is asking the court to do (e.g., 'Dismiss the complaint', 'Grant summary judgment', 'Compel production of documents')",
    "verbatim": "Exact quote of relief requested section",
    "page": number,
    "confidence": 0-100
  },
  
  "grounds": [
    {
      "ground": "Legal or factual basis for the motion (e.g., 'Failure to state a claim', 'No genuine dispute of material fact', 'Plaintiff failed to respond to discovery')",
      "legalAuthority": "Statute, rule, or case cited (e.g., 'Fed. R. Civ. P. 12(b)(6)', '42 U.S.C. § 1983', 'Smith v. Jones, 123 F.3d 456')",
      "verbatim": "Exact quote supporting this ground",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "arguments": [
    {
      "argument": "Key legal argument or point (e.g., 'The complaint fails to allege sufficient facts', 'Plaintiff cannot establish proximate cause', 'The requested documents are protected by attorney-client privilege')",
      "verbatim": "Exact quote of the argument",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "supportingEvidence": [
    {
      "evidence": "Exhibit or declaration referenced (e.g., 'Exhibit A - Contract', 'Declaration of John Smith', 'Expert Report of Dr. Jane Doe')",
      "description": "Brief description of the evidence",
      "page": number
    }
  ],
  
  "proposedOrder": {
    "included": true or false,
    "orderText": "Text of proposed order if included",
    "page": number or null
  }
}

CATEGORY-SPECIFIC INSTRUCTIONS:

1. MOTION DETAILS:
   - Motion type is in the title (e.g., "MOTION TO DISMISS", "MOTION FOR SUMMARY JUDGMENT")
   - Filing date may be on cover page or in caption
   - Filed by: Look for "Plaintiff/Defendant [Name] hereby moves..."
   - Extract the formal motion title verbatim

2. RELIEF REQUESTED:
   - Look for sections: "RELIEF REQUESTED", "PRAYER FOR RELIEF", "WHEREFORE"
   - This is what the moving party wants the court to do
   - Be specific: "dismiss with prejudice", "grant partial summary judgment on liability"
   - Extract the exact language used

3. GROUNDS FOR MOTION:
   - Look for "GROUNDS", "BASIS", "STANDARD", "LEGAL FRAMEWORK"
   - Extract the legal reason for the motion
   - Include cited rules, statutes, or cases
   - Common grounds:
     * 12(b)(6): Failure to state a claim
     * 12(b)(1): Lack of subject matter jurisdiction
     * Summary Judgment: No genuine dispute of material fact
     * Discovery: Failure to respond, relevance, privilege

4. ARGUMENTS:
   - Look for "ARGUMENT", "DISCUSSION", "MEMORANDUM OF LAW"
   - Extract key points (not entire paragraphs)
   - Focus on legal conclusions and main points
   - Limit to 3-5 most important arguments

5. SUPPORTING EVIDENCE:
   - Look for references to "Exhibit", "Appendix", "Declaration", "Affidavit"
   - Note exhibit letters/numbers (A, B, C or 1, 2, 3)
   - Brief description of each exhibit's content

6. PROPOSED ORDER:
   - Check if motion includes proposed order (often at the end)
   - Look for "PROPOSED ORDER" section
   - Extract key language if present

CONFIDENCE SCORING FOR MOTIONS:
- 95-100: Motion type, relief, and grounds explicitly stated
- 85-94: Arguments clearly articulated with citations
- 75-84: Grounds stated but legal authority unclear
- 65-74: Arguments require interpretation
- Below 65: Ambiguous or incomplete motion

COMMON PATTERNS:
- "Plaintiff moves for..." → Identifies moving party and relief
- "pursuant to Fed. R. Civ. P. 12(b)(6)" → Legal ground/authority
- "WHEREFORE, Plaintiff respectfully requests..." → Relief requested
- "For the reasons stated in the accompanying memorandum..." → Points to arguments
- "See Exhibit A" → Supporting evidence reference

SPECIAL HANDLING BY MOTION TYPE:
- Dismissal Motions: Focus on pleading deficiencies
- Summary Judgment: Look for undisputed facts and legal standard
- Discovery Motions: Extract what is being compelled/protected and why
- Limine Motions: Identify evidence to exclude/admit and basis

Return the complete JSON structure with ALL fields populated.
Use empty arrays [] for sections with no data.
`
  }

  protected validateCategorySpecific(data: any): boolean {
    if (!data.categorySpecific) {
      return false
    }
    
    const cs = data.categorySpecific
    
    // motionDetails and relief are required
    if (!cs.motionDetails || !cs.relief) {
      return false
    }
    
    if (!cs.motionDetails.motionType || cs.motionDetails.confidence === undefined) {
      return false
    }
    
    if (!cs.relief.requested || cs.relief.confidence === undefined) {
      return false
    }
    
    // Arrays must be present
    if (!Array.isArray(cs.grounds) || !Array.isArray(cs.arguments)) {
      return false
    }
    
    return true
  }

  protected getCategorySpecificConfidences(data: any): number[] {
    const confidences: number[] = []
    
    if (data.categorySpecific?.motionDetails?.confidence !== undefined) {
      confidences.push(data.categorySpecific.motionDetails.confidence)
    }
    
    if (data.categorySpecific?.relief?.confidence !== undefined) {
      confidences.push(data.categorySpecific.relief.confidence)
    }
    
    // Add confidences from grounds
    if (Array.isArray(data.categorySpecific?.grounds)) {
      data.categorySpecific.grounds.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from arguments
    if (Array.isArray(data.categorySpecific?.arguments)) {
      data.categorySpecific.arguments.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    return confidences
  }

  protected generateWarnings(data: any): string[] {
    const warnings = super.generateWarnings(data)
    
    // Warn if no relief requested found
    if (!data.categorySpecific?.relief?.requested || 
        data.categorySpecific.relief.requested === 'Not found') {
      warnings.push('Relief requested not found - this is critical for a motion')
    }
    
    // Warn if no grounds found
    if (data.categorySpecific?.grounds?.length === 0) {
      warnings.push('No legal grounds found - motions must have legal basis')
    }
    
    // Warn if no arguments found
    if (data.categorySpecific?.arguments?.length === 0) {
      warnings.push('No arguments found - verify this is a complete motion document')
    }
    
    return warnings
  }
}
