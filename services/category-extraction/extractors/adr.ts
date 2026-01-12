/**
 * LexiCore™ - ADR (Alternative Dispute Resolution) Category Extractor
 * 
 * Extracts information from ADR documents:
 * - Arbitration agreements, demands, awards, orders
 * - Mediation agreements, statements, settlements
 * 
 * Total: 15 document types in ADR category
 */

import { BaseCategoryExtractor } from './base-extractor'
import type { ExtractionRequest, DocumentCategory } from '../types'

export class ADRExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'ADR'
  
  supportedTypes = [
    // Arbitration Documents
    'ARB-AGREE',          // Arbitration Agreement
    'ARB-DEMAND',         // Arbitration Demand
    'ARB-ANSWER',         // Arbitration Answer
    'ARB-BRIEF',          // Arbitration Brief
    'ARB-HEARING',        // Arbitration Hearing Transcript
    'ARB-AWARD',          // Arbitration Award
    'ARB-CONFIRM',        // Motion to Confirm Arbitration Award
    'ARB-VACATE',         // Motion to Vacate Arbitration Award
    'ARB-ORDER',          // Arbitration Order (court orders about arbitration)
    
    // Mediation Documents
    'MED-STMT',           // Mediation Statement
    'MED-AGREE-TO-MED',   // Agreement to Mediate
    'MED-BRIEF',          // Mediation Brief
    'MED-SETTLE',         // Mediated Settlement Agreement
    'MED-REPORT',         // Mediator Report
    
    // Generic ADR
    'ADR-AGREEMENT'       // Generic ADR Agreement
  ]

  generatePrompt(request: ExtractionRequest): string {
    return this.buildPrompt(request)
  }

  protected getCategoryPromptTemplate(request: ExtractionRequest): string {
    const typeName = request.typeName || 'ADR Document'
    const typeCode = request.extractionType || ''  // FIXED: Use extractionType not documentType
    const isCourtOrder = typeCode === 'ARB-ORDER'
    
    // Special handling for ARB-ORDER (court orders about arbitration)
    if (isCourtOrder) {
      return this.getArbitrationOrderPrompt(typeName)
    }
    
    return `
You are extracting information from an ADR (Alternative Dispute Resolution) document: "${typeName}".

This could be an arbitration agreement, mediation document, or ADR proceeding record.

Extract the following ADR SPECIFIC information under the "categorySpecific" key:

{
  "categorySpecific": {
    "adrDetails": {
    "documentType": "${typeName}",
    "adrType": "Arbitration, Mediation, or Other",
    "dateExecuted": "Date document was signed/executed (e.g., 'January 15, 2023' or 'Not found')",
    "verbatim": "Exact quote of document title/header",
    "page": 1,
    "confidence": 0-100
  },
  
  "adrProviders": [
    {
      "name": "Arbitrator/Mediator full name (e.g., 'Hon. John Smith (Ret.)', 'Jane Doe, Esq.')",
      "role": "Role in ADR process (e.g., 'Sole Arbitrator', 'Panel Chair', 'Mediator', 'Panel Member')",
      "organization": "Organization affiliation (e.g., 'AAA', 'JAMS', 'Independent')",
      "verbatim": "Exact quote showing name and role",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "terms": [
    {
      "term": "Key term or provision (e.g., 'Binding Arbitration', 'Confidentiality', 'Costs', 'Governing Law', 'Class Action Waiver')",
      "description": "What the term specifies (e.g., 'Parties waive right to jury trial', 'Each party bears own costs', 'Arbitration conducted under AAA rules')",
      "verbatim": "Exact quote of the term language",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "decisions": [
    {
      "decision": "Award, ruling, or agreed resolution (e.g., 'Claimant awarded $50,000', 'Motion to compel arbitration GRANTED', 'Parties agree to settle for $100,000')",
      "award": "Monetary amount if applicable (e.g., '$50,000', 'None')",
      "inFavorOf": "Which party prevailed (e.g., 'Claimant', 'Respondent', 'Split decision')",
      "verbatim": "Exact quote of decision/award language",
      "page": number,
      "confidence": 0-100
    }
  ],
  
  "signatures": [
    {
      "signatory": "Name of person signing (e.g., 'John Doe', 'ABC Corporation by Jane Smith, CEO')",
      "capacity": "Role of signatory (e.g., 'Party', 'Counsel', 'Witness', 'Arbitrator', 'Corporate Representative')",
      "dateSigned": "Date signed (e.g., 'March 15, 2023' or 'Not found')",
      "page": number
    }
  ]
  }
}

CATEGORY-SPECIFIC INSTRUCTIONS:

1. ADR DETAILS:
   - Document type: Look at title (Agreement, Demand, Award, Statement, etc.)
   - ADR type: Distinguish between Arbitration, Mediation, or Other
   - Date executed: Look for signature dates, execution date, "as of" date
   - Extract verbatim from document header/title

2. ADR PROVIDERS:
   - Arbitrators: Look for "ARBITRATOR", "PANEL", neutral appointment
   - Mediators: Look for "MEDIATOR", "NEUTRAL", facilitator designation
   - Organization: AAA (American Arbitration Association), JAMS, CPR, FINRA, etc.
   - Include credentials (Ret., Esq., Hon.) and affiliations

3. TERMS AND PROVISIONS:
   - For AGREEMENTS: Extract key contractual terms
     * Arbitration scope (what disputes are covered)
     * Rules governing (AAA, JAMS, ad hoc)
     * Location/venue
     * Number of arbitrators
     * Costs and fees allocation
     * Confidentiality provisions
     * Class action waiver
     * Appeal/review rights
   
   - For AWARDS: Extract findings and rulings
     * Claims decided
     * Findings of fact
     * Conclusions of law
     * Award amounts and allocation
   
   - For DEMANDS/ANSWERS: Extract claims and defenses
     * Claims asserted
     * Relief sought
     * Defenses raised
     * Counterclaims

4. DECISIONS/AWARDS:
   - Look for "AWARD", "DECISION", "RULING", "ORDER", "DETERMINATION"
   - Extract monetary amounts with specificity
   - Note which party prevailed on each claim
   - Include interest, costs, fees if awarded

5. SIGNATURES:
   - Look at end of document for signature blocks
   - Note capacity: Party, Attorney, Witness, Arbitrator, Mediator
   - Check for corporate signatures (officer title)
   - Extract dates next to signatures

CONFIDENCE SCORING FOR ADR:
- 95-100: Agreement/Award terms explicitly stated with signatures
- 85-94: Provider names and roles clearly identified
- 75-84: Terms stated but some interpretation needed
- 65-74: Key information present but scattered
- Below 65: Incomplete or ambiguous document

COMMON PATTERNS BY DOCUMENT TYPE:

ARBITRATION AGREEMENT:
- "The parties agree to submit disputes to binding arbitration..."
- "This agreement contains a binding arbitration clause..."
- Look for: scope, rules, provider, costs, confidentiality, class waiver

ARBITRATION DEMAND:
- "Claimant hereby demands arbitration..."
- "STATEMENT OF CLAIM: ..."
- Look for: claims, relief sought, factual basis, damages

ARBITRATION AWARD:
- "The Arbitrator, having considered the evidence and arguments, hereby AWARDS..."
- "AWARD: The Claimant is awarded..."
- Look for: findings, conclusions, award amounts, costs

MEDIATION AGREEMENT:
- "The parties agree to participate in mediation..."
- "Terms of Settlement: ..."
- Look for: mediator, settlement terms, confidentiality, releases

SPECIAL HANDLING:
- AGREEMENTS: Focus on binding obligations and rights
- AWARDS: Focus on decisions and monetary amounts
- DEMANDS/ANSWERS: Focus on claims and defenses
- SETTLEMENTS: Focus on terms, amounts, and releases

Return the complete JSON structure with ALL fields populated.
Use empty arrays [] for sections with no data.
`
  }

  protected validateCategorySpecific(data: any): boolean {
    // Flexible validation - accept if we have ANY category-specific data
    if (!data.categorySpecific) {
      console.warn('ADR validation: No categorySpecific data found');
      return false;
    }
    
    const cs = data.categorySpecific;
    
    // Check if we have AT LEAST ONE of the expected fields
    const hasAdrDetails = cs.adrDetails && typeof cs.adrDetails === 'object';
    const hasProviders = Array.isArray(cs.adrProviders) && cs.adrProviders.length > 0;
    const hasTerms = Array.isArray(cs.terms) && cs.terms.length > 0;
    const hasDecisions = Array.isArray(cs.decisions) && cs.decisions.length > 0;
    const hasSignatures = Array.isArray(cs.signatures) && cs.signatures.length > 0;
    
    // Pass if we have adrDetails OR any other data
    if (!hasAdrDetails && !hasProviders && !hasTerms && !hasDecisions && !hasSignatures) {
      console.warn('ADR validation: No valid categorySpecific fields found', {
        hasAdrDetails,
        hasProviders,
        hasTerms,
        hasDecisions,
        hasSignatures,
        availableKeys: Object.keys(cs)
      });
      return false;
    }
    
    return true;
  }

  protected getCategorySpecificConfidences(data: any): number[] {
    const confidences: number[] = []
    
    if (data.categorySpecific?.adrDetails?.confidence !== undefined) {
      confidences.push(data.categorySpecific.adrDetails.confidence)
    }
    
    // Add confidences from providers
    if (Array.isArray(data.categorySpecific?.adrProviders)) {
      data.categorySpecific.adrProviders.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from terms
    if (Array.isArray(data.categorySpecific?.terms)) {
      data.categorySpecific.terms.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    // Add confidences from decisions
    if (Array.isArray(data.categorySpecific?.decisions)) {
      data.categorySpecific.decisions.forEach((item: any) => {
        if (item.confidence !== undefined) {
          confidences.push(item.confidence)
        }
      })
    }
    
    return confidences
  }

  protected generateWarnings(data: any): string[] {
    const warnings = super.generateWarnings(data)
    
    const adrType = data.categorySpecific?.adrDetails?.adrType
    
    // Warn based on document type expectations
    if (adrType === 'Arbitration') {
      // For arbitration agreements, terms should be present
      if (data.categorySpecific?.terms?.length === 0) {
        warnings.push('No arbitration terms found - verify document completeness')
      }
      
      // For arbitration awards, decisions should be present
      const isAward = data.categorySpecific?.adrDetails?.documentType?.toLowerCase().includes('award')
      if (isAward && data.categorySpecific?.decisions?.length === 0) {
        warnings.push('No award decisions found - this is critical for an arbitration award')
      }
    }
    
    if (adrType === 'Mediation') {
      // For mediation agreements/settlements, signatures expected
      if (data.categorySpecific?.signatures?.length === 0) {
        warnings.push('No signatures found - verify this is a signed agreement')
      }
    }
    
    // Warn if no providers identified
    if (data.categorySpecific?.adrProviders?.length === 0) {
      warnings.push('No arbitrators/mediators identified - verify document type')
    }
    
    return warnings
  }

  /**
   * Specialized prompt for ARB-ORDER (Court Orders about Arbitration)
   */
  private getArbitrationOrderPrompt(typeName: string): string {
    return `
You are extracting information from a COURT ORDER about arbitration: "${typeName}".

This is a judicial order ruling on arbitration-related motions (e.g., motion to compel arbitration, motion to confirm/vacate award).

Extract COMPREHENSIVE information about this court order under the "categorySpecific" key:

{
  "categorySpecific": {
    "orderDetails": {
    "orderType": "Type of order (e.g., 'Memorandum and Order', 'Opinion and Order', 'Decision and Order')",
    "dateIssued": "Date court issued this order",
    "judge": "Judge's full name and title",
    "court": "Full court name (e.g., 'U.S. District Court, Eastern District of New York')",
    "verbatim": "Exact quote of order title/header",
    "page": 1,
    "confidence": 0-100
  },

  "motionDetails": {
    "motionType": "Type of motion ruled upon (e.g., 'Motion to Compel Arbitration', 'Motion to Confirm Award', 'Motion to Vacate Award', 'Motion to Stay Proceedings')",
    "movingParty": "Party who filed the motion",
    "opposingParty": "Party opposing the motion",
    "motionFiledDate": "Date motion was filed",
    "ruling": "Court's ruling (e.g., 'GRANTED', 'DENIED', 'GRANTED IN PART', 'DENIED IN PART')",
    "verbatim": "Exact quote of the court's ruling",
    "page": number,
    "confidence": 0-100
  },

  "underlyingClaims": [
    {
      "claim": "Nature of underlying legal claim (e.g., 'FCRA violation', 'Breach of contract', 'Employment discrimination')",
      "statute": "Statute or law cited (e.g., 'Fair Credit Reporting Act, 15 U.S.C. § 1681', 'Title VII')",
      "factualBasis": "Brief description of factual allegations",
      "verbatim": "Exact quote describing the claim",
      "page": number,
      "confidence": 0-100
    }
  ],

  "arbitrationAgreementAnalysis": {
    "agreementExists": "true/false - Does valid arbitration agreement exist?",
    "agreementSource": "Source of arbitration agreement (e.g., 'Terms of Use for CreditWorks service', 'Employment contract', 'Purchase agreement')",
    "agreementDate": "Date arbitration agreement was entered",
    "scopeOfArbitration": "What disputes are covered by arbitration clause",
    "arbitrationRules": "Rules governing arbitration (e.g., 'AAA Commercial Rules', 'JAMS Rules', 'Ad hoc')",
    "classActionWaiver": "true/false - Does agreement waive class actions?",
    "verbatim": "Exact quote of key arbitration clause language",
    "page": number,
    "confidence": 0-100
  },

  "legalIssues": [
    {
      "issue": "Legal issue court analyzed (e.g., 'Whether arbitration agreement is enforceable', 'Whether plaintiff consented to arbitration', 'Third-party beneficiary status')",
      "courtFinding": "Court's conclusion on this issue (e.g., 'Agreement is valid and enforceable', 'Plaintiff consented by accepting Terms of Use')",
      "reasoning": "Brief summary of court's reasoning",
      "caseLawCited": "Key cases cited by court (e.g., 'AT&T Mobility LLC v. Concepcion, 563 U.S. 333 (2011)')",
      "verbatim": "Exact quote of court's analysis",
      "page": number,
      "confidence": 0-100
    }
  ],

  "courtOrders": [
    {
      "order": "Specific order issued by court (e.g., 'Case is STAYED pending arbitration', 'Parties ORDERED to arbitration', 'Award is CONFIRMED and entered as judgment')",
      "effectiveDate": "When order takes effect",
      "nextSteps": "What happens next (e.g., 'Parties to proceed to arbitration within 60 days', 'Clerk to enter judgment')",
      "verbatim": "Exact quote of the order",
      "page": number,
      "confidence": 0-100
    }
  ],

  "keyFindings": [
    {
      "finding": "Important factual or legal finding (e.g., 'Plaintiff signed up for CreditWorks service and accepted Terms of Use', 'Terms of Use contained valid arbitration clause')",
      "impact": "Impact of this finding (e.g., 'Establishes consent to arbitration', 'Supports enforceability of agreement')",
      "verbatim": "Exact quote of the finding",
      "page": number,
      "confidence": 0-100
    }
  ],

  "importantDates": [
    {
      "date": "Date in YYYY-MM-DD format",
      "event": "What happened on this date (e.g., 'Complaint filed', 'Motion to compel arbitration filed', 'Court issued order')",
      "page": number
    }
  ],

  "monetaryAmounts": [
    {
      "amount": "Dollar amount (e.g., '$50,000', '$1,500 in costs')",
      "description": "What this amount represents (e.g., 'Damages sought', 'Attorney fees awarded', 'Costs of proceeding')",
      "awardedTo": "Who receives this amount",
      "page": number
    }
  ]
  }
}

EXTRACTION INSTRUCTIONS FOR ARB-ORDER:

1. ORDER DETAILS:
   - Look for court caption and case number
   - Identify the judge (often at signature line or beginning)
   - Note court name from caption
   - Extract order date (usually at end or beginning)

2. MOTION DETAILS:
   - Identify what motion the court is ruling on (title, "Background" section)
   - Note who filed the motion (usually defendant in motion to compel)
   - Look for "GRANTED", "DENIED", "SO ORDERED" language
   - Extract date motion was filed

3. UNDERLYING CLAIMS:
   - Review "Background" or "Factual History" sections
   - Extract ALL legal claims (FCRA, breach of contract, etc.)
   - Note statutory citations (e.g., 15 U.S.C. § 1681)
   - Summarize key factual allegations

4. ARBITRATION AGREEMENT ANALYSIS:
   - Find discussion of arbitration agreement
   - Extract source of agreement (contract, terms of use, etc.)
   - Note scope ("all disputes related to...")
   - Identify governing rules (AAA, JAMS, etc.)
   - Check for class action waiver language

5. LEGAL ISSUES:
   - Extract court's legal analysis
   - Note key legal questions addressed
   - Summarize court's reasoning
   - Capture case law citations (case name, year, cite)

6. COURT ORDERS:
   - Look at "CONCLUSION", "ORDER", or "SO ORDERED" sections
   - Extract specific relief granted/denied
   - Note procedural next steps
   - Identify deadlines or time frames

7. KEY FINDINGS:
   - Capture important factual findings
   - Note credibility determinations
   - Extract findings about consent, validity, enforceability

8. IMPORTANT DATES:
   - Complaint filed date
   - Motion filed date
   - Answer filed date
   - Order issued date
   - Any future deadlines

9. MONETARY AMOUNTS:
   - Damages sought in complaint
   - Settlement amounts discussed
   - Costs awarded
   - Attorney fees

CONFIDENCE SCORING FOR ARB-ORDER:
- 95-100: Court's ruling is crystal clear with explicit analysis
- 85-94: Legal issues and findings well-documented
- 75-84: Main ruling clear but some analysis unclear
- 65-74: Can identify ruling but reasoning scattered
- Below 65: Order is unclear or incomplete

COMMON PATTERNS IN ARB-ORDERS:

MOTION TO COMPEL ARBITRATION:
- "Defendant moves to compel arbitration pursuant to..."
- Court analyzes: (1) valid agreement, (2) scope covers dispute, (3) party consented
- Ruling: "Motion to compel arbitration is GRANTED. Case is STAYED pending arbitration."

MOTION TO CONFIRM AWARD:
- "Movant seeks to confirm arbitration award dated..."
- Court reviews for: (1) proper notice, (2) no fraud/corruption, (3) arbitrator jurisdiction
- Ruling: "Award is CONFIRMED. Clerk to enter judgment in amount of $X."

MOTION TO VACATE AWARD:
- "Respondent moves to vacate award on grounds of..."
- Court applies narrow FAA standard (9 U.S.C. § 10)
- Ruling: "Motion to vacate is DENIED. Award stands."

Return the complete JSON structure with ALL fields populated.
Extract EVERY relevant detail - this is critical for litigation strategy.
Use empty arrays [] for sections with no data.
`
  }
}
