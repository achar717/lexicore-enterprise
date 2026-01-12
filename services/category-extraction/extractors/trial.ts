import { BaseCategoryExtractor } from './base-extractor';
import { TrialData } from '../types';
import { buildCompletePrompt } from '../prompts/common';

/**
 * TrialExtractor
 * 
 * Handles extraction for 34 Trial document types:
 * 
 * Trial/Jury Materials (9 types):
 * - TRIAL-JURY-INST-PROPOSED, TRIAL-JURY-INST-GIVEN, TRIAL-JURY-INST-OBJ
 * - TRIAL-JURY-VERDICT, TRIAL-JURY-SPECIAL, TRIAL-JURY-POLL
 * - TRIAL-VOIR-DIRE-Q, TRIAL-JURY-SELECTION, TRIAL-JURY-LIST
 * 
 * Trial/Evidence (12 types):
 * - TRIAL-EV-EXLIST, TRIAL-EV-LIST-PROPOSED, TRIAL-EV-OBJ
 * - TRIAL-EV-RULING, TRIAL-EV-PRETRIAL-ORDER, TRIAL-EV-SEALED
 * - TRIAL-EV-DEMONSTRATIVE, TRIAL-EV-FOUNDATION
 * - TRIAL-DEPO-DESIGNATION, TRIAL-DEPO-COUNTER, TRIAL-DEPO-OBJ
 * - TRIAL-EV-LOG
 * 
 * Trial/Motions (4 types):
 * - TRIAL-MOT-LIMINE, TRIAL-MOT-LIMINE-OPP, TRIAL-MOT-LIMINE-REPLY
 * - TRIAL-MOT-MISTRIAL
 * 
 * Trial/Orders (5 types):
 * - TRIAL-ORDER-PRE, TRIAL-ORDER-CONF, TRIAL-ORDER-RULING
 * - TRIAL-ORDER-JNOV, TRIAL-ORDER-NEWTRIAL
 * 
 * Trial/Other (4 types):
 * - TRIAL-BRIEF, TRIAL-OPENING, TRIAL-CLOSING, TRIAL-TRANSCRIPT
 */
export class TrialExtractor extends BaseCategoryExtractor {
  category: DocumentCategory = 'Trial'
  
  supportedTypes = [
    // Trial/Jury Materials (9 types)
    'TRIAL-JURY-INST-PROPOSED', 'TRIAL-JURY-INST-GIVEN', 'TRIAL-JURY-INST-OBJ',
    'TRIAL-JURY-VERDICT', 'TRIAL-JURY-SPECIAL', 'TRIAL-JURY-POLL',
    'TRIAL-VOIR-DIRE-Q', 'TRIAL-JURY-SELECTION', 'TRIAL-JURY-LIST',
    // Trial/Evidence (12 types)
    'TRIAL-EV-EXLIST', 'TRIAL-EV-LIST-PROPOSED', 'TRIAL-EV-OBJ',
    'TRIAL-EV-RULING', 'TRIAL-EV-PRETRIAL-ORDER', 'TRIAL-EV-SEALED',
    'TRIAL-EV-DEMONSTRATIVE', 'TRIAL-EV-FOUNDATION',
    'TRIAL-DEPO-DESIGNATION', 'TRIAL-DEPO-COUNTER', 'TRIAL-DEPO-OBJ',
    'TRIAL-EV-LOG',
    // Trial/Motions (4 types)
    'TRIAL-MOT-LIMINE', 'TRIAL-MOT-LIMINE-OPP', 'TRIAL-MOT-LIMINE-REPLY',
    'TRIAL-MOT-MISTRIAL',
    // Trial/Orders (5 types)
    'TRIAL-ORDER-PRE', 'TRIAL-ORDER-CONF', 'TRIAL-ORDER-RULING',
    'TRIAL-ORDER-JNOV', 'TRIAL-ORDER-NEWTRIAL',
    // Trial/Other (4 types)
    'TRIAL-BRIEF', 'TRIAL-OPENING', 'TRIAL-CLOSING', 'TRIAL-TRANSCRIPT'
  ]

