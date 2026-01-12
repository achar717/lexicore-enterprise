// LexiCore™ - Contract Comparison Service
// Advanced document versioning and comparison for assembled contracts
// © 2024 LexiCore™. All rights reserved.

import { DuplicateDetectionService } from './duplicate-detection'

export interface ContractVersion {
  id: string
  document_id: string
  version_number: number
  version_label: string
  document_title: string
  document_type: string
  party_1_name: string
  party_2_name: string
  effective_date: string
  variable_values: string // JSON
  total_clauses: number
  clause_selections: string // JSON
  is_current: boolean
  change_summary?: string
  change_notes?: string
  compared_from_version_id?: string
  created_by: string
  created_at: string
}

export interface ClauseChange {
  id: string
  comparison_id: string
  change_type: 'clause_added' | 'clause_removed' | 'clause_modified' | 'clause_reordered' | 'section_renamed'
  clause_id?: string
  section_name?: string
  clause_order?: number
  old_value?: string
  new_value?: string
  diff_html?: string
  risk_level?: 'critical' | 'high' | 'medium' | 'low'
  risk_reason?: string
  status: 'pending' | 'accepted' | 'rejected' | 'requires_review'
  acceptance_notes?: string
  created_at: string
  reviewed_by?: string
  reviewed_at?: string
}

export interface ContractComparison {
  id: string
  document_id: string
  version_a_id: string
  version_b_id: string
  comparison_type: 'version_to_version' | 'template_to_draft' | 'draft_to_executed'
  similarity_score: number // 0-100
  total_changes: number
  additions: number
  deletions: number
  modifications: number
  clause_changes: string // JSON array of ClauseChange
  high_risk_changes: number
  medium_risk_changes: number
  low_risk_changes: number
  status: 'draft' | 'in_review' | 'approved' | 'rejected'
  created_by: string
  created_at: string
  reviewed_by?: string
  reviewed_at?: string
}

