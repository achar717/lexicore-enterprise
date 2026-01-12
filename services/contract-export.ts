/**
 * LexiCore™ Contract Export Service
 * Export assembled contracts to DOCX, PDF, and HTML formats
 * Optimized for Cloudflare Workers environment (no Node.js dependencies)
 */

interface ContractData {
  id: string
  document_title: string
  document_type: string
  party_1_name: string
  party_1_type?: string
  party_2_name: string
  party_2_type?: string
  effective_date: string
  variable_values: any
  status: string
  created_at: string
  created_by: string
}

interface ClauseData {
  id: string
  section_name: string
  clause_order: number
  clause_level: number
  clause_title: string
  original_text: string
  customized_text?: string
  was_modified: number
  category: string
  subcategory?: string
}

/**
 * Export contract to DOCX format (Word-compatible HTML)
 * Returns HTML with Office XML namespace that Word can open as .docx
 */
export async function exportContractToDocx(
  contract: ContractData,
  clauses: ClauseData[]
): Promise<string> {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  // Group clauses by section
  const sections = groupClausesBySection(clauses)

  const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml">
<pkg:xmlData>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
</pkg:xmlData>
</pkg:part>
<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">
<pkg:xmlData>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>

<!-- Document Title -->
<w:p>
<w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(contract.document_title)}</w:t></w:r>
</w:p>

<!-- Parties -->
<w:p>
<w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>THIS AGREEMENT</w:t></w:r>
<w:r><w:t> is entered into as of ${escapeXml(contract.effective_date)} (the "Effective Date"), by and between:</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:ind w:left="720"/><w:spacing w:after="120"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(contract.party_1_name)}</w:t></w:r>
${contract.party_1_type ? `<w:r><w:t>, a ${escapeXml(contract.party_1_type)}</w:t></w:r>` : ''}
<w:r><w:t> ("${getPartyLabel(contract.party_1_name)}")</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>and</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:ind w:left="720"/><w:spacing w:after="240"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(contract.party_2_name)}</w:t></w:r>
${contract.party_2_type ? `<w:r><w:t>, a ${escapeXml(contract.party_2_type)}</w:t></w:r>` : ''}
<w:r><w:t> ("${getPartyLabel(contract.party_2_name)}")</w:t></w:r>
</w:p>

<!-- Recitals (if any) -->
<w:p>
<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>RECITALS</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:ind w:left="720"/><w:spacing w:after="120"/></w:pPr>
<w:r><w:t>WHEREAS, the parties wish to enter into this Agreement upon the terms and conditions set forth herein.</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:spacing w:after="240"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>NOW, THEREFORE</w:t></w:r>
<w:r><w:t>, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:</w:t></w:r>
</w:p>

${generateSectionsXml(sections)}

<!-- Signature Block -->
<w:p>
<w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>SIGNATURE PAGE FOLLOWS</w:t></w:r>
</w:p>

<w:p>
<w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
<w:r><w:t>IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.</w:t></w:r>
</w:p>

<w:tbl>
<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>
<w:tr>
<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
<w:p><w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(contract.party_1_name)}</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="120"/></w:pPr><w:r><w:t>By: _______________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Name: ____________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Title: _____________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Date: _____________________________</w:t></w:r></w:p>
</w:tc>
<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
<w:p><w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(contract.party_2_name)}</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="120"/></w:pPr><w:r><w:t>By: _______________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Name: ____________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Title: _____________________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Date: _____________________________</w:t></w:r></w:p>
</w:tc>
</w:tr>
</w:tbl>

<!-- Footer -->
<w:p>
<w:pPr><w:spacing w:before="480"/><w:jc w:val="center"/></w:pPr>
<w:r><w:rPr><w:i/><w:sz w:val="16"/><w:color w:val="808080"/></w:rPr><w:t>Generated by LexiCore™ on ${currentDate}</w:t></w:r>
</w:p>

</w:body>
</w:document>
</pkg:xmlData>
</pkg:part>
</pkg:package>`

  return html
}

/**
 * Group clauses by section for organized output
 */
function groupClausesBySection(clauses: ClauseData[]): Map<string, ClauseData[]> {
  const sections = new Map<string, ClauseData[]>()
  
  for (const clause of clauses) {
    const sectionName = clause.section_name || 'General Provisions'
    if (!sections.has(sectionName)) {
      sections.set(sectionName, [])
    }
    sections.get(sectionName)!.push(clause)
  }
  
  return sections
}

/**
 * Generate XML for all sections and clauses
 */
function generateSectionsXml(sections: Map<string, ClauseData[]>): string {
  let xml = ''
  let sectionNumber = 1
  
  for (const [sectionName, clauses] of sections) {
    // Section heading
    xml += `
<w:p>
<w:pPr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${sectionNumber}. ${escapeXml(sectionName.toUpperCase())}</w:t></w:r>
</w:p>`

    // Clauses in section
    clauses.sort((a, b) => a.clause_order - b.clause_order)
    
    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i]
      const clauseNumber = `${sectionNumber}.${i + 1}`
      const text = clause.customized_text || clause.original_text
      
      // Clause title
      xml += `
<w:p>
<w:pPr><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>${clauseNumber} ${escapeXml(clause.clause_title)}</w:t></w:r>
</w:p>`

      // Clause text (handle multi-paragraph text)
      const paragraphs = text.split('\n\n')
      for (const para of paragraphs) {
        if (para.trim()) {
          xml += `
