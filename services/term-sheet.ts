// LexiCore™ Term Sheet Service
// © 2024 LexiCore. Generate read-only term sheets from contract extractions.

import type { D1Database } from '@cloudflare/workers-types'

export interface TermSheetData {
  parties: {
    primary: string
    counterparty: string
  }
  key_terms: {
    effective_date?: string
    expiration_date?: string
    term?: string
    governing_law?: string
  }
  financial_terms: {
    payment_terms?: string
    pricing?: string
  }
  obligations: any[]
  termination_provisions: any[]
  other_provisions: any[]
}

export class TermSheetService {
  constructor(private db: D1Database) {}

  /**
   * Generate term sheet from contract extractions
   */
  async generateTermSheet(contractId: string, matterId: string, userId: string): Promise<string> {
    // Get contract details
    const contract = await this.db.prepare(`
      SELECT * FROM contracts WHERE id = ?
    `).bind(contractId).first<any>()

    if (!contract) {
      throw new Error('Contract not found')
    }

    // Get all extractions for this contract
    const extractions = await this.db.prepare(`
      SELECT * FROM contract_extractions
      WHERE contract_id = ?
      ORDER BY field_category, field_name
    `).bind(contractId).all()

    // Organize extractions by category
    const extractionsByCategory: Record<string, any[]> = {}
    for (const ext of (extractions.results || [])) {
      const category = ext.field_category as string
      if (!extractionsByCategory[category]) {
        extractionsByCategory[category] = []
      }
      extractionsByCategory[category].push(ext)
    }

    // Build term sheet data structure
    const termSheetData: TermSheetData = {
      parties: {
        primary: contract.primary_party || 'N/A',
        counterparty: contract.counterparty || 'N/A'
      },
      key_terms: {},
      financial_terms: {},
      obligations: [],
      termination_provisions: [],
      other_provisions: []
    }

    // Extract key terms
    if (extractionsByCategory['term_and_termination']) {
      for (const ext of extractionsByCategory['term_and_termination']) {
        if (ext.field_name.toLowerCase().includes('term')) {
          termSheetData.key_terms.term = ext.field_value
        } else if (ext.field_name.toLowerCase().includes('termination')) {
          termSheetData.termination_provisions.push({
            name: ext.field_name,
            value: ext.field_value,
            clause: ext.verbatim_clause
          })
        }
      }
    }

    if (extractionsByCategory['governing_law']) {
      const govLaw = extractionsByCategory['governing_law'][0]
      if (govLaw) {
        termSheetData.key_terms.governing_law = govLaw.field_value
      }
    }

    if (extractionsByCategory['payment_terms']) {
      for (const ext of extractionsByCategory['payment_terms']) {
        if (!termSheetData.financial_terms.payment_terms) {
          termSheetData.financial_terms.payment_terms = ext.field_value
        }
      }
    }

    // Get obligations
    const obligations = await this.db.prepare(`
      SELECT * FROM contract_obligations
      WHERE contract_id = ?
      ORDER BY due_date
    `).bind(contractId).all()

    termSheetData.obligations = obligations.results || []

    // Collect other significant provisions
    const significantCategories = [
      'indemnification',
      'confidentiality',
      'intellectual_property',
      'dispute_resolution'
    ]

    for (const category of significantCategories) {
      if (extractionsByCategory[category]) {
        for (const ext of extractionsByCategory[category]) {
          termSheetData.other_provisions.push({
            category: this.formatCategoryName(category),
            name: ext.field_name,
            value: ext.field_value,
            clause: ext.verbatim_clause
          })
        }
      }
    }

    // Generate HTML representation
    const html = this.generateTermSheetHTML(contract, termSheetData)

    // Save term sheet
    const termSheetId = `term-sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    await this.db.prepare(`
      INSERT INTO transactional_term_sheets (
        id, contract_id, matter_id, term_sheet_title, term_sheet_data,
        term_sheet_html, generated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      termSheetId,
      contractId,
      matterId,
      `Term Sheet - ${contract.contract_title}`,
      JSON.stringify(termSheetData),
      html,
      userId
    ).run()

    return termSheetId
  }