export class ContractComparisonService {
  /**
   * Create a new version of a document
   */
  static async createVersion(
    db: D1Database,
    documentId: string,
    versionData: {
      version_label?: string
      change_summary?: string
      change_notes?: string
      compared_from_version_id?: string
      created_by: string
    }
  ): Promise<ContractVersion> {
    // Get current version number
    const { results: versions } = await db.prepare(`
      SELECT MAX(version_number) as max_version FROM assembled_document_versions WHERE document_id = ?
    `).bind(documentId).all()
    
    const nextVersion = ((versions?.[0] as any)?.max_version || 0) + 1
    
    // Get document data
    const document = await db.prepare(`
      SELECT * FROM assembled_documents WHERE id = ?
    `).bind(documentId).first()
    
    if (!document) {
      throw new Error('Document not found')
    }
    
    // Get clause selections
    const { results: selections } = await db.prepare(`
      SELECT * FROM document_clause_selections WHERE document_id = ? ORDER BY clause_order
    `).bind(documentId).all()
    
    // Create version ID
    const versionId = `version-${documentId}-${nextVersion}`
    
    // Unset is_current on all previous versions
    await db.prepare(`
      UPDATE assembled_document_versions SET is_current = 0 WHERE document_id = ?
    `).bind(documentId).run()
    
    // Create new version
    await db.prepare(`
      INSERT INTO assembled_document_versions (
        id, document_id, version_number, version_label,
        document_title, document_type, party_1_name, party_2_name,
        effective_date, variable_values, total_clauses, clause_selections,
        is_current, change_summary, change_notes, compared_from_version_id,
        created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      versionId,
      documentId,
      nextVersion,
      versionData.version_label || `Version ${nextVersion}`,
      (document as any).document_title,
      (document as any).document_type,
      (document as any).party_1_name || '',
      (document as any).party_2_name || '',
      (document as any).effective_date || '',
      (document as any).variable_values || '{}',
      selections?.length || 0,
      JSON.stringify(selections),
      1, // is_current
      versionData.change_summary || null,
      versionData.change_notes || null,
      versionData.compared_from_version_id || null,
      versionData.created_by
    ).run()
    
    // Fetch and return the created version
    const version = await db.prepare(`
      SELECT * FROM assembled_document_versions WHERE id = ?
    `).bind(versionId).first() as any
    
    return version as ContractVersion
  }
  
  /**
   * Get all versions of a document
   */
  static async getVersions(
    db: D1Database,
    documentId: string
  ): Promise<ContractVersion[]> {
    const { results } = await db.prepare(`
      SELECT * FROM assembled_document_versions WHERE document_id = ? ORDER BY version_number DESC
    `).bind(documentId).all()
    
    return (results || []) as ContractVersion[]
  }
  
  /**
   * Get a specific version
   */
  static async getVersion(
    db: D1Database,
    versionId: string
  ): Promise<ContractVersion | null> {
    const version = await db.prepare(`
      SELECT * FROM assembled_document_versions WHERE id = ?
    `).bind(versionId).first()
    
    return version as ContractVersion | null
  }
  
  /**
   * Compare two versions of a document
   */
  static async compareVersions(
    db: D1Database,
    documentId: string,
    versionAId: string,
    versionBId: string,
    options: {
      comparison_type?: 'version_to_version' | 'template_to_draft' | 'draft_to_executed'
      created_by: string
    }
  ): Promise<ContractComparison> {
    // Fetch both versions
    const versionA = await this.getVersion(db, versionAId)
    const versionB = await this.getVersion(db, versionBId)
    
    if (!versionA || !versionB) {
      throw new Error('Version not found')
    }
    
    // Parse clause selections
    const clausesA = JSON.parse(versionA.clause_selections || '[]')
    const clausesB = JSON.parse(versionB.clause_selections || '[]')
    
    // Detect changes
    const changes: ClauseChange[] = []
    let additions = 0
    let deletions = 0
    let modifications = 0
    let highRiskChanges = 0
    let mediumRiskChanges = 0
    let lowRiskChanges = 0
    
    // Create maps for efficient lookup
    const clauseMapA = new Map(clausesA.map((c: any) => [c.clause_id, c]))
    const clauseMapB = new Map(clausesB.map((c: any) => [c.clause_id, c]))
    
    // Check for deletions and modifications
    for (const clauseA of clausesA) {
      if (!clauseMapB.has(clauseA.clause_id)) {
        // Clause was removed
        const changeId = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const riskLevel = this.assessRiskLevel(clauseA, 'removed')
        
        changes.push({
          id: changeId,
          comparison_id: '', // Will be set after comparison is created
          change_type: 'clause_removed',
          clause_id: clauseA.clause_id,
          section_name: clauseA.section_name,
          clause_order: clauseA.clause_order,
          old_value: clauseA.original_text,
          new_value: null,
          risk_level: riskLevel,
          risk_reason: `Clause "${clauseA.section_name}" was removed`,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        
        deletions++
        if (riskLevel === 'high' || riskLevel === 'critical') highRiskChanges++
        else if (riskLevel === 'medium') mediumRiskChanges++
        else lowRiskChanges++
      } else {
        // Check for modifications
        const clauseB = clauseMapB.get(clauseA.clause_id)
        if (clauseA.original_text !== clauseB.original_text) {
          const changeId = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          const riskLevel = this.assessRiskLevel(clauseA, 'modified', clauseB)
          
          // Calculate text similarity
          const similarity = DuplicateDetectionService['calculateTextSimilarity'](
            clauseA.original_text,
            clauseB.original_text
          )
          
          changes.push({
            id: changeId,
            comparison_id: '',
            change_type: 'clause_modified',
            clause_id: clauseA.clause_id,
            section_name: clauseA.section_name,
            clause_order: clauseB.clause_order,
            old_value: clauseA.original_text,
            new_value: clauseB.original_text,
            diff_html: this.generateDiffHTML(clauseA.original_text, clauseB.original_text),
            risk_level: riskLevel,
            risk_reason: `Clause "${clauseA.section_name}" was modified (${Math.round((1 - similarity) * 100)}% change)`,
            status: 'pending',
            created_at: new Date().toISOString()
          })
          
          modifications++
          if (riskLevel === 'high' || riskLevel === 'critical') highRiskChanges++
          else if (riskLevel === 'medium') mediumRiskChanges++
          else lowRiskChanges++
        }
      }
    }
    
    // Check for additions
    for (const clauseB of clausesB) {
      if (!clauseMapA.has(clauseB.clause_id)) {
        const changeId = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const riskLevel = this.assessRiskLevel(clauseB, 'added')
        
        changes.push({
          id: changeId,
          comparison_id: '',
          change_type: 'clause_added',
          clause_id: clauseB.clause_id,
          section_name: clauseB.section_name,
          clause_order: clauseB.clause_order,
          old_value: null,
          new_value: clauseB.original_text,
          risk_level: riskLevel,
          risk_reason: `Clause "${clauseB.section_name}" was added`,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        
        additions++
        if (riskLevel === 'high' || riskLevel === 'critical') highRiskChanges++
        else if (riskLevel === 'medium') mediumRiskChanges++
        else lowRiskChanges++
      }
    }
    
    // Calculate overall similarity score (0-100)
    const totalClauses = Math.max(clausesA.length, clausesB.length)
    const unchangedClauses = totalClauses - (additions + deletions + modifications)
    const similarityScore = totalClauses > 0 ? Math.round((unchangedClauses / totalClauses) * 100) : 100
    
    // Create comparison record
    const comparisonId = `comparison-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Update change records with comparison_id
    changes.forEach(change => {
      change.comparison_id = comparisonId
    })
    
    await db.prepare(`
      INSERT INTO assembled_contract_comparisons (
        id, document_id, version_a_id, version_b_id, comparison_type,
        similarity_score, total_changes, additions, deletions, modifications,
        clause_changes, high_risk_changes, medium_risk_changes, low_risk_changes,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      comparisonId,
      documentId,
      versionAId,
      versionBId,
      options.comparison_type || 'version_to_version',
      similarityScore,
      changes.length,
      additions,
      deletions,
      modifications,
      JSON.stringify(changes),
      highRiskChanges,
      mediumRiskChanges,
      lowRiskChanges,
      'draft',
      options.created_by
    ).run()
    
    // Fetch and return the comparison
    const comparison = await db.prepare(`
      SELECT * FROM assembled_contract_comparisons WHERE id = ?
    `).bind(comparisonId).first() as any
    
    return comparison as ContractComparison
  }
  
  /**
   * Get a specific comparison
   */
  static async getComparison(
    db: D1Database,
    comparisonId: string
  ): Promise<ContractComparison | null> {
    const comparison = await db.prepare(`
      SELECT * FROM assembled_contract_comparisons WHERE id = ?
    `).bind(comparisonId).first()
    
    return comparison as ContractComparison | null
  }
  
  /**
   * Get all comparisons for a document
   */
  static async getDocumentComparisons(
    db: D1Database,
    documentId: string
  ): Promise<ContractComparison[]> {
    const { results } = await db.prepare(`
      SELECT * FROM assembled_contract_comparisons WHERE document_id = ? ORDER BY created_at DESC
    `).bind(documentId).all()
    
    return (results || []) as ContractComparison[]
  }
  
  /**
   * Assess risk level based on clause changes
   */
  private static assessRiskLevel(
    clause: any,
    changeType: 'added' | 'removed' | 'modified',
    newClause?: any
  ): 'critical' | 'high' | 'medium' | 'low' {
    const category = clause.category?.toLowerCase() || ''
    const sectionName = clause.section_name?.toLowerCase() || ''
    
    // Critical risk categories
    const criticalCategories = [
      'liability',
      'indemnification',
      'termination',
      'force majeure',
      'dispute resolution'
    ]
    
    // High risk categories
    const highRiskCategories = [
      'warranties',
      'representations',
      'ip ownership',
      'confidentiality',
      'payment terms'
    ]
    
    // Check for critical changes
    if (changeType === 'removed') {
      if (criticalCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
        return 'critical'
      }
      if (highRiskCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
        return 'high'
      }
    }
    
    if (changeType === 'modified' && newClause) {
      // Check for significant modifications
      const similarity = DuplicateDetectionService['calculateTextSimilarity'](
        clause.original_text || '',
        newClause.original_text || ''
      )
      
      if (similarity < 0.5) { // More than 50% change
        if (criticalCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
          return 'critical'
        }
        if (highRiskCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
          return 'high'
        }
        return 'medium'
      }
    }
    
    if (changeType === 'added') {
      if (criticalCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
        return 'high'
      }
      if (highRiskCategories.some(cat => category.includes(cat) || sectionName.includes(cat))) {
        return 'medium'
      }
    }
    
    return 'low'
  }
  
  /**
   * Generate simple diff HTML
   */
  private static generateDiffHTML(oldText: string, newText: string): string {
    const oldWords = oldText.split(/\s+/)
    const newWords = newText.split(/\s+/)
    
    let html = '<div class="diff-container">'
    html += '<div class="diff-old"><strong>Before:</strong> '
    html += oldText.split('\n').map(line => 
      `<span class="diff-line">${this.escapeHtml(line)}</span>`
    ).join('<br>')
    html += '</div>'
    
    html += '<div class="diff-new"><strong>After:</strong> '
    html += newText.split('\n').map(line => 
      `<span class="diff-line">${this.escapeHtml(line)}</span>`
    ).join('<br>')
    html += '</div>'
    html += '</div>'
    
    return html
  }
  
  /**
   * Escape HTML
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}
