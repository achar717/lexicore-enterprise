/**
 * LexiCore™ - Conflict Detection Service
 * 
 * PURPOSE:
 * Detect and analyze conflicts between clauses in draft documents.
 * Identifies six types of conflicts:
 * 1. Logical - Contradictory obligations or rights
 * 2. Temporal - Conflicting timelines or deadlines
 * 3. Jurisdictional - Incompatible legal frameworks
 * 4. Definitional - Conflicting term definitions
 * 5. Numerical - Inconsistent amounts or percentages
 * 6. Scope - Overlapping or contradictory scopes
 * 
 * SEVERITY LEVELS:
 * - Critical: Makes contract unenforceable or creates legal liability
 * - High: Creates significant legal risk or ambiguity
 * - Medium: May cause disputes or require clarification
 * - Low: Minor inconsistencies, unlikely to cause issues
 * 
 * LEGAL COMPLIANCE:
 * Advisory tool only. NOT legal advice. Attorney review required.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface ConflictDetectionRequest {
  draftId: string
  documentType: string
  jurisdiction: string
  clauses: Array<{
    clause_id: string
    clause_title: string
    clause_text: string
    category?: string
    position?: number
  }>
}

export interface DocumentConflict {
  conflict_id: string
  conflict_type: 'logical' | 'temporal' | 'jurisdictional' | 'definitional' | 'numerical' | 'scope'
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  confidence: number
  
  // Involved Clauses
  clause_id_1: string
  clause_title_1: string
  clause_id_2: string
  clause_title_2: string
  
  // Conflict Description
  conflict_description: string
  specific_text_1?: string
  specific_text_2?: string
  
  // Resolution
  suggested_resolution: string
  alternative_clause_id?: string
  legal_impact: string
  
  // Metadata
  resolution_status: 'open' | 'acknowledged' | 'resolved' | 'waived'
}

export class ConflictDetectionService {
  constructor(private db: D1Database) {}

  /**
   * Detect all conflicts in a draft document
   */
  async detectConflicts(request: ConflictDetectionRequest): Promise<DocumentConflict[]> {
    const conflicts: DocumentConflict[] = []
    const { clauses } = request
    
    // Compare each pair of clauses
    for (let i = 0; i < clauses.length; i++) {
      for (let j = i + 1; j < clauses.length; j++) {
        const clause1 = clauses[i]
        const clause2 = clauses[j]
        
        // Run all conflict detection algorithms
        const detected = await this.detectConflictsBetweenClauses(
          clause1,
          clause2,
          request
        )
        
        conflicts.push(...detected)
      }
    }
    
    // Sort by severity (Critical > High > Medium > Low)
    return this.sortBySeverity(conflicts)
  }

  /**
   * Detect conflicts between two specific clauses
   */
  private async detectConflictsBetweenClauses(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): Promise<DocumentConflict[]> {
    const conflicts: DocumentConflict[] = []
    
    // 1. Logical conflicts
    const logical = this.detectLogicalConflicts(clause1, clause2, request)
    if (logical) conflicts.push(logical)
    
    // 2. Temporal conflicts
    const temporal = this.detectTemporalConflicts(clause1, clause2, request)
    if (temporal) conflicts.push(temporal)
    
    // 3. Jurisdictional conflicts
    const jurisdictional = this.detectJurisdictionalConflicts(clause1, clause2, request)
    if (jurisdictional) conflicts.push(jurisdictional)
    
    // 4. Definitional conflicts
    const definitional = this.detectDefinitionalConflicts(clause1, clause2, request)
    if (definitional) conflicts.push(definitional)
    
    // 5. Numerical conflicts
    const numerical = this.detectNumericalConflicts(clause1, clause2, request)
    if (numerical) conflicts.push(numerical)
    
    // 6. Scope conflicts
    const scope = this.detectScopeConflicts(clause1, clause2, request)
    if (scope) conflicts.push(scope)
    
    return conflicts
  }

  /**
   * Detect logical conflicts (contradictory obligations)
   */
  private detectLogicalConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Check for explicit contradictions
    const contradictions = [
      { pattern1: ['prohibit', 'shall not', 'may not', 'forbidden'], pattern2: ['must', 'shall', 'required', 'obligated'], type: 'prohibition_vs_obligation' },
      { pattern1: ['exclusive', 'solely', 'only'], pattern2: ['non-exclusive', 'share', 'jointly'], type: 'exclusivity_conflict' },
      { pattern1: ['confidential', 'secret', 'proprietary'], pattern2: ['public', 'disclose', 'share'], type: 'confidentiality_conflict' },
      { pattern1: ['irrevocable', 'permanent', 'perpetual'], pattern2: ['terminate', 'cancel', 'revoke'], type: 'irrevocability_conflict' }
    ]
    
    for (const contradiction of contradictions) {
      const has1 = contradiction.pattern1.some(p => text1.includes(p))
      const has2 = contradiction.pattern2.some(p => text2.includes(p))
      
      if (has1 && has2) {
        return this.createConflict({
          clause1,
          clause2,
          request,
          type: 'logical',
          severity: 'High',
          confidence: 0.75,
          description: this.getLogicalConflictDescription(contradiction.type),
          resolution: this.getLogicalConflictResolution(contradiction.type),
          legalImpact: 'May render contract unenforceable due to internal contradiction'
        })
      }
    }
    
    return null
  }

  /**
   * Detect temporal conflicts (timeline inconsistencies)
   */
  private detectTemporalConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Extract time periods
    const periods1 = this.extractTimePeriods(text1)
    const periods2 = this.extractTimePeriods(text2)
    
    // Check for conflicting deadlines
    if (periods1.length > 0 && periods2.length > 0) {
      // Simple heuristic: look for term/termination conflicts
      const isTerm1 = clause1.category?.toLowerCase().includes('term')
      const isTerm2 = clause2.category?.toLowerCase().includes('term')
      
      if (isTerm1 || isTerm2) {
        // Check if periods don't align
        const conflict = periods1.some(p1 => 
          periods2.some(p2 => p1.value !== p2.value && p1.unit === p2.unit)
        )
        
        if (conflict) {
          return this.createConflict({
            clause1,
            clause2,
            request,
            type: 'temporal',
            severity: 'Medium',
            confidence: 0.65,
            description: 'Inconsistent time periods specified',
            resolution: 'Clarify which time period applies or reconcile the difference',
            legalImpact: 'May cause disputes over contract duration or deadlines'
          })
        }
      }
    }
    
    return null
  }

  /**
   * Detect jurisdictional conflicts
   */
  private detectJurisdictionalConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Extract jurisdiction mentions
    const jurisdictions1 = this.extractJurisdictions(text1)
    const jurisdictions2 = this.extractJurisdictions(text2)
    
    if (jurisdictions1.length > 0 && jurisdictions2.length > 0) {
      // Check if different jurisdictions mentioned
      const hasDifferent = jurisdictions1.some(j1 => 
        jurisdictions2.some(j2 => j1 !== j2)
      )
      
      if (hasDifferent) {
        return this.createConflict({
          clause1,
          clause2,
          request,
          type: 'jurisdictional',
          severity: 'High',
          confidence: 0.80,
          description: `Conflicting jurisdictions: ${jurisdictions1.join(', ')} vs ${jurisdictions2.join(', ')}`,
          resolution: 'Select one governing jurisdiction and ensure all clauses reference it consistently',
          legalImpact: 'Creates ambiguity about which laws govern the contract'
        })
      }
    }
    
    return null
  }

  /**
   * Detect definitional conflicts
   */
  private detectDefinitionalConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Look for definition patterns
    const def1 = this.extractDefinitions(text1)
    const def2 = this.extractDefinitions(text2)
    
    // Check for same term defined differently
    for (const term1 of def1) {
      for (const term2 of def2) {
        if (term1.term === term2.term && term1.definition !== term2.definition) {
          return this.createConflict({
            clause1,
            clause2,
            request,
            type: 'definitional',
            severity: 'Medium',
            confidence: 0.70,
            description: `Term "${term1.term}" defined inconsistently`,
            resolution: 'Use a single definition in a definitions section',
            legalImpact: 'Ambiguity may affect interpretation of contract terms'
          })
        }
      }
    }
    
    return null
  }

  /**
   * Detect numerical conflicts
   */
  private detectNumericalConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Extract monetary amounts
    const amounts1 = this.extractMonetaryAmounts(text1)
    const amounts2 = this.extractMonetaryAmounts(text2)
    
    // Check for payment/compensation conflicts
    const isPayment1 = clause1.category?.toLowerCase().includes('payment') || 
                        clause1.category?.toLowerCase().includes('compensation')
    const isPayment2 = clause2.category?.toLowerCase().includes('payment') || 
                        clause2.category?.toLowerCase().includes('compensation')
    
    if ((isPayment1 || isPayment2) && amounts1.length > 0 && amounts2.length > 0) {
      // Check if amounts differ significantly
      const hasDifference = amounts1.some(a1 => 
        amounts2.some(a2 => Math.abs(a1 - a2) / Math.max(a1, a2) > 0.1)
      )
      
      if (hasDifference) {
        return this.createConflict({
          clause1,
          clause2,
          request,
          type: 'numerical',
          severity: 'High',
          confidence: 0.75,
          description: 'Inconsistent payment amounts specified',
          resolution: 'Clarify which amount is correct or explain the difference',
          legalImpact: 'May cause payment disputes'
        })
      }
    }
    
    return null
  }

  /**
   * Detect scope conflicts
   */
  private detectScopeConflicts(
    clause1: any,
    clause2: any,
    request: ConflictDetectionRequest
  ): DocumentConflict | null {
    const text1 = clause1.clause_text?.toLowerCase() || ''
    const text2 = clause2.clause_text?.toLowerCase() || ''
    
    // Check for overlapping scopes
    const scopeKeywords = ['all', 'any', 'entire', 'whole', 'complete', 'total']
    const limitKeywords = ['except', 'excluding', 'but not', 'other than']
    
    const hasFullScope1 = scopeKeywords.some(k => text1.includes(k))
    const hasFullScope2 = scopeKeywords.some(k => text2.includes(k))
    const hasLimit1 = limitKeywords.some(k => text1.includes(k))
    const hasLimit2 = limitKeywords.some(k => text2.includes(k))
    
    if ((hasFullScope1 && hasLimit2) || (hasFullScope2 && hasLimit1)) {
      return this.createConflict({
        clause1,
        clause2,
        request,
        type: 'scope',
        severity: 'Low',
        confidence: 0.50,
        description: 'Potentially overlapping or contradictory scopes',
        resolution: 'Clarify the relationship between these provisions',
        legalImpact: 'May create ambiguity about scope of obligations'
      })
    }
    
    return null
  }

  /**
   * Create conflict object
   */
  private createConflict(params: {
    clause1: any
    clause2: any
    request: ConflictDetectionRequest
    type: DocumentConflict['conflict_type']
    severity: DocumentConflict['severity']
    confidence: number
    description: string
    resolution: string
    legalImpact: string
  }): DocumentConflict {
    const { clause1, clause2, request, type, severity, confidence, description, resolution, legalImpact } = params
    
    return {
      conflict_id: `conflict-${request.draftId}-${clause1.clause_id}-${clause2.clause_id}`,
      conflict_type: type,
      severity,
      confidence,
      clause_id_1: clause1.clause_id,
      clause_title_1: clause1.clause_title,
      clause_id_2: clause2.clause_id,
      clause_title_2: clause2.clause_title,
      conflict_description: description,
      suggested_resolution: resolution,
      legal_impact: legalImpact,
      resolution_status: 'open'
    }
  }

  /**
   * Sort conflicts by severity
   */
  private sortBySeverity(conflicts: DocumentConflict[]): DocumentConflict[] {
    const severityOrder = { Critical: 4, High: 3, Medium: 2, Low: 1 }
    return conflicts.sort((a, b) => 
      severityOrder[b.severity] - severityOrder[a.severity]
    )
  }

  /**
   * Extract time periods from text
   */
  private extractTimePeriods(text: string): Array<{ value: number; unit: string }> {
    const periods: Array<{ value: number; unit: string }> = []
    const regex = /(\d+)\s*(day|week|month|year)s?/gi
    let match
    
    while ((match = regex.exec(text)) !== null) {
      periods.push({
        value: parseInt(match[1]),
        unit: match[2].toLowerCase()
      })
    }
    
    return periods
  }

  /**
   * Extract jurisdictions from text
   */
  private extractJurisdictions(text: string): string[] {
    const jurisdictions: string[] = []
    
    // US States
    const states = ['california', 'new york', 'texas', 'florida', 'illinois', 'pennsylvania']
    states.forEach(state => {
      if (text.includes(state)) jurisdictions.push(state)
    })
    
    // Common phrases
    if (text.includes('federal')) jurisdictions.push('federal')
    if (text.includes('state of')) {
      const match = text.match(/state of (\w+)/)
      if (match) jurisdictions.push(match[1])
    }
    
    return [...new Set(jurisdictions)]
  }

  /**
   * Extract definitions from text
   */
  private extractDefinitions(text: string): Array<{ term: string; definition: string }> {
    const definitions: Array<{ term: string; definition: string }> = []
    
    // Pattern: "Term" means ...
    const regex = /"([^"]+)"\s+means\s+([^.]+)/gi
    let match
    
    while ((match = regex.exec(text)) !== null) {
      definitions.push({
        term: match[1].toLowerCase(),
        definition: match[2]
      })
    }
    
    return definitions
  }

  /**
   * Extract monetary amounts from text
   */
  private extractMonetaryAmounts(text: string): number[] {
    const amounts: number[] = []
    const regex = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g
    let match
    
    while ((match = regex.exec(text)) !== null) {
      const amount = parseFloat(match[1].replace(/,/g, ''))
      amounts.push(amount)
    }
    
    return amounts
  }

  /**
   * Get logical conflict description
   */
  private getLogicalConflictDescription(type: string): string {
    const descriptions: Record<string, string> = {
      prohibition_vs_obligation: 'One clause prohibits an action while another requires it',
      exclusivity_conflict: 'Conflicting exclusivity provisions',
      confidentiality_conflict: 'One clause requires confidentiality while another allows disclosure',
      irrevocability_conflict: 'One clause states irrevocability while another allows termination'
    }
    return descriptions[type] || 'Logical contradiction detected between clauses'
  }

  /**
   * Get logical conflict resolution
   */
  private getLogicalConflictResolution(type: string): string {
    const resolutions: Record<string, string> = {
      prohibition_vs_obligation: 'Remove contradiction by clarifying which provision applies',
      exclusivity_conflict: 'Clarify exclusivity terms or remove conflicting provision',
      confidentiality_conflict: 'Add exception for permitted disclosures',
      irrevocability_conflict: 'Clarify termination rights or remove contradictory language'
    }
    return resolutions[type] || 'Revise one or both clauses to remove contradiction'
  }

  /**
   * Save conflict to database
   */
  async saveConflict(
    draftId: string,
    conflict: DocumentConflict
  ): Promise<string> {
    const conflictId = conflict.conflict_id || `conflict-${draftId}-${Date.now()}`
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT INTO document_conflicts (
        id, draft_id, conflict_type, severity, confidence,
        clause_id_1, clause_title_1, clause_id_2, clause_title_2,
        conflict_description, suggested_resolution, legal_impact,
        resolution_status, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      conflictId, draftId, conflict.conflict_type, conflict.severity, conflict.confidence,
      conflict.clause_id_1, conflict.clause_title_1,
      conflict.clause_id_2, conflict.clause_title_2,
      conflict.conflict_description, conflict.suggested_resolution, conflict.legal_impact,
      conflict.resolution_status, timestamp
    ).run()
    
    return conflictId
  }

  /**
   * Get conflicts for a draft
   */
  async getConflicts(draftId: string): Promise<DocumentConflict[]> {
    const result = await this.db.prepare(`
      SELECT 
        id as conflict_id,
        conflict_type,
        severity,
        confidence,
        clause_id_1,
        clause_title_1,
        clause_id_2,
        clause_title_2,
        conflict_description,
        suggested_resolution,
        legal_impact,
        resolution_status
      FROM document_conflicts
      WHERE draft_id = ?
      ORDER BY 
        CASE severity
          WHEN 'Critical' THEN 4
          WHEN 'High' THEN 3
          WHEN 'Medium' THEN 2
          WHEN 'Low' THEN 1
        END DESC,
        detected_at DESC
    `).bind(draftId).all()
    
    return (result.results as DocumentConflict[]) || []
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(
    conflictId: string,
    resolutionMethod: string,
    resolutionNotes: string,
    resolvedBy: string
  ): Promise<void> {
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      UPDATE document_conflicts
      SET 
        resolution_status = 'resolved',
        resolution_method = ?,
        resolution_notes = ?,
        resolved_by = ?,
        resolved_at = ?
      WHERE id = ?
    `).bind(resolutionMethod, resolutionNotes, resolvedBy, timestamp, conflictId).run()
  }
}
