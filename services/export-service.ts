/**
 * LexiCore™ Export Service
 * Phase 4: Citation-Ready Export Module
 * 
 * Generates citation-ready exports for litigation documents:
 * - PDF reports with Bates stamps
 * - Word documents for briefs
 * - Citation tables with page/line references
 * - Exhibit lists
 * - Deposition indexes
 * 
 * © 2024 LexiCore. All rights reserved.
 */

export interface ExportOptions {
  format: 'pdf' | 'word' | 'json' | 'csv'
  exportType: 'citation_report' | 'exhibit_list' | 'deposition_index' | 'fact_summary' | 'full_extraction'
  matterId: string
  matterName: string
  includeDocuments?: string[]      // Document IDs to include
  includeExtractions?: string[]    // Extraction IDs to include
  includeDepositions?: string[]    // Deposition IDs to include
  includeExhibits?: string[]       // Exhibit IDs to include
  batesPrefix?: string             // e.g., "PLAINTIFF"
  batesStartNumber?: number        // Starting Bates number
  includeCoverPage?: boolean
  includeTableOfContents?: boolean
  attorneyName?: string
  firmName?: string
  caseCaption?: string
}

export interface Citation {
  fieldName: string
  extractedValue: string
  verbatimText: string
  pageNumber: number
  lineNumber?: number
  paragraphNumber?: number
  confidence: number
  documentName: string
  batesNumber?: string
}

export interface ExportResult {
  success: boolean
  exportId: string
  format: string
  fileName: string
  fileSize: number
  downloadUrl?: string
  generatedAt: string
  generatedBy: string
  batesRange?: { start: string; end: string }
}

/**
 * Generate citation-ready HTML report
 */
