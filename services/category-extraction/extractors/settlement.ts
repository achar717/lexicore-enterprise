import { BaseCategoryExtractor } from './base-extractor';
import { SettlementData } from '../types';
import { buildCompletePrompt } from '../prompts/common';

/**
 * SettlementExtractor
 * 
 * Handles extraction for 8 Settlement document types:
 * 
 * Settlement/Agreements (3 types):
 * - SETTLE-AGREE, SETTLE-AGREE-CONF, SETTLE-AGREE-PARTIAL
 * 
 * Settlement/Negotiations (3 types):
 * - SETTLE-DEMAND, SETTLE-OFFER, SETTLE-COUNTER
 * 
 * Settlement/Court Filings (2 types):
 * - SETTLE-STIP-DISMISS, SETTLE-NOTICE
 */
export class SettlementExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Settlement'
  
  supportedTypes = [
    'SETTLE-AGREE',         // Settlement Agreement
    'SETTLE-OFFER',         // Settlement Offer  
    'SETTLE-DEMAND',        // Settlement Demand
    'SETTLE-RELEASE',       // Release Agreement
    'SETTLE-STIPULATION',   // Stipulation of Settlement
    'SETTLE-CONF-AGREE',    // Confidentiality Agreement
    'SETTLE-NOTICE',        // Notice of Settlement
    'SETTLE-MOTION-APPROVE' // Motion for Approval
  ]

  protected getCategoryPrompt(documentText: string, documentType: string): string {
    const categoryInstructions = `
# SETTLEMENT DOCUMENT EXTRACTION

Extract comprehensive settlement-specific information from this document.

## Document Categories & Key Information:

### 1. SETTLEMENT AGREEMENTS
If this is settlement agreement or stipulation:
- Extract settling parties and their roles
- Document settlement amount and payment terms
- Identify release and waiver provisions
- Extract confidentiality terms
- Document dismissal terms (with/without prejudice)
- List any ongoing obligations

### 2. SETTLEMENT NEGOTIATIONS
If this is demand, offer, or counteroffer:
- Identify demanding/offering party
- Extract settlement amount
- Document payment terms and conditions
- List factual/legal basis for amount
- Extract deadline for acceptance
- Identify contingencies

### 3. COURT FILINGS
If this is stipulation for dismissal or settlement notice:
- Extract dismissal terms (with/without prejudice)
- Document court approval requirements
- Identify retained jurisdiction (if any)
- Extract cost/fee allocations

## Required Output Structure:

{
  "caseInfo": { /* Common case info - REQUIRED */ },
  "settlementSpecific": {
    "settlementType": "full_settlement" | "partial_settlement" | "demand" | "offer" | "counteroffer" | "stipulation_dismissal",
    "settlementDate": { "value": "2024-01-15", "verbatim": "...", "page": 1, "confidence": 100 },
    
    "parties": {
      "settlingParties": [
        {
          "name": "Smith Corp",
          "role": "plaintiff" | "defendant" | "claimant" | "respondent",
          "representedBy": "Jones & Associates",
          "verbatim": "...",
          "page": 1,
          "confidence": 100
        }
      ],
      "nonsettlingParties": [
        {
          "name": "ABC Inc",
          "role": "defendant",
          "reason": "Did not participate in settlement",
          "verbatim": "...",
          "page": 2,
          "confidence": 90
        }
      ]
    },
    
    "monetaryTerms": {
      "totalAmount": {
        "amount": 500000,
        "currency": "USD",
        "verbatim": "...",
        "page": 3,
        "confidence": 100
      },
      "breakdown": [
        {
          "description": "Compensatory damages",
          "amount": 300000,
          "verbatim": "...",
          "page": 3,
          "confidence": 95
        },
        {
          "description": "Attorneys' fees",
          "amount": 150000,
          "verbatim": "...",
          "page": 3,
          "confidence": 95
        },
        {
          "description": "Costs",
          "amount": 50000,
          "verbatim": "...",
          "page": 3,
          "confidence": 95
        }
      ],
      "paymentTerms": {
        "schedule": "lump_sum" | "installments" | "structured",
        "dueDate": { "value": "2024-03-01", "verbatim": "...", "page": 4, "confidence": 100 },
        "installments": [
          {
            "amount": 250000,
            "dueDate": "2024-03-01",
            "description": "Initial payment",
            "verbatim": "...",
            "page": 4,
            "confidence": 95
          },
          {
            "amount": 250000,
            "dueDate": "2024-09-01",
            "description": "Final payment",
            "verbatim": "...",
            "page": 4,
            "confidence": 95
          }
        ],
        "paymentMethod": "wire transfer",
        "accountInfo": "Account ending in ****1234",
        "verbatim": "...",
        "page": 4,
        "confidence": 90
      },
      "taxAllocation": {
        "damagesAllocated": 300000,
        "attorneysFeesAllocated": 150000,
        "taxTreatment": "W-2 reporting required",
        "verbatim": "...",
        "page": 5,
        "confidence": 85
      }
    },
    
    "nonMonetaryTerms": [
      {
        "type": "non_disparagement" | "confidentiality" | "non_admission" | "ongoing_obligations" | "injunctive_relief" | "other",
        "description": "Mutual non-disparagement clause",
        "obligatedParty": "Both parties",
        "duration": "Indefinite",
        "remedies": "Liquidated damages of $50,000",
        "verbatim": "...",
        "page": 6,
        "confidence": 95
      }
    ],
    
    "releaseProvisions": {
      "releasingParty": "Plaintiff",
      "releasedParties": ["Defendant", "Defendant's officers and directors"],
      "scopeOfRelease": "general" | "limited" | "mutual",
      "claimsReleased": [
        {
          "claimType": "All claims arising from employment relationship",
          "timeframe": "From date of hire through date of settlement",
          "exceptions": ["Vested pension benefits", "COBRA rights"],
          "verbatim": "...",
          "page": 7,
          "confidence": 95
        }
      ],
      "reservedClaims": [
        {
          "claim": "Indemnification rights under state law",
          "reason": "Not subject to release",
          "verbatim": "...",
          "page": 8,
          "confidence": 90
        }
      ]
    },
    
    "confidentialityTerms": {
      "isConfidential": true,
      "scope": "Settlement amount and terms",
      "exceptions": [
        "Disclosure to attorneys, accountants, and tax advisors",
        "As required by law or court order"
      ],
      "duration": "Indefinite",
      "remedies": "Breach subjects breaching party to liquidated damages",
      "verbatim": "...",
      "page": 9,
      "confidence": 95
    },
    
    "dismissalTerms": {
      "dismissalType": "with_prejudice" | "without_prejudice",
      "dismissalDate": { "value": "2024-02-15", "verbatim": "...", "page": 10, "confidence": 100 },
      "courtApprovalRequired": true,
      "retainedJurisdiction": {
        "retained": true,
        "purpose": "Enforcement of settlement terms",
        "duration": "Until all payments complete",
        "verbatim": "...",
        "page": 10,
        "confidence": 95
      },
      "costsAndFees": {
        "allocation": "Each party bears own costs",
        "exceptions": ["Court filing fees paid by defendant"],
        "verbatim": "...",
        "page": 11,
        "confidence": 90
      }
    },
    
    "conditions": [
      {
        "conditionType": "precedent" | "subsequent",
        "description": "Court approval of settlement",
        "deadline": { "value": "2024-02-01", "verbatim": "...", "page": 12, "confidence": 95 },
        "consequenceIfNotMet": "Agreement void",
        "responsibleParty": "Both parties jointly",
        "verbatim": "...",
        "page": 12,
        "confidence": 95
      }
    ],
    
    "defaultProvisions": {
      "defaultEvents": [
        "Failure to make timely payment",
        "Breach of confidentiality"
      ],
      "remedies": [
        {
          "remedy": "Acceleration of remaining payments",
          "conditions": "10-day cure period",
          "verbatim": "...",
          "page": 13,
          "confidence": 90
        }
      ],
      "curePeriod": "10 days written notice"
    },
    
    "disputeResolution": {
      "method": "arbitration" | "mediation" | "litigation" | "other",
      "administrator": "JAMS",
      "location": "San Francisco, CA",
      "governingLaw": "California law",
      "feesAllocation": "Prevailing party",
      "verbatim": "...",
      "page": 14,
      "confidence": 90
    },
    
    "representations": [
      {
        "party": "Plaintiff",
        "representation": "Authority to enter into agreement",
        "verbatim": "...",
        "page": 15,
        "confidence": 95
      },
      {
        "party": "Defendant",
        "representation": "No bankruptcy proceedings pending",
        "verbatim": "...",
        "page": 15,
        "confidence": 95
      }
    ],
    
    "miscellaneous": {
      "governingLaw": "California",
      "entireAgreement": true,
      "amendments": "Must be in writing and signed by both parties",
      "severability": true,
      "counterparts": true,
      "verbatim": "...",
      "page": 16,
      "confidence": 85
    }
  },
  "metadata": {
    "extractionDate": "2024-01-15T10:30:00Z",
    "documentType": "${documentType}",
    "documentCategory": "Settlement",
    "totalPages": 18,
    "extractedFields": 15
  }
}

## CRITICAL EXTRACTION RULES:

1. **MANDATORY FIELDS** (Always extract):
   - caseInfo (case number, parties, jurisdiction)
   - settlementType
   - parties (settling and non-settling)
   - Primary consideration (monetary and/or non-monetary terms)

2. **SETTLEMENT-SPECIFIC FOCUS**:
   - Monetary terms: Total amount, breakdown, payment schedule
   - Release: Scope, released parties, reserved claims
   - Confidentiality: Scope, exceptions, remedies
   - Dismissal: With/without prejudice, retained jurisdiction
   - Conditions: Precedent, subsequent, deadlines

3. **PAYMENT TERMS PRECISION**:
   - Exact amounts with currency
   - Detailed payment schedule with dates
   - Payment method and account details
   - Default and acceleration provisions

4. **RELEASE SCOPE**:
   - Who is releasing (releasingParty)
   - Who is being released (releasedParties)
   - What claims are released (claimsReleased)
   - What claims are reserved (reservedClaims)
   - Time period covered

5. **CONFIDENTIALITY**:
   - What is confidential
   - Exceptions (required disclosures)
   - Duration of confidentiality
   - Remedies for breach

6. **CONFIDENCE SCORING**:
   - 100%: Exact explicit amounts/dates/terms
   - 90-95%: Clear contract language
   - 80-89%: Reasonable interpretations
   - <80%: Ambiguous or incomplete

7. **VERBATIM QUOTES**:
   - Always include exact quotes for key terms
   - Include page numbers for all extractions
   - Use "..." to indicate omitted text

## Document to Extract:

${documentText.substring(0, 12000)}

## OUTPUT:
Return ONLY valid JSON. No explanations. No markdown. No additional text.
`;

    return buildCompletePrompt(categoryInstructions);
  }

  protected validateCategoryData(data: SettlementData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required settlement-specific fields
    if (!data.settlementSpecific) {
      errors.push('Missing settlementSpecific object');
      return { isValid: false, errors };
    }

    // Validate settlementType
    if (!data.settlementSpecific.settlementType) {
      errors.push('Missing settlementType');
    } else {
      const validTypes = [
        'full_settlement',
        'partial_settlement',
        'demand',
        'offer',
        'counteroffer',
        'stipulation_dismissal'
      ];
      if (!validTypes.includes(data.settlementSpecific.settlementType)) {
        errors.push(`Invalid settlementType: ${data.settlementSpecific.settlementType}`);
      }
    }

    // Validate parties
    if (!data.settlementSpecific.parties?.settlingParties || 
        data.settlementSpecific.parties.settlingParties.length === 0) {
      errors.push('Missing settling parties - at least one settling party required');
    }

    // Validate at least one of: monetary terms, non-monetary terms, release provisions
    const hasConsideration = 
      (data.settlementSpecific.monetaryTerms?.totalAmount?.amount) ||
      (data.settlementSpecific.nonMonetaryTerms && data.settlementSpecific.nonMonetaryTerms.length > 0) ||
      (data.settlementSpecific.releaseProvisions);

    if (!hasConsideration) {
      errors.push('No consideration extracted - settlement must have monetary, non-monetary, or release terms');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
