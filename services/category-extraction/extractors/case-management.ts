/**
 * LexiCore™ - Case Management Category Extractor
 * 
 * Extracts information from case management documents:
 * - Case Management Orders (CASE-CMO)
 * - Scheduling Orders (CASE-SCH-ORD)
 * - Conference Orders (CASE-CONF-ORD)
 * - Administrative Orders (CASE-ADMIN-ORD)
 * 
 * Total: 12 document types in Case Management category
 */

import { BaseCategoryExtractor } from './base-extractor'
import type { ExtractionRequest, DocumentCategory, CaseManagementData } from '../types'

export class CaseManagementExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Case Management'
  
  supportedTypes = [
    'CASE-CMO',          // Case Management Order
    'CASE-SCH-ORD',      // Scheduling Order
    'CASE-CONF-ORD',     // Conference Order
    'CASE-ADMIN-ORD',    // Administrative Order
    'NOTICE-SERVICE',    // Notice of Service
    'NOTICE-DEPO',       // Notice of Deposition
    'NOTICE-MOTION',     // Notice of Motion
    'NOTICE-HEARING',    // Notice of Hearing
    'NOTICE-APPEARANCE', // Notice of Appearance
    'NOTICE-WITHDRAW',   // Notice of Withdrawal
    'NOTICE-SUB-COUNSEL',// Notice of Substitution of Counsel
    'NOTICE-RELATED'     // Notice of Related Case
  ]

  generatePrompt(request: ExtractionRequest): string {
    return this.buildPrompt(request)
  }

  protected getCategoryPromptTemplate(request: ExtractionRequest): string {
    const typeName = request.typeName || 'Case Management Document'
    
    return `
You are extracting information from a CASE MANAGEMENT document: "${typeName}".

This is a court order or notice managing case proceedings, schedules, and requirements.

Extract the following CASE MANAGEMENT SPECIFIC information:

{
  "orderDetails": {
    "orderType": "${typeName}",
    "orderDate": "Date the order was issued (e.g., 'March 15, 2023')",
    "issuedBy": "Judge or magistrate name (e.g., 'Judge Joanna Seybert', 'Magistrate Judge Wicks')",
    "verbatim": "Exact quote of order header (e.g., 'MEMORANDUM AND ORDER' or 'SCHEDULING ORDER')",
    "page": 1,
    "confidence": 0-100
  },
  
  "scheduleItems": [
    {
      "event": "What must happen (e.g., 'Discovery Cutoff', 'Motion Deadline', 'Pre-Trial Conference', 'Expert Disclosure')",
      "date": "When it must happen (exact date if specified, e.g., 'May 1, 2023' or 'Not specified')",
      "party": "Who is responsible (e.g., 'Plaintiff', 'Defendant', 'All Parties', 'Parties')",
      "verbatim": "Exact quote from document",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "requirements": [
    {
      "requirement": "What parties must do (e.g., 'File joint pretrial order', 'Complete fact discovery', 'Proceed to arbitration')",
      "applicableTo": "Which party or 'All Parties' (e.g., 'Plaintiff', 'Defendant ABC Corp', 'All Parties')",
      "deadline": "Date if applicable (e.g., 'June 1, 2023' or 'Not specified')",
      "verbatim": "Exact quote showing the requirement",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "rulings": [
    {
      "ruling": "Court's decision or directive (e.g., 'Motion to compel arbitration GRANTED', 'Discovery extended to May 15', 'Case stayed pending arbitration')",
      "verbatim": "Exact quote of the ruling",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "attachments": [
    {
      "attachment": "Referenced document (e.g., 'Exhibit A', 'Proposed Schedule', 'Joint Statement')",
      "description": "Brief description of the attachment",
      "page": number
    }
  ]
}

CATEGORY-SPECIFIC INSTRUCTIONS:

1. ORDER DETAILS:
   - Look for the order type in the document title/header
   - Order date is usually near the top or at the signature line
   - Judge name appears in header or signature
   - Extract verbatim from the actual order language

2. SCHEDULE ITEMS:
   - Look for sections titled "SCHEDULE", "DEADLINES", "IMPORTANT DATES"
   - Common events: Discovery cutoff, Motion deadline, Expert disclosure, Pre-trial conference, Trial date
   - Extract EXACT dates (do not infer or calculate)
   - If a range is given, extract both dates
   - Note which party is responsible for each item

3. REQUIREMENTS:
   - Look for "SHALL", "MUST", "ORDERED", "DIRECTS" language
   - Extract what action is required
   - Note which party must comply
   - Include any deadlines associated with requirements

4. RULINGS:
   - Look for "GRANTED", "DENIED", "DISMISSED", "STAYED", "CONTINUED" language
   - Extract dispositive language (what the court decided)
   - Include reasoning if briefly stated

5. ATTACHMENTS:
   - Look for references to "Exhibit", "Attachment", "Appendix"
   - Note if the order adopts or references another document

CONFIDENCE SCORING FOR CASE MANAGEMENT:
- 95-100: Order details, dates, and rulings explicitly stated
- 85-94: Schedule items clearly listed in dedicated section
- 75-84: Requirements stated but need interpretation
- 65-74: Information scattered or requires inference
- Below 65: Unclear or ambiguous information

COMMON PATTERNS:
- "IT IS HEREBY ORDERED that..." → Look after this for rulings
- "The parties SHALL..." → This is a requirement
- "Discovery shall be completed by [DATE]" → This is a schedule item
- "The Court GRANTS/DENIES..." → This is a ruling
- "A pretrial conference is scheduled for [DATE]" → This is a schedule item

Return the complete JSON structure with ALL fields populated.
Use empty arrays [] for sections with no data.
Use "Not specified" for dates/deadlines that are not mentioned.
`
  }

  protected validateCategorySpecific(data: any): boolean {
    // Check for category-specific fields
    if (!data.categorySpecific) {
      return false
    }
    
    const cs = data.categorySpecific
    
    // orderDetails is required
    if (!cs.orderDetails || !cs.orderDetails.orderType || cs.orderDetails.confidence === undefined) {
      return false
    }
    
    // Arrays must be present (can be empty)
    if (!Array.isArray(cs.scheduleItems)) {
      return false
    }
    if (!Array.isArray(cs.requirements)) {
      return false
    }
    if (!Array.isArray(cs.rulings)) {
      return false
    }
    
    return true
  }

  protected getCategorySpecificConfidences(data: any): number[] {
    const confidences: number[] = []
    
    if (data.categorySpecific?.orderDetails?.confidence !== undefined) {
      confidences.push(data.categorySpecific.orderDetails.confidence)
    }
    
    // Add confidences from schedule items
    if (Array.isArray(data.categorySpecific?.scheduleItems)) {
      data.categorySpecific.scheduleItems.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from requirements
    if (Array.isArray(data.categorySpecific?.requirements)) {
      data.categorySpecific.requirements.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from rulings
    if (Array.isArray(data.categorySpecific?.rulings)) {
      data.categorySpecific.rulings.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    return confidences
  }

  protected generateWarnings(data: any): string[] {
    const warnings = super.generateWarnings(data)
    
    // Warn if no schedules found
    if (data.categorySpecific?.scheduleItems?.length === 0) {
      warnings.push('No schedule items found - this may be unusual for a case management order')
    }
    
    // Warn if no requirements found
    if (data.categorySpecific?.requirements?.length === 0) {
      warnings.push('No requirements found - verify this is correct')
    }
    
    // Warn if no rulings found in an order (notices may not have rulings)
    const isOrder = data.categorySpecific?.orderDetails?.orderType?.toLowerCase().includes('order')
    if (isOrder && data.categorySpecific?.rulings?.length === 0) {
      warnings.push('No rulings found in order - this may indicate incomplete extraction')
    }
    
    return warnings
  }
}