export function generateCitationReport(
  extractions: any[],
  exhibits: any[],
  depositions: any[],
  options: ExportOptions
): string {
  const now = new Date().toISOString()
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Citation Report - ${options.matterName}</title>
  <style>
    @page {
      size: letter;
      margin: 1in;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
    }
    .cover-page {
      page-break-after: always;
      text-align: center;
      padding-top: 3in;
    }
    .cover-page h1 {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 1in;
    }
    .cover-page .case-caption {
      font-size: 14pt;
      margin-bottom: 2em;
      line-height: 2;
    }
    .cover-page .generated-info {
      font-size: 10pt;
      margin-top: 2in;
    }
    .toc {
      page-break-after: always;
    }
    .toc h2 {
      font-size: 14pt;
      text-align: center;
      margin-bottom: 1em;
    }
    .toc ul {
      list-style: none;
      padding: 0;
    }
    .toc li {
      margin-bottom: 0.5em;
      padding-left: 1em;
    }
    .section {
      page-break-before: always;
    }
    h2 {
      font-size: 14pt;
      font-weight: bold;
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    h3 {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 0.8em;
      margin-bottom: 0.4em;
    }
    .citation {
      margin-bottom: 1em;
      padding: 0.5em;
      border-left: 3px solid #333;
      background: #f9f9f9;
    }
    .citation-header {
      font-weight: bold;
      margin-bottom: 0.3em;
    }
    .citation-text {
      font-style: italic;
      margin: 0.5em 0;
      padding-left: 1em;
    }
    .citation-ref {
      font-size: 10pt;
      color: #666;
      margin-top: 0.3em;
    }
    .bates-number {
      font-family: 'Courier New', monospace;
      font-weight: bold;
    }
    .confidence-score {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 9pt;
      background: #e0e0e0;
    }
    .confidence-high { background: #4caf50; color: white; }
    .confidence-medium { background: #ff9800; color: white; }
    .confidence-low { background: #f44336; color: white; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #333;
      padding: 6px;
      text-align: left;
    }
    th {
      background: #f0f0f0;
      font-weight: bold;
    }
    .footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #333;
      font-size: 9pt;
      color: #666;
    }
  </style>
</head>
<body>
`

  // Cover Page
  if (options.includeCoverPage) {
    html += `
  <div class="cover-page">
    <h1>CITATION REPORT</h1>
    ${options.caseCaption ? `<div class="case-caption">${escapeHtml(options.caseCaption)}</div>` : ''}
    <div><strong>Matter:</strong> ${escapeHtml(options.matterName)}</div>
    <div class="generated-info">
      <p>Generated: ${new Date(now).toLocaleString()}</p>
      ${options.attorneyName ? `<p>Attorney: ${escapeHtml(options.attorneyName)}</p>` : ''}
      ${options.firmName ? `<p>Firm: ${escapeHtml(options.firmName)}</p>` : ''}
      <p><em>This is a confidential attorney work product prepared for litigation purposes.</em></p>
    </div>
  </div>
`
  }

  // Table of Contents
  if (options.includeTableOfContents) {
    html += `
  <div class="toc">
    <h2>TABLE OF CONTENTS</h2>
    <ul>
      <li>I. Document Extractions ............................ 1</li>
      <li>II. Exhibit List ................................... 2</li>
      <li>III. Deposition Index .............................. 3</li>
      <li>IV. Citation Table ................................. 4</li>
    </ul>
  </div>
`
  }

  // Section 1: Document Extractions
  if (extractions && extractions.length > 0) {
    html += `
  <div class="section">
    <h2>I. DOCUMENT EXTRACTIONS</h2>
    <p>The following factual information was extracted from ${extractions.length} document(s):</p>
`
    extractions.forEach((extraction, idx) => {
      const data = typeof extraction.extracted_data === 'string' 
        ? JSON.parse(extraction.extracted_data) 
        : extraction.extracted_data

      html += `
    <h3>${idx + 1}. ${escapeHtml(extraction.document_filename || 'Document')} (${extraction.extraction_type})</h3>
    <p><em>Extracted: ${new Date(extraction.extracted_at).toLocaleDateString()}</em></p>
`
      
      // Render extracted fields
      Object.entries(data).forEach(([field, value]: [string, any]) => {
        if (value && typeof value === 'object' && 'value' in value) {
          const confidence = value.confidence || 0
          const confidenceClass = confidence >= 80 ? 'confidence-high' : confidence >= 60 ? 'confidence-medium' : 'confidence-low'
          
          html += `
    <div class="citation">
      <div class="citation-header">
        ${escapeHtml(field)}
        <span class="confidence-score ${confidenceClass}">${confidence}% confidence</span>
      </div>
      <div class="citation-text">"${escapeHtml(value.verbatim || value.value)}"</div>
      <div class="citation-ref">
        Page ${value.source?.page || 'N/A'}
        ${value.source?.line ? `, Line ${value.source.line}` : ''}
        ${value.source?.paragraph ? `, ¶${value.source.paragraph}` : ''}
      </div>
    </div>
`
        }
      })
    })
    html += `  </div>\n`
  }

  // Section 2: Exhibit List
  if (exhibits && exhibits.length > 0) {
    html += `
  <div class="section">
    <h2>II. EXHIBIT LIST</h2>
    <table>
      <thead>
        <tr>
          <th>Exhibit No.</th>
          <th>Description</th>
          <th>Type</th>
          <th>Bates Range</th>
          <th>Status</th>
          <th>References</th>
        </tr>
      </thead>
      <tbody>
`
    exhibits.forEach(exhibit => {
      html += `
        <tr>
          <td><strong>${escapeHtml(exhibit.exhibit_number)}</strong></td>
          <td>${escapeHtml(exhibit.description)}</td>
          <td>${escapeHtml(exhibit.exhibit_type)}</td>
          <td class="bates-number">${exhibit.bates_number_start || 'N/A'}</td>
          <td>${escapeHtml(exhibit.status)}</td>
          <td>${exhibit.reference_count || 0}</td>
        </tr>
`
    })
    html += `
      </tbody>
    </table>
  </div>
`
  }

  // Section 3: Deposition Index
  if (depositions && depositions.length > 0) {
    html += `
  <div class="section">
    <h2>III. DEPOSITION INDEX</h2>
`
    depositions.forEach((dep, idx) => {
      html += `
    <h3>${idx + 1}. Deposition of ${escapeHtml(dep.deponent_name)}</h3>
    <p>
      <strong>Date:</strong> ${dep.deposition_date}<br>
      <strong>Location:</strong> ${dep.location || 'N/A'}<br>
      <strong>Pages:</strong> ${dep.total_pages || 'N/A'}<br>
      <strong>Status:</strong> ${dep.processing_status}
    </p>
`
    })
    html += `  </div>\n`
  }

  // Footer
  html += `
  <div class="footer">
    <p><strong>CONFIDENTIAL ATTORNEY WORK PRODUCT</strong></p>
    <p>Prepared for litigation purposes. This document contains attorney work product and is protected from discovery.</p>
    <p>Generated by LexiCore™ on ${new Date(now).toLocaleString()}</p>
    ${options.batesPrefix ? `<p>Bates Range: <span class="bates-number">${options.batesPrefix}-${String(options.batesStartNumber).padStart(6, '0')}</span> to <span class="bates-number">${options.batesPrefix}-${String((options.batesStartNumber || 0) + 10).padStart(6, '0')}</span></p>` : ''}
  </div>

</body>
</html>
`

  return html
}

/**
 * Generate exhibit list in CSV format
 */
export function generateExhibitListCSV(exhibits: any[]): string {
  let csv = 'Exhibit Number,Label,Description,Type,Bates Start,Bates End,Total Pages,Status,References,Source Type,Introduced By,Introduced Date\n'
  
  exhibits.forEach(ex => {
    csv += [
      escapeCSV(ex.exhibit_number),
      escapeCSV(ex.exhibit_label || ''),
      escapeCSV(ex.description),
      escapeCSV(ex.exhibit_type),
      escapeCSV(ex.bates_number_start || ''),
      escapeCSV(ex.bates_number_end || ''),
      ex.total_pages || '',
      escapeCSV(ex.status),
      ex.reference_count || 0,
      escapeCSV(ex.source_type || ''),
      escapeCSV(ex.introduced_by || ''),
      ex.introduced_date || ''
    ].join(',') + '\n'
  })
  
  return csv
}

/**
 * Generate deposition index in JSON format
 */
export function generateDepositionIndexJSON(depositions: any[], excerpts: any[]): string {
  const index = depositions.map(dep => {
    const depExcerpts = excerpts.filter(ex => ex.deposition_id === dep.id)
    
    return {
      deponent: dep.deponent_name,
      date: dep.deposition_date,
      location: dep.location,
      totalPages: dep.total_pages,
      excerpts: depExcerpts.map(ex => ({
        page: ex.page_number,
        lineStart: ex.line_start,
        lineEnd: ex.line_end,
        text: ex.excerpt_text,
        topic: ex.topic
      }))
    }
  })
  
  return JSON.stringify(index, null, 2)
}

/**
 * Generate citation table in HTML format
 */
export function generateCitationTable(citations: Citation[]): string {
  let html = `
<table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt;">
  <thead>
    <tr style="background: #f0f0f0;">
      <th style="border: 1px solid #333; padding: 8px; text-align: left;">Field</th>
      <th style="border: 1px solid #333; padding: 8px; text-align: left;">Extracted Value</th>
      <th style="border: 1px solid #333; padding: 8px; text-align: left;">Verbatim Quote</th>
      <th style="border: 1px solid #333; padding: 8px; text-align: left;">Citation</th>
      <th style="border: 1px solid #333; padding: 8px; text-align: center;">Confidence</th>
    </tr>
  </thead>
  <tbody>
`
  
  citations.forEach(citation => {
    const citationRef = `${citation.documentName}, p. ${citation.pageNumber}${citation.lineNumber ? `:${citation.lineNumber}` : ''}${citation.batesNumber ? ` (${citation.batesNumber})` : ''}`
    const confidenceColor = citation.confidence >= 80 ? '#4caf50' : citation.confidence >= 60 ? '#ff9800' : '#f44336'
    
    html += `
    <tr>
      <td style="border: 1px solid #333; padding: 8px;">${escapeHtml(citation.fieldName)}</td>
      <td style="border: 1px solid #333; padding: 8px;"><strong>${escapeHtml(citation.extractedValue)}</strong></td>
      <td style="border: 1px solid #333; padding: 8px; font-style: italic;">"${escapeHtml(citation.verbatimText)}"</td>
      <td style="border: 1px solid #333; padding: 8px; font-size: 9pt;">${escapeHtml(citationRef)}</td>
      <td style="border: 1px solid #333; padding: 8px; text-align: center;">
        <span style="background: ${confidenceColor}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 9pt;">
          ${citation.confidence}%
        </span>
      </td>
    </tr>
`
  })
  
  html += `
  </tbody>
</table>
`
  
  return html
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Helper: Escape CSV
 */
function escapeCSV(text: string): string {
  if (!text) return ''
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Generate Bates number
 */
export function generateBatesNumber(prefix: string, number: number, digits: number = 6): string {
  return `${prefix}-${String(number).padStart(digits, '0')}`
}

/**
 * Calculate file hash (for integrity verification)
 */
export async function calculateFileHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
