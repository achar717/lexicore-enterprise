/**
 * LexiCore™ - Pleading Category Extractor
 * 
 * Extracts information from pleading documents:
 * - Complaints, Answers, Counterclaims, Cross-Claims
 * - Enhanced from existing good prompt with additional structure
 * 
 * Total: 8 document types in Pleading category
 */

import { BaseCategoryExtractor } from './base-extractor'
import type { ExtractionRequest, DocumentCategory } from '../types'

export class PleadingExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Pleading'
  
  supportedTypes = [
    // Complaint Types
    'PLEAD-COMP-CIVIL',    // Civil Complaint
    'PLEAD-COMP-CLASS',    // Class Action Complaint
    'PLEAD-COMP-AMEND',    // Amended Complaint
    'PLEAD-COMP-CROSS',    // Cross-Complaint
    
    // Answer Types
    'PLEAD-ANS-COMP',      // Answer to Complaint
    'PLEAD-ANS-AMEND',     // Amended Answer
    'PLEAD-COUNTER',       // Counterclaim
    'PLEAD-REPLY'          // Reply to Counterclaim
  ]

  generatePrompt(request: ExtractionRequest): string {
    return this.buildPrompt(request)
  }

  protected getCategoryPromptTemplate(request: ExtractionRequest): string {
    const typeName = request.typeName || 'Pleading'
    const typeCode = request.documentType || ''
    const isComplaint = typeCode.includes('COMP')
    
    // Use comprehensive complaint prompt for all complaint types
    if (isComplaint) {
      return this.getComplaintPrompt(typeName)
    }
    
    return `
You are an experienced paralegal reviewing a legal pleading: "${typeName}". Your supervising attorney needs you to extract key information into a standardized intake form with precision and completeness.

Extract the following PLEADING SPECIFIC information:

{
  "pleadingType": "${typeName}",
  "filingDate": "Date pleading was filed (e.g., 'March 1, 2023' or 'Not found')",
  
  "claims": [
    {
      "claim": "Name of the legal claim or cause of action (e.g., 'Breach of Contract', 'Negligence', 'Violation of 42 U.S.C. § 1983', 'Fraud')",
      "verbatim": "Exact quote of the claim language from the document",
      "page": number,
      "paragraph": number or null,
      "confidence": 0-100
    }
  ],
  
  "allegations": [
    {
      "allegation": "Key factual allegation - what allegedly happened (e.g., 'Defendant failed to deliver goods', 'Plaintiff suffered injuries', 'Contract was breached on March 1, 2023')",
      "verbatim": "Exact quote of the allegation",
      "page": number,
      "paragraph": number or null,
      "confidence": 0-100
    }
  ],
  
  "defenses": [
    {
      "defense": "Affirmative defense or denial (e.g., 'Statute of Limitations', 'Failure to State a Claim', 'Contributory Negligence', 'Lack of Personal Jurisdiction')",
      "verbatim": "Exact quote of the defense",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "reliefSought": {
    "relief": "What the party is requesting from the court (e.g., 'Compensatory damages in the amount of $500,000', 'Injunctive relief', 'Specific performance', 'Declaratory judgment')",
    "verbatim": "Exact quote from WHEREFORE/PRAYER FOR RELIEF section",
    "page": number,
    "confidence": 0-100
  },
  
  "jurisdictionalBasis": {
    "basis": "Legal basis for court jurisdiction (e.g., 'Federal question - 28 U.S.C. § 1331', 'Diversity jurisdiction - 28 U.S.C. § 1332', 'State law claims')",
    "verbatim": "Exact quote showing jurisdictional basis",
    "page": number,
    "confidence": 0-100
  },
  
  "exhibits": [
    {
      "exhibit": "Exhibit identifier (e.g., 'Exhibit A', 'Attachment 1', 'Appendix A')",
      "description": "What the exhibit is (e.g., 'Contract dated Jan 1, 2023', 'Email correspondence', 'Invoice')",
      "verbatim": "Exact quote or reference to the exhibit",
      "page": number,
      "confidence": 0-100
    }
  ]
}

CATEGORY-SPECIFIC INSTRUCTIONS:

1. PLEADING TYPE & FILING DATE:
   - Pleading type is in the title (e.g., "COMPLAINT", "ANSWER", "COUNTERCLAIM")
   - Filing date: Look for "Filed" date stamp, caption date, or certificate of service
   - Extract exactly as shown

2. LEGAL CLAIMS (Causes of Action):
   - Look for numbered sections: "COUNT I", "FIRST CAUSE OF ACTION", "CLAIM FOR..."
   - Extract the NAME of the claim (e.g., "Breach of Contract", not the full text)
   - Include statutory citations if present (e.g., "42 U.S.C. § 1983")
   - For COMPLAINTS: Focus on plaintiff's claims
   - For ANSWERS: May include counterclaims
   - Common claim types:
     * Contract: Breach of Contract, Breach of Warranty, Specific Performance
     * Tort: Negligence, Fraud, Defamation, Intentional Infliction of Emotional Distress
     * Civil Rights: § 1983, Title VII, ADA violations
     * Property: Trespass, Nuisance, Quiet Title

3. KEY ALLEGATIONS (Factual Assertions):
   - Extract the TOP 5-7 MOST IMPORTANT factual allegations
   - Focus on WHO did WHAT, WHEN, and WHY it matters
   - Look throughout the entire pleading, especially:
     * "FACTUAL BACKGROUND" section
     * Numbered paragraphs in each COUNT
     * "PARTIES" section (relationship allegations)
   - Be specific: Don't just say "Defendant breached contract"
     Say: "Defendant failed to deliver 1,000 units by March 1, 2023, as required under Section 3(a) of the Agreement"
   - Include dates, amounts, and key terms when present
   - For ANSWERS: Extract denials or admissions if significant

4. DEFENSES (For Answers/Replies):
   - Look for "AFFIRMATIVE DEFENSES" section (usually near end of Answer)
   - Common affirmative defenses:
     * Statute of Limitations / Statute of Frauds
     * Failure to State a Claim
     * Lack of Jurisdiction (personal or subject matter)
     * Contributory/Comparative Negligence
     * Waiver, Estoppel, Laches
     * Duress, Fraud, Mistake
     * Payment, Release, Accord and Satisfaction
   - Also extract general denials: "Defendant denies the allegations in Paragraph X"
   - For COMPLAINTS/COUNTERCLAIMS: This array will be empty []

5. RELIEF SOUGHT (Prayer for Relief):
   - Look for "WHEREFORE", "PRAYER FOR RELIEF", "REQUEST FOR RELIEF"
   - Usually at the END of each count or at end of pleading
   - Extract ALL forms of relief requested:
     * Monetary: "Compensatory damages", "Punitive damages", "Treble damages"
     * Equitable: "Injunctive relief", "Specific performance", "Rescission"
     * Declaratory: "Declaratory judgment that..."
     * Other: "Costs and attorney's fees", "Pre-judgment interest", "Such other relief as the Court deems just"
   - Be specific about amounts if stated
   - Include whether damages are "in excess of $X" or "at least $X"

6. JURISDICTIONAL BASIS:
   - Look in early paragraphs (usually ¶¶ 1-10)
   - Federal Courts:
     * Federal Question: 28 U.S.C. § 1331 (arising under federal law)
     * Diversity: 28 U.S.C. § 1332 (citizens of different states + amount in controversy)
     * Specific federal statutes (ERISA, securities laws, etc.)
   - State Courts:
     * General jurisdiction
     * Specific statutory basis if stated
   - Extract the exact language and citation

7. EXHIBITS:
   - Look throughout pleading for references: "Exhibit A", "Attachment 1", "Appendix A"
   - Check for:
     * "A copy of [document] is attached hereto as Exhibit A"
     * "See Exhibit B (Email dated...)"
     * References in allegations: "As stated in Exhibit C, paragraph 3..."
   - Common exhibit types:
     * Contracts and agreements
     * Emails and correspondence
     * Invoices and receipts
     * Photographs
     * Prior court orders
     * Corporate documents

PLEADING STRUCTURE GUIDANCE:

TYPICAL COMPLAINT STRUCTURE:
1. Caption (parties, court, case number)
2. Jurisdictional allegations (¶¶ 1-5)
3. Parties (¶¶ 6-15)
4. Factual background (¶¶ 16-50)
5. COUNT I (¶¶ 51-60) + Prayer for Relief
6. COUNT II (¶¶ 61-70) + Prayer for Relief
7. Overall prayer for relief
8. Signature and verification
9. Exhibits

TYPICAL ANSWER STRUCTURE:
1. Caption
2. Introductory paragraph
3. Responses to each paragraph (admit/deny/lack knowledge)
4. Affirmative defenses (usually numbered I-XX)
5. Counterclaims (if any)
6. Prayer for relief (dismissal + costs)
7. Signature

CONFIDENCE SCORING FOR PLEADINGS:
- 95-100: Claims clearly labeled (COUNT I: Breach of Contract)
- 85-94: Relief explicitly stated in WHEREFORE clause
- 75-84: Allegations clearly stated but scattered
- 65-74: Must infer claim type from allegations
- Below 65: Ambiguous or incomplete pleading

COMMON PATTERNS TO RECOGNIZE:
- "Upon information and belief, Defendant..." → Allegation
- "Plaintiff denies the allegations in Paragraph X" → Defense (in Answer context)
- "By reason of the foregoing, Plaintiff is entitled to..." → Relief sought
- "This Court has jurisdiction over this action pursuant to..." → Jurisdictional basis
- "COUNT I - BREACH OF CONTRACT" → Claim identification
- "WHEREFORE, Plaintiff respectfully requests..." → Prayer for relief
- "Defendant asserts the following Affirmative Defenses:" → Defenses section

SPECIAL HANDLING BY PLEADING TYPE:
- COMPLAINTS: Focus on claims, allegations, relief sought
- ANSWERS: Focus on denials, admissions, affirmative defenses, counterclaims
- COUNTERCLAIMS: Treat as a complaint (extract claims, allegations, relief)
- AMENDED PLEADINGS: Look for "Amendments" section or new paragraphs

CRITICAL RULES:
1. Extract claims BY NAME, not by full text
2. Include PARAGRAPH NUMBERS when available (for allegations and claims)
3. Be SPECIFIC in allegations (dates, amounts, parties involved)
4. Include ALL relief requested, not just damages
5. Extract affirmative defenses verbatim (they have legal significance)
6. Use empty array [] for sections that don't apply (e.g., defenses in a complaint)

Return the complete JSON structure with ALL fields populated.
Use empty arrays [] for inapplicable sections (e.g., defenses in complaints).
Use "Not found" for individual fields that are missing.
`
  }

  protected validateCategorySpecific(data: any): boolean {
    if (!data.categorySpecific) {
      return false
    }
    
    const cs = data.categorySpecific
    
    // pleadingType is required
    if (!cs.pleadingType) {
      return false
    }
    
    // Arrays must be present (can be empty)
    if (!Array.isArray(cs.claims) || 
        !Array.isArray(cs.allegations) || 
        !Array.isArray(cs.defenses) ||
        !Array.isArray(cs.exhibits)) {
      return false
    }
    
    // reliefSought is required
    if (!cs.reliefSought || !cs.reliefSought.relief) {
      return false
    }
    
    return true
  }

  protected getCategorySpecificConfidences(data: any): number[] {
    const confidences: number[] = []
    
    // Add reliefSought confidence
    if (data.categorySpecific?.reliefSought?.confidence !== undefined) {
      confidences.push(data.categorySpecific.reliefSought.confidence)
    }
    
    // Add jurisdictionalBasis confidence
    if (data.categorySpecific?.jurisdictionalBasis?.confidence !== undefined) {
      confidences.push(data.categorySpecific.jurisdictionalBasis.confidence)
    }
    
    // Add confidences from claims
    if (Array.isArray(data.categorySpecific?.claims)) {
      data.categorySpecific.claims.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from allegations
    if (Array.isArray(data.categorySpecific?.allegations)) {
      data.categorySpecific.allegations.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from defenses
    if (Array.isArray(data.categorySpecific?.defenses)) {
      data.categorySpecific.defenses.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    return confidences
  }

  protected generateWarnings(data: any): string[] {
    const warnings = super.generateWarnings(data)
    
    // Warn if no claims found in a complaint
    const isComplaint = data.categorySpecific?.pleadingType?.toLowerCase().includes('complaint')
    if (isComplaint && data.categorySpecific?.claims?.length === 0) {
      warnings.push('No claims found in complaint - this is critical for a complaint')
    }
    
    // Warn if no allegations found
    if (data.categorySpecific?.allegations?.length === 0) {
      warnings.push('No allegations found - verify document completeness')
    }
    
    // Warn if no relief sought
    if (!data.categorySpecific?.reliefSought?.relief || 
        data.categorySpecific.reliefSought.relief === 'Not found') {
      warnings.push('Relief sought not found - all pleadings should request relief')
    }
    
    // Warn if no defenses in an answer
    const isAnswer = data.categorySpecific?.pleadingType?.toLowerCase().includes('answer')
    if (isAnswer && data.categorySpecific?.defenses?.length === 0) {
      warnings.push('No defenses found in answer - verify this is an answer document')
    }
    
    return warnings
  }

  /**
   * Comprehensive Complaint Extraction Prompt
   * Extracts all critical information from complaints, class actions, amended complaints
   */
  private getComplaintPrompt(typeName: string): string {
    return `
You are an experienced litigation attorney reviewing a complaint: "${typeName}". Extract COMPREHENSIVE information for case strategy and trial preparation.

Extract the following COMPLETE COMPLAINT information:

{
  "complaintDetails": {
    "complaintType": "${typeName}",
    "filingDate": "Date complaint was filed (e.g., 'March 1, 2023' or look for date stamp)",
    "indexNumber": "Index/Case/Docket number (e.g., 'Index No. 123456/2023', 'Case No. 1:23-cv-12345')",
    "isAmended": true/false,
    "amendmentNumber": "First Amended, Second Amended, etc. or null",
    "totalPages": number,
    "totalCounts": number of causes of action/counts,
    "verbatim": "Exact quote of complaint title",
    "page": 1,
    "confidence": 0-100
  },

  "parties": {
    "plaintiffs": [
      {
        "name": "Full name (e.g., 'PEOPLE OF THE STATE OF NEW YORK', 'John Doe', 'ABC Corporation')",
        "role": "Role/capacity (e.g., 'Attorney General', 'Individual', 'Corporation', 'on behalf of all similarly situated')",
        "address": "Address if provided",
        "represented_by": "Attorney/law firm name",
        "verbatim": "Exact quote showing plaintiff identification",
        "page": number,
        "confidence": 0-100
      }
    ],
    "defendants": [
      {
        "name": "Full defendant name (e.g., 'UNITED PARCEL SERVICE, INC.', 'Jane Smith')",
        "role": "Role/capacity (e.g., 'Corporation', 'Individual', 'Officer')",
        "address": "Address for service",
        "verbatim": "Exact quote showing defendant identification",
        "page": number,
        "confidence": 0-100
      }
    ]
  },

  "jurisdiction": {
    "court": "Full court name (e.g., 'SUPREME COURT OF THE STATE OF NEW YORK', 'U.S. District Court, S.D.N.Y.')",
    "county": "County/district (e.g., 'County of New York', 'Southern District of New York')",
    "jurisdictionalBasis": "Legal basis for jurisdiction (e.g., 'State law claims', 'Federal question - 28 U.S.C. § 1331', 'Diversity jurisdiction')",
    "venue": "Why this court/county (e.g., 'Defendant's principal place of business', 'Where events occurred')",
    "verbatim": "Exact quote of jurisdictional statement",
    "page": number,
    "confidence": 0-100
  },

  "causeOfAction": [
    {
      "count": "Count number (e.g., 'COUNT I', 'FIRST CAUSE OF ACTION', 'Count 1')",
      "claim": "Name of legal claim (e.g., 'Violations of Executive Law § 63(12)', 'Breach of Contract', 'Negligence', 'Fraud')",
      "statute": "Statutory citation if provided (e.g., 'N.Y. Executive Law § 63(12)', '42 U.S.C. § 1983', '15 U.S.C. § 1681')",
      "elements": [
        "Element 1 of the claim",
        "Element 2 of the claim",
        "Element 3 of the claim"
      ],
      "factualBasis": "Brief summary of facts supporting this count",
      "verbatim": "Exact quote of count title and key allegations",
      "paragraphNumbers": "Range of paragraphs (e.g., '¶¶ 45-67')",
      "page": number,
      "confidence": 0-100
    }
  ],

  "keyAllegations": [
    {
      "allegation": "Specific factual allegation with WHO, WHAT, WHEN, WHERE (e.g., 'From 2015-2020, UPS engaged in fraudulent practices affecting over 10,000 NY consumers', 'Defendant breached Section 3(a) by failing to deliver goods by March 1, 2023')",
      "category": "Type of allegation (e.g., 'Fraudulent Conduct', 'Breach', 'Damages', 'Pattern of Behavior', 'Industry Practice')",
      "impactedParties": "Who was affected (e.g., 'Consumers in New York', 'All class members', 'Plaintiff')",
      "timeframe": "When it occurred (e.g., '2015-2020', 'March 1, 2023', 'Ongoing')",
      "verbatim": "Exact quote of allegation",
      "paragraphNumber": "¶ X or null",
      "page": number,
      "confidence": 0-100
    }
  ],

  "damagesAndHarms": [
    {
      "type": "Type of harm (e.g., 'Economic damages', 'Emotional distress', 'Reputational harm', 'Lost profits', 'Property damage')",
      "amount": "Dollar amount if specified (e.g., '$500,000', 'over $1,000,000', 'to be determined at trial')",
      "description": "Description of the harm/damage",
      "affectedParty": "Who suffered the harm",
      "verbatim": "Exact quote describing damages",
      "page": number,
      "confidence": 0-100
    }
  ],

  "reliefSought": {
    "monetaryRelief": [
      {
        "type": "Type of monetary relief (e.g., 'Compensatory damages', 'Punitive damages', 'Treble damages', 'Restitution', 'Disgorgement')",
        "amount": "Amount requested (e.g., '$5,000,000', 'to be determined at trial', 'actual damages')",
        "basis": "Legal basis for amount (e.g., 'actual damages suffered', 'statutory damages under § 63(12)', 'treble damages under RICO')",
        "verbatim": "Exact quote",
        "page": number
      }
    ],
    "equitableRelief": [
      {
        "type": "Type of equitable relief (e.g., 'Injunctive relief', 'Declaratory judgment', 'Specific performance', 'Rescission', 'Appointment of monitor')",
        "description": "What is requested (e.g., 'Permanently enjoin defendant from engaging in fraudulent practices', 'Order defendant to cease operations')",
        "verbatim": "Exact quote",
        "page": number
      }
    ],
    "otherRelief": [
      {
        "type": "Other relief (e.g., 'Costs and attorney fees', 'Pre- and post-judgment interest', 'Such other relief as the Court deems just')",
        "verbatim": "Exact quote",
        "page": number
      }
    ]
  },

  "legalTheories": [
    {
      "theory": "Legal theory/argument (e.g., 'Pattern of deceptive practices violates consumer protection law', 'Breach of fiduciary duty', 'Strict liability')",
      "supportingLaw": "Case law or statute cited",
      "application": "How it applies to facts",
      "verbatim": "Exact quote",
      "page": number,
      "confidence": 0-100
    }
  ],

  "classActionDetails": {
    "isClassAction": true/false,
    "classDefinition": "Who is in the class (e.g., 'All consumers in NY who used defendant's services from 2015-2020')",
    "estimatedClassSize": "Number or estimate (e.g., 'over 10,000', 'thousands', 'to be determined')",
    "commonQuestions": [
      "Common question of law or fact 1",
      "Common question of law or fact 2"
    ],
    "typicality": "Why plaintiff's claims are typical of the class",
    "adequacy": "Why plaintiff is adequate class representative",
    "verbatim": "Exact quote of class allegations",
    "page": number,
    "confidence": 0-100
  },

  "exhibits": [
    {
      "exhibit": "Exhibit identifier (e.g., 'Exhibit A', 'Attachment 1')",
      "description": "What it is (e.g., 'Contract dated Jan 1, 2020', 'Email correspondence', 'Industry report', 'Financial statements')",
      "relevance": "Why it's important (e.g., 'Proves breach', 'Shows pattern', 'Establishes damages')",
      "verbatim": "Exact reference to exhibit",
      "page": number,
      "confidence": 0-100
    }
  ],

  "importantDates": [
    {
      "date": "Date in YYYY-MM-DD format if possible",
      "event": "What happened (e.g., 'Contract executed', 'Breach occurred', 'Plaintiff discovered fraud', 'Defendant refused to pay')",
      "relevance": "Why this date matters",
      "page": number
    }
  ],

  "statutoryViolations": [
    {
      "statute": "Full statutory citation (e.g., 'N.Y. Executive Law § 63(12)', '15 U.S.C. § 1681', 'Cal. Bus. & Prof. Code § 17200')",
      "statuteName": "Common name (e.g., 'New York Consumer Protection Act', 'Fair Credit Reporting Act', 'California Unfair Competition Law')",
      "violation": "What was violated (e.g., 'Fraudulent business practices', 'Failure to provide notice', 'False advertising')",
      "specificProvision": "Which part of statute (e.g., 'prohibition on deceptive practices', 'requirement to disclose')",
      "verbatim": "Exact quote of violation allegation",
      "page": number,
      "confidence": 0-100
    }
  ]
}

EXTRACTION INSTRUCTIONS FOR COMPLAINTS:

1. COMPLAINT DETAILS:
   - Look at title page for case number, filing date
   - Count the number of "COUNT" or "CAUSE OF ACTION" sections
   - Check if "AMENDED" appears in title
   - Extract verbatim from caption

2. PARTIES:
   - Extract ALL plaintiffs and ALL defendants
   - Include role/capacity (individual, corporation, government entity)
   - Note if "on behalf of" or "d/b/a" or "individually and as"
   - Include attorney names from signature blocks
   - Get addresses from caption or service information

3. JURISDICTION & VENUE:
   - Full court name from caption
   - County/district from caption
   - Look for "JURISDICTION" section early in complaint
   - Extract venue explanation (why this court)

4. CAUSES OF ACTION:
   - Extract EVERY count/cause of action
   - Get claim name (e.g., "Breach of Contract")
   - Note statutory citations (e.g., "42 U.S.C. § 1983")
   - Identify elements of each claim
   - Summarize factual basis for each count
   - Note paragraph ranges for each count

5. KEY ALLEGATIONS:
   - Extract 10-15 MOST IMPORTANT factual allegations
   - Focus on:
     * What defendant allegedly did wrong
     * Dates and timeframes
     * Dollar amounts and scope
     * Pattern of conduct
     * Industry practices
     * Consumer impact
   - Be SPECIFIC - include numbers, dates, amounts
   - Don't just say "defendant breached" - say WHAT, WHEN, HOW

6. DAMAGES AND HARMS:
   - Economic damages (lost profits, costs, fees)
   - Personal injury (physical, emotional)
   - Property damage
   - Reputational harm
   - Get dollar amounts if specified
   - Note if "to be determined at trial"

7. RELIEF SOUGHT:
   - Look for "WHEREFORE" or "PRAYER FOR RELIEF"
   - Usually at end of each count or at end of complaint
   - Extract monetary relief (compensatory, punitive, treble)
   - Extract equitable relief (injunction, specific performance)
   - Extract other relief (costs, fees, interest)

8. CLASS ACTION DETAILS:
   - Check if complaint mentions "class action" or "on behalf of all"
   - Extract class definition carefully
   - Get estimated class size
   - Note common questions of law/fact
   - Extract typicality and adequacy statements

9. STATUTORY VIOLATIONS:
   - Extract EVERY statute cited
   - Get full citation (e.g., "N.Y. Executive Law § 63(12)")
   - Get common name of statute
   - Describe what was violated
   - Note specific provision violated

10. EXHIBITS:
    - List all exhibits referenced
    - Describe what each exhibit is
    - Note why it's relevant to claims

11. IMPORTANT DATES:
    - Contract dates
    - Breach dates
    - Discovery dates
    - Statute of limitations dates
    - Any deadline mentioned

CONFIDENCE SCORING FOR COMPLAINTS:
- 95-100: Claim elements explicitly stated with clear factual support
- 85-94: All major sections present (parties, claims, allegations, relief)
- 75-84: Claims and relief clear but some facts scattered
- 65-74: Can identify main claims but details unclear
- Below 65: Incomplete or poorly organized complaint

COMMON COMPLAINT PATTERNS:

CONSUMER PROTECTION:
- Allegations of deceptive practices, false advertising, fraud
- Statutory citations (e.g., state consumer protection acts)
- Class action allegations
- Restitution, disgorgement, injunctive relief

CONTRACT BREACH:
- Parties to contract
- Contract terms
- Breach allegations (what wasn't done)
- Damages (expectation, reliance, consequential)

CIVIL RIGHTS:
- § 1983 claims, Title VII, ADA
- Allegations of discrimination, retaliation, denial of rights
- Damages (compensatory, punitive)
- Injunctive relief

Return the complete JSON structure with ALL fields populated.
Extract EVERY relevant detail - this is critical for case assessment.
Use empty arrays [] for sections with no data.
`
  }
}