<w:p>
<w:pPr><w:ind w:left="720"/><w:spacing w:after="120"/></w:pPr>
<w:r><w:t>${escapeXml(para.trim())}</w:t></w:r>
</w:p>`
        }
      }
      
      // Add modification note if clause was customized
      if (clause.was_modified) {
        xml += `
<w:p>
<w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr>
<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:t>[Clause modified from standard]</w:t></w:r>
</w:p>`
      }
    }
    
    sectionNumber++
  }
  
  return xml
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Get simplified party label (e.g., "Company", "Employee")
 */
function getPartyLabel(partyName: string): string {
  const lower = partyName.toLowerCase()
  
  if (lower.includes('inc') || lower.includes('corp') || lower.includes('llc') || lower.includes('ltd')) {
    return 'Company'
  }
  
  if (lower.includes('employee') || lower.includes('contractor')) {
    return 'Employee'
  }
  
  // Extract first name if it looks like a person
  const parts = partyName.trim().split(' ')
  if (parts.length > 1 && parts[0].length < 15) {
    return 'Individual'
  }
  
  return 'Party'
}

/**
 * Export contract to PDF format (HTML for PDF conversion)
 */
export async function exportContractToPdf(
  contract: ContractData,
  clauses: ClauseData[]
): Promise<string> {
  const sections = groupClausesBySection(clauses)
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${contract.document_title}</title>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 1in;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
    }
    .title {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 24pt;
    }
    .parties {
      margin: 12pt 0;
    }
    .party {
      margin-left: 36pt;
      margin-bottom: 12pt;
    }
    .recitals {
      margin: 24pt 0;
    }
    .section-title {
      font-size: 14pt;
      font-weight: bold;
      margin-top: 24pt;
      margin-bottom: 12pt;
    }
    .clause-title {
      font-weight: bold;
      margin-top: 12pt;
      margin-bottom: 6pt;
    }
    .clause-text {
      margin-left: 36pt;
      margin-bottom: 12pt;
      text-align: justify;
    }
    .signatures {
      margin-top: 48pt;
      page-break-inside: avoid;
    }
    .signature-block {
      width: 45%;
      display: inline-block;
      vertical-align: top;
      padding: 12pt;
    }
    .footer {
      margin-top: 48pt;
      text-align: center;
      font-size: 10pt;
      font-style: italic;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="title">${contract.document_title}</div>
  
  <div class="parties">
    <p><strong>THIS AGREEMENT</strong> is entered into as of ${contract.effective_date} (the "Effective Date"), by and between:</p>
    <div class="party">
      <strong>${contract.party_1_name}</strong>${contract.party_1_type ? `, a ${contract.party_1_type}` : ''} ("${getPartyLabel(contract.party_1_name)}")
    </div>
    <p style="text-align: center;"><strong>and</strong></p>
    <div class="party">
      <strong>${contract.party_2_name}</strong>${contract.party_2_type ? `, a ${contract.party_2_type}` : ''} ("${getPartyLabel(contract.party_2_name)}")
    </div>
  </div>
  
  <div class="recitals">
    <div class="section-title">RECITALS</div>
    <div class="clause-text">
      WHEREAS, the parties wish to enter into this Agreement upon the terms and conditions set forth herein.
    </div>
    <p><strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:</p>
  </div>
  
  ${generateSectionsHtml(sections)}
  
  <div class="signatures">
    <div class="section-title">SIGNATURE PAGE</div>
    <p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.</p>
    <br><br>
    <div class="signature-block">
      <strong>${contract.party_1_name}</strong><br><br>
      By: _______________________________<br>
      Name: ____________________________<br>
      Title: _____________________________<br>
      Date: _____________________________
    </div>
    <div class="signature-block">
      <strong>${contract.party_2_name}</strong><br><br>
      By: _______________________________<br>
      Name: ____________________________<br>
      Title: _____________________________<br>
      Date: _____________________________
    </div>
  </div>
  
  <div class="footer">
    Generated by LexiCore™ on ${new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })}
  </div>
</body>
</html>`
}

/**
 * Generate HTML for sections (PDF/HTML export)
 */
function generateSectionsHtml(sections: Map<string, ClauseData[]>): string {
  let html = ''
  let sectionNumber = 1
  
  for (const [sectionName, clauses] of sections) {
    html += `<div class="section-title">${sectionNumber}. ${sectionName.toUpperCase()}</div>`
    
    clauses.sort((a, b) => a.clause_order - b.clause_order)
    
    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i]
      const clauseNumber = `${sectionNumber}.${i + 1}`
      const text = clause.customized_text || clause.original_text
      
      html += `<div class="clause-title">${clauseNumber} ${clause.clause_title}</div>`
      
      const paragraphs = text.split('\n\n')
      for (const para of paragraphs) {
        if (para.trim()) {
          html += `<div class="clause-text">${para.trim()}</div>`
        }
      }
      
      if (clause.was_modified) {
        html += `<div class="clause-text" style="font-style: italic; color: #666; font-size: 10pt;">[Clause modified from standard]</div>`
      }
    }
    
    sectionNumber++
  }
  
  return html
}

/**
 * Export contract to HTML format (web view)
 */
export async function exportContractToHtml(
  contract: ContractData,
  clauses: ClauseData[]
): Promise<string> {
  // Reuse PDF HTML with additional interactive features
  return exportContractToPdf(contract, clauses)
}