  protected getCategoryPrompt(documentText: string, documentType: string): string {
    const categoryInstructions = `
# TRIAL DOCUMENT EXTRACTION

Extract comprehensive trial-specific information from this document.

## Document Categories & Key Information:

### 1. JURY MATERIALS
If this is jury instructions, verdict, voir dire, or jury selection:
- Extract jury instructions (proposed/given/objected)
- Identify verdict type (general, special) and findings
- Document voir dire questions and responses
- List jury panel members and selection results
- Extract jury polling results

### 2. EVIDENCE
If this is exhibits, evidence lists, or evidence rulings:
- List all exhibits (number, description, offered by, status)
- Document evidence objections and grounds
- Extract evidentiary rulings and reasoning
- Identify demonstrative evidence
- Track deposition designations and counter-designations

### 3. TRIAL MOTIONS
If this is motion in limine or motion for mistrial:
- Identify motion type and requesting party
- Extract legal arguments and authorities
- Document evidence sought to exclude/include
- List grounds for mistrial (if applicable)
- Extract court's ruling and reasoning

### 4. TRIAL ORDERS
If this is pretrial order, conference order, or trial ruling:
- Extract order type and issuing judge
- Identify trial schedule and deadlines
- Document evidentiary rulings
- List trial limitations and procedures
- Extract post-trial rulings (JNOV, new trial)

### 5. TRIAL BRIEFS & ARGUMENTS
If this is trial brief, opening, or closing:
- Identify brief type (pretrial, opening, closing)
- Extract legal theories and arguments
- List evidence to be presented
- Document factual contentions
- Extract legal authorities cited

## Required Output Structure:

{
  "caseInfo": { /* Common case info - REQUIRED */ },
  "trialSpecific": {
    "trialType": "jury_trial" | "bench_trial" | "evidentiary_hearing",
    "trialDate": { "value": "2024-01-15", "verbatim": "...", "page": 1, "confidence": 95 },
    "judge": { "value": "Hon. Jane Smith", "verbatim": "...", "page": 1, "confidence": 100 },
    
    "juryInstructions": [
      {
        "instructionNumber": "1",
        "instructionType": "proposed" | "given" | "refused",
        "title": "Burden of Proof",
        "text": "...",
        "requestedBy": "Plaintiff",
        "status": "given",
        "verbatim": "...",
        "page": 5,
        "confidence": 95
      }
    ],
    
    "verdict": {
      "verdictType": "general" | "special",
      "findings": [
        {
          "question": "Was defendant negligent?",
          "answer": "Yes",
          "unanimity": "unanimous",
          "verbatim": "...",
          "page": 10,
          "confidence": 100
        }
      ],
      "damages": {
        "compensatory": 500000,
        "punitive": 0,
        "verbatim": "...",
        "page": 11,
        "confidence": 100
      }
    },
    
    "exhibits": [
      {
        "exhibitNumber": "Plaintiff's Exhibit 1",
        "description": "Email dated 2023-01-15",
        "offeredBy": "Plaintiff",
        "objectedBy": "Defendant",
        "objectionGrounds": "Hearsay",
        "ruling": "admitted" | "excluded" | "pending",
        "rulingReason": "Business records exception",
        "verbatim": "...",
        "page": 3,
        "confidence": 95
      }
    ],
    
    "motionsInLimine": [
      {
        "motionNumber": "Motion #1",
        "movingParty": "Defendant",
        "purpose": "Exclude prior bad acts evidence",
        "legalBasis": "FRE 404(b)",
        "evidenceTarget": "2019 incident",
        "ruling": "granted" | "denied" | "deferred",
        "rulingReason": "...",
        "verbatim": "...",
        "page": 1,
        "confidence": 90
      }
    ],
    
    "trialSchedule": {
      "trialStartDate": { "value": "2024-03-01", "verbatim": "...", "page": 2, "confidence": 100 },
      "estimatedDuration": "5 days",
      "phases": [
        {
          "phase": "jury_selection",
          "startDate": "2024-03-01",
          "duration": "1 day",
          "verbatim": "...",
          "page": 2,
          "confidence": 95
        }
      ]
    },
    
    "depositionDesignations": [
      {
        "deponent": "John Smith",
        "designatingParty": "Plaintiff",
        "counterDesignatingParty": "Defendant",
        "pages": "45:10-48:5",
        "purpose": "liability",
        "objections": "hearsay, relevance",
        "verbatim": "...",
        "page": 1,
        "confidence": 90
      }
    ],
    
    "voir_dire": {
      "questions": [
        {
          "questionNumber": 1,
          "askedBy": "Plaintiff's counsel",
          "question": "Have you ever served on a jury before?",
          "purpose": "experience",
          "verbatim": "...",
          "page": 5,
          "confidence": 95
        }
      ],
      "juryPanel": [
        {
          "panelNumber": 1,
          "name": "Jane Doe",
          "status": "selected" | "challenged" | "excused",
          "challengeType": "peremptory" | "for_cause" | null,
          "reason": "...",
          "verbatim": "...",
          "page": 10,
          "confidence": 90
        }
      ]
    },
    
    "openingStatement": {
      "party": "Plaintiff",
      "keyPoints": [
        {
          "point": "Defendant breached contract",
          "evidence": "Exhibit 1",
          "verbatim": "...",
          "page": 3,
          "confidence": 95
        }
      ],
      "legalTheory": "Breach of contract with damages",
      "damages_requested": 500000
    },
    
    "closingArgument": {
      "party": "Defendant",
      "keyPoints": [
        {
          "point": "Plaintiff failed to prove causation",
          "evidence": "Expert testimony",
          "verbatim": "...",
          "page": 15,
          "confidence": 95
        }
      ],
      "requested_verdict": "Defense verdict"
    },
    
    "postTrialMotions": [
      {
        "motionType": "JNOV" | "new_trial" | "remittitur" | "additur",
        "movingParty": "Defendant",
        "grounds": "Insufficient evidence",
        "ruling": "denied",
        "rulingReason": "Sufficient evidence for jury verdict",
        "verbatim": "...",
        "page": 20,
        "confidence": 95
      }
    ]
  },
  "metadata": {
    "extractionDate": "2024-01-15T10:30:00Z",
    "documentType": "${documentType}",
    "documentCategory": "Trial",
    "totalPages": 25,
    "extractedFields": 15
  }
}

## CRITICAL EXTRACTION RULES:

1. **MANDATORY FIELDS** (Always extract):
   - caseInfo (case number, parties, jurisdiction)
   - trialType, judge, trialDate (if available)
   - Document-specific primary data (exhibits, instructions, motions, etc.)

2. **TRIAL-SPECIFIC FOCUS**:
   - Jury instructions: Number, type, status, requesting party
   - Exhibits: Number, description, objections, rulings
   - Motions in limine: Target evidence, legal basis, ruling
   - Verdict: Findings, damages, unanimity
   - Schedule: Start date, phases, deadlines

3. **CONFIDENCE SCORING**:
   - 100%: Exact explicit statements
   - 90-95%: Clear implications from context
   - 80-89%: Reasonable inferences
   - <80%: Uncertain or incomplete

4. **VERBATIM QUOTES**:
   - Always include exact quotes for key facts
   - Include page numbers for all extractions
   - Use "..." to indicate omitted text

5. **NULL HANDLING**:
   - Return empty arrays [] for missing lists
   - Return null for missing single values
   - Include confidence: 0 for null values

## Document to Extract:

${documentText.substring(0, 12000)}

## OUTPUT:
Return ONLY valid JSON. No explanations. No markdown. No additional text.
`;

    return buildCompletePrompt(categoryInstructions);
  }

  protected validateCategoryData(data: TrialData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required trial-specific fields
    if (!data.trialSpecific) {
      errors.push('Missing trialSpecific object');
      return { isValid: false, errors };
    }

    // Validate at least one trial-related field is present
    const hasTrialData = 
      (data.trialSpecific.juryInstructions && data.trialSpecific.juryInstructions.length > 0) ||
      (data.trialSpecific.exhibits && data.trialSpecific.exhibits.length > 0) ||
      (data.trialSpecific.motionsInLimine && data.trialSpecific.motionsInLimine.length > 0) ||
      (data.trialSpecific.verdict) ||
      (data.trialSpecific.trialSchedule) ||
      (data.trialSpecific.openingStatement) ||
      (data.trialSpecific.closingArgument);

    if (!hasTrialData) {
      errors.push('No trial-specific data extracted - at least one trial field required');
    }

    // Validate trial type if present
    if (data.trialSpecific.trialType) {
      const validTrialTypes = ['jury_trial', 'bench_trial', 'evidentiary_hearing'];
      if (!validTrialTypes.includes(data.trialSpecific.trialType)) {
        errors.push(`Invalid trialType: ${data.trialSpecific.trialType}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
