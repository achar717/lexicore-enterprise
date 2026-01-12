import { BaseCategoryExtractor } from './base-extractor';
import { AppellateData } from '../types';
import { buildCompletePrompt } from '../prompts/common';

/**
 * AppellateExtractor
 * 
 * Handles extraction for 12 Appellate document types:
 * 
 * Appellate/Notices (2 types):
 * - APP-NOTICE-APPEAL, APP-NOTICE-CROSS-APPEAL
 * 
 * Appellate/Briefs (6 types):
 * - APP-BRIEF-OPENING, APP-BRIEF-ANSWER, APP-BRIEF-REPLY
 * - APP-BRIEF-AMICUS, APP-BRIEF-SUPP, APP-BRIEF-CORRECTED
 * 
 * Appellate/Motions (3 types):
 * - APP-MOT-EXTENSION, APP-MOT-STAY, APP-MOT-DISMISS
 * 
 * Appellate/Orders (4 types):
 * - APP-ORDER-AFFIRM, APP-ORDER-REVERSE, APP-ORDER-REMAND, APP-ORDER-DISMISS
 */
export class AppellateExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Appellate'
  
  supportedTypes = [
    // Appellate Briefs (6 types)
    'APP-BRIEF-OPENING', 'APP-BRIEF-REPLY', 'APP-BRIEF-ANSWER',
    'APP-BRIEF-AMICUS', 'APP-BRIEF-CROSS', 'APP-BRIEF-SUPP',
    // Appellate Orders & Opinions (4 types)
    'APP-ORDER-AFFIRM', 'APP-ORDER-REVERSE', 'APP-ORDER-REMAND',
    'APP-OPINION',
    // Appellate Other (2 types)
    'APP-NOTICE', 'APP-RECORD'
  ]

  protected getCategoryPrompt(documentText: string, documentType: string): string {
    const categoryInstructions = `
# APPELLATE DOCUMENT EXTRACTION

Extract comprehensive appellate-specific information from this document.

## Document Categories & Key Information:

### 1. NOTICES OF APPEAL
If this is notice of appeal or cross-appeal:
- Identify appellant and appellee
- Extract judgment being appealed
- Document notice date and filing date
- List issues being appealed
- Extract lower court information

### 2. APPELLATE BRIEFS
If this is opening, answer, reply, or amicus brief:
- Identify brief type and filing party
- Extract issues presented
- Document standard of review for each issue
- List procedural history
- Extract key arguments and authorities
- Identify preserved issues and objections

### 3. APPELLATE MOTIONS
If this is motion for extension, stay, or dismissal:
- Extract motion type and requesting party
- Document grounds for relief
- Identify deadlines and extensions requested
- Extract opposition arguments
- Document supporting authorities

### 4. APPELLATE ORDERS/OPINIONS
If this is court of appeals order or opinion:
- Extract disposition (affirm, reverse, remand, dismiss)
- Identify authoring judge and panel
- Document holdings and reasoning
- Extract procedural history
- List issues decided
- Identify concurring/dissenting opinions

## Required Output Structure:

{
  "caseInfo": { /* Common case info - REQUIRED */ },
  "appellateSpecific": {
    "appealInfo": {
      "appellant": { "value": "Smith Corp", "verbatim": "...", "page": 1, "confidence": 100 },
      "appellee": { "value": "Jones LLC", "verbatim": "...", "page": 1, "confidence": 100 },
      "trialCourt": { "value": "Superior Court of California", "verbatim": "...", "page": 1, "confidence": 95 },
      "trialCourtJudge": { "value": "Hon. Robert Brown", "verbatim": "...", "page": 2, "confidence": 90 },
      "trialCourtCaseNumber": { "value": "2023-CV-12345", "verbatim": "...", "page": 1, "confidence": 100 },
      "judgmentDate": { "value": "2023-12-15", "verbatim": "...", "page": 2, "confidence": 100 },
      "noticeOfAppealDate": { "value": "2024-01-10", "verbatim": "...", "page": 1, "confidence": 100 },
      "appealType": "direct" | "interlocutory" | "cross-appeal",
      "jurisdictionalBasis": { "value": "28 U.S.C. § 1291", "verbatim": "...", "page": 3, "confidence": 95 }
    },
    
    "issues": [
      {
        "issueNumber": 1,
        "issueStatement": "Whether the trial court erred in granting summary judgment",
        "standardOfReview": "de novo",
        "preserved": true,
        "preservationReference": "Motion hearing transcript p.45",
        "verbatim": "...",
        "page": 5,
        "confidence": 95
      }
    ],
    
    "proceduralHistory": [
      {
        "date": "2023-01-15",
        "event": "Complaint filed",
        "court": "Superior Court",
        "verbatim": "...",
        "page": 3,
        "confidence": 100
      },
      {
        "date": "2023-06-20",
        "event": "Motion for summary judgment granted",
        "court": "Superior Court",
        "verbatim": "...",
        "page": 3,
        "confidence": 100
      },
      {
        "date": "2023-12-15",
        "event": "Final judgment entered",
        "court": "Superior Court",
        "verbatim": "...",
        "page": 4,
        "confidence": 100
      }
    ],
    
    "arguments": [
      {
        "issueNumber": 1,
        "party": "Appellant",
        "heading": "I. The Trial Court Erred in Granting Summary Judgment",
        "summary": "Genuine issues of material fact existed regarding causation",
        "legalAuthorities": [
          {
            "citation": "Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986)",
            "relevance": "Standard for summary judgment",
            "verbatim": "...",
            "page": 10,
            "confidence": 95
          }
        ],
        "factualSupport": [
          {
            "fact": "Expert testimony conflicted on causation",
            "recordReference": "Expert Report of Dr. Smith, p.5",
            "verbatim": "...",
            "page": 12,
            "confidence": 90
          }
        ]
      }
    ],
    
    "disposition": {
      "ruling": "affirmed" | "reversed" | "remanded" | "dismissed" | "vacated" | "modified",
      "full_disposition": "Reversed and remanded for new trial",
      "ruling_date": { "value": "2024-06-15", "verbatim": "...", "page": 1, "confidence": 100 },
      "authoring_judge": { "value": "Judge Jane Williams", "verbatim": "...", "page": 1, "confidence": 100 },
      "panel": [
        {
          "judge": "Judge Jane Williams",
          "role": "author",
          "verbatim": "...",
          "page": 1,
          "confidence": 100
        },
        {
          "judge": "Judge Robert Chen",
          "role": "concurring",
          "verbatim": "...",
          "page": 1,
          "confidence": 100
        }
      ]
    },
    
    "holdings": [
      {
        "issue": "Summary judgment standard",
        "holding": "Trial court applied incorrect standard by resolving factual disputes",
        "reasoning": "Material fact disputes must be resolved by jury, not judge",
        "precedent": "Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986)",
        "verbatim": "...",
        "page": 15,
        "confidence": 95
      }
    ],
    
    "motions": [
      {
        "motionType": "extension" | "stay" | "dismiss" | "other",
        "movingParty": "Appellant",
        "relief_sought": "30-day extension to file opening brief",
        "grounds": "Complexity of record and need for additional research",
        "deadline_affected": "2024-03-15",
        "extension_requested": "30 days",
        "oppositionFiled": false,
        "ruling": "granted" | "denied" | "pending",
        "ruling_reason": "Good cause shown",
        "verbatim": "...",
        "page": 1,
        "confidence": 95
      }
    ],
    
    "recordReferences": [
      {
        "description": "Trial transcript",
        "volume": "Vol. III",
        "pages": "245-267",
        "relevance": "Expert testimony on causation",
        "verbatim": "...",
        "page": 12,
        "confidence": 90
      }
    ],
    
    "crossAppeal": {
      "exists": true,
      "crossAppellant": "Jones LLC",
      "issues": [
        "Whether damages award was excessive"
      ],
      "status": "pending"
    },
    
    "oralArgument": {
      "scheduled": true,
      "date": { "value": "2024-05-15", "verbatim": "...", "page": 2, "confidence": 100 },
      "location": "Court of Appeals, Courtroom 3",
      "timeAllotted": "15 minutes per side"
    }
  },
  "metadata": {
    "extractionDate": "2024-01-15T10:30:00Z",
    "documentType": "${documentType}",
    "documentCategory": "Appellate",
    "totalPages": 45,
    "extractedFields": 12
  }
}

## CRITICAL EXTRACTION RULES:

1. **MANDATORY FIELDS** (Always extract):
   - caseInfo (case number, parties, jurisdiction)
   - appealInfo (appellant, appellee, trial court info)
   - issues (what's being appealed)
   - Document-specific primary data

2. **APPELLATE-SPECIFIC FOCUS**:
   - Issues: Statement, standard of review, preservation
   - Procedural history: Complete timeline from trial to appeal
   - Arguments: Link to issues, cite authorities and record
   - Disposition: Ruling, reasoning, holdings
   - Standard of review for EACH issue

3. **STANDARD OF REVIEW**:
   - Common standards: de novo, abuse of discretion, substantial evidence, clear error
   - Extract for EACH issue presented
   - Include verbatim quote and page reference

4. **RECORD REFERENCES**:
   - Always extract citations to trial record
   - Include volume, page numbers, exhibit numbers
   - Link to specific arguments or issues

5. **PRESERVATION**:
   - Document whether issues were preserved at trial
   - Extract objections or motions that preserved issues
   - Note waiver or forfeiture of issues

6. **CONFIDENCE SCORING**:
   - 100%: Exact explicit statements
   - 90-95%: Clear implications from context
   - 80-89%: Reasonable inferences
   - <80%: Uncertain or incomplete

7. **VERBATIM QUOTES**:
   - Always include exact quotes for key facts
   - Include page numbers for all extractions
   - Use "..." to indicate omitted text

## Document to Extract:

${documentText.substring(0, 12000)}

## OUTPUT:
Return ONLY valid JSON. No explanations. No markdown. No additional text.
`;

    return buildCompletePrompt(categoryInstructions);
  }

  protected validateCategoryData(data: AppellateData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required appellate-specific fields
    if (!data.appellateSpecific) {
      errors.push('Missing appellateSpecific object');
      return { isValid: false, errors };
    }

    // Validate appealInfo is present
    if (!data.appellateSpecific.appealInfo) {
      errors.push('Missing appealInfo object');
    } else {
      // Validate key appeal info fields
      if (!data.appellateSpecific.appealInfo.appellant?.value) {
        errors.push('Missing appellant');
      }
      if (!data.appellateSpecific.appealInfo.appellee?.value) {
        errors.push('Missing appellee');
      }
    }

    // Validate at least one of: issues, arguments, disposition, motions
    const hasAppellateData = 
      (data.appellateSpecific.issues && data.appellateSpecific.issues.length > 0) ||
      (data.appellateSpecific.arguments && data.appellateSpecific.arguments.length > 0) ||
      (data.appellateSpecific.disposition) ||
      (data.appellateSpecific.motions && data.appellateSpecific.motions.length > 0);

    if (!hasAppellateData) {
      errors.push('No substantive appellate data extracted - at least one of: issues, arguments, disposition, or motions required');
    }

    // Validate disposition ruling if present
    if (data.appellateSpecific.disposition?.ruling) {
      const validRulings = ['affirmed', 'reversed', 'remanded', 'dismissed', 'vacated', 'modified'];
      if (!validRulings.includes(data.appellateSpecific.disposition.ruling)) {
        errors.push(`Invalid disposition ruling: ${data.appellateSpecific.disposition.ruling}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