  /**
   * Generate HTML for term sheet
   */
  private generateTermSheetHTML(contract: any, data: TermSheetData): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Term Sheet - ${contract.contract_title}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.5; color: #333; }
    .header { border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { margin: 0; color: #1e40af; font-size: 24pt; }
    .header .subtitle { color: #64748b; font-size: 9pt; margin-top: 5px; }
    .section { margin-bottom: 25px; page-break-inside: avoid; }
    .section-title { font-size: 14pt; font-weight: 700; color: #1e40af; margin-bottom: 10px; border-bottom: 2px solid #dbeafe; padding-bottom: 5px; }
    .field-group { margin-bottom: 15px; }
    .field-label { font-weight: 600; color: #475569; display: inline-block; width: 180px; }
    .field-value { color: #1e293b; display: inline-block; }
    .provision { background: #f8fafc; padding: 12px; border-left: 4px solid #3b82f6; margin-bottom: 12px; }
    .provision-title { font-weight: 600; color: #334155; margin-bottom: 5px; }
    .provision-value { color: #475569; font-size: 9pt; }
    .clause-excerpt { background: #f1f5f9; padding: 10px; border-radius: 4px; font-size: 9pt; font-style: italic; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 15px; border-top: 2px solid #e2e8f0; font-size: 8pt; color: #64748b; text-align: center; }
    .notice { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
    .notice-title { font-weight: 700; color: #92400e; margin-bottom: 5px; }
    .notice-text { font-size: 9pt; color: #78350f; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; font-weight: 600; color: #334155; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 TERM SHEET</h1>
    <div class="subtitle">Contract Summary - ${contract.contract_title}</div>
    <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="notice">
    <div class="notice-title">⚠️ PROFESSIONAL RESPONSIBILITY NOTICE</div>
    <div class="notice-text">
      This term sheet is a READ-ONLY reference document generated from AI-assisted extraction. 
      It does NOT constitute a legal document and must NOT be used as a substitute for the original contract. 
      All terms are subject to attorney verification against source documents. LexiCore provides advisory assistance only.
    </div>
  </div>

  <div class="section">
    <div class="section-title">Parties</div>
    <div class="field-group">
      <span class="field-label">Primary Party:</span>
      <span class="field-value">${data.parties.primary}</span>
    </div>
    <div class="field-group">
      <span class="field-label">Counterparty:</span>
      <span class="field-value">${data.parties.counterparty}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Key Terms</div>
    ${data.key_terms.effective_date ? `
      <div class="field-group">
        <span class="field-label">Effective Date:</span>
        <span class="field-value">${data.key_terms.effective_date}</span>
      </div>
    ` : ''}
    ${data.key_terms.term ? `
      <div class="field-group">
        <span class="field-label">Term:</span>
        <span class="field-value">${data.key_terms.term}</span>
      </div>
    ` : ''}
    ${data.key_terms.governing_law ? `
      <div class="field-group">
        <span class="field-label">Governing Law:</span>
        <span class="field-value">${data.key_terms.governing_law}</span>
      </div>
    ` : ''}
  </div>

  ${data.financial_terms.payment_terms ? `
    <div class="section">
      <div class="section-title">Financial Terms</div>
      <div class="field-group">
        <span class="field-label">Payment Terms:</span>
        <span class="field-value">${data.financial_terms.payment_terms}</span>
      </div>
    </div>
  ` : ''}

  ${data.obligations.length > 0 ? `
    <div class="section">
      <div class="section-title">Key Obligations</div>
      <table>
        <thead>
          <tr>
            <th>Obligation</th>
            <th>Responsible Party</th>
            <th>Due Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.obligations.map((obl: any) => `
            <tr>
              <td>${obl.obligation_description || obl.obligation_type}</td>
              <td>${obl.responsible_party || 'N/A'}</td>
              <td>${obl.due_date || 'Ongoing'}</td>
              <td>${obl.status || 'pending'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''}

  ${data.termination_provisions.length > 0 ? `
    <div class="section">
      <div class="section-title">Termination Provisions</div>
      ${data.termination_provisions.map((prov: any) => `
        <div class="provision">
          <div class="provision-title">${prov.name}</div>
          <div class="provision-value">${prov.value}</div>
          ${prov.clause ? `<div class="clause-excerpt">"${prov.clause.substring(0, 200)}${prov.clause.length > 200 ? '...' : ''}"</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : ''}

  ${data.other_provisions.length > 0 ? `
    <div class="section">
      <div class="section-title">Other Significant Provisions</div>
      ${data.other_provisions.map((prov: any) => `
        <div class="provision">
          <div class="provision-title">${prov.category}: ${prov.name}</div>
          <div class="provision-value">${prov.value}</div>
          ${prov.clause ? `<div class="clause-excerpt">"${prov.clause.substring(0, 200)}${prov.clause.length > 200 ? '...' : ''}"</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : ''}

  <div class="footer">
    <p><strong>READ-ONLY REFERENCE DOCUMENT</strong></p>
    <p>Generated by LexiCore™ Contract Intelligence Platform</p>
    <p>This term sheet must be verified against the original contract by a licensed attorney</p>
    <p>Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>
    `
  }

  /**
   * Get term sheet by ID
   */
  async getTermSheet(termSheetId: string): Promise<any> {
    const result = await this.db.prepare(`
      SELECT 
        ts.*,
        c.contract_title,
        m.name as matter_name
      FROM transactional_term_sheets ts
      LEFT JOIN contracts c ON ts.contract_id = c.id
      LEFT JOIN matters m ON ts.matter_id = m.id
      WHERE ts.id = ?
    `).bind(termSheetId).first()

    return result
  }

  /**
   * Get term sheets for a contract
   */
  async getContractTermSheets(contractId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT * FROM transactional_term_sheets
      WHERE contract_id = ?
      ORDER BY version DESC, created_at DESC
    `).bind(contractId).all()

    return result.results || []
  }

  /**
   * Lock term sheet (prevent regeneration)
   */
  async lockTermSheet(termSheetId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE transactional_term_sheets
      SET is_locked = 1
      WHERE id = ?
    `).bind(termSheetId).run()
  }

  /**
   * Format category name for display
   */
  private formatCategoryName(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
}
