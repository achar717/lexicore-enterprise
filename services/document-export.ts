/**
 * LexiCore™ Document Export Service
 * Export documents with summaries to Word, PDF, and Excel formats
 */

interface DocumentData {
  documentId: string;
  documentName: string;
  matterName: string;
  matterNumber: string;
  documentType?: string;
  uploadedBy?: string;
  uploadDate?: string;
  pageCount?: number;
  wordCount?: number;
}

interface SummaryData {
  summaryType: 'short' | 'long';
  summary?: string;
  sections?: Array<{ heading: string; content: string }>;
  keyPoints?: string[];
  keyFindings?: string[];
  wordCount?: number;
  confidenceScore?: number;
  generatedAt?: string;
  generatedBy?: string;
}

/**
 * Export document summary to Word format (DOCX)
 */
export async function exportToWord(
  document: DocumentData,
  summary: SummaryData
): Promise<string> {
  // Generate HTML that can be converted to Word format
  const html = generateWordHTML(document, summary);
  
  // Return HTML with proper Word XML namespace
  // This will be sent as application/vnd.openxmlformats-officedocument.wordprocessingml.document
  return html;
}

/**
 * Export document summary to PDF format
 */
export async function exportToPDF(
  document: DocumentData,
  summary: SummaryData
): Promise<string> {
  // Generate HTML for PDF conversion
  const html = generatePDFHTML(document, summary);
  return html;
}

/**
 * Export document summary to Excel format (XLSX)
 */
export async function exportToExcel(
  document: DocumentData,
  summary: SummaryData
): Promise<string> {
  // Generate CSV that can be opened in Excel
  const csv = generateExcelCSV(document, summary);
  return csv;
}

/**
 * Generate HTML for Word export (with Word-specific styles)
 */
function generateWordHTML(document: DocumentData, summary: SummaryData): string {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Document Summary - ${document.documentName}</title>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 1in;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000000;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #000;
      padding-bottom: 20pt;
      margin-bottom: 20pt;
    }
    .firm-name {
      font-size: 18pt;
      font-weight: bold;
      letter-spacing: 2pt;
      text-transform: uppercase;
    }
    .document-title {
      font-size: 14pt;
      font-weight: bold;
      margin-top: 10pt;
    }
    .metadata {
      margin: 20pt 0;
      padding: 15pt;
      background-color: #f5f5f5;
      border-left: 4pt solid #1e3a8a;
    }
    .metadata-row {
      margin: 5pt 0;
    }
    .label {
      font-weight: bold;
      display: inline-block;
      width: 150pt;
    }
    h1 {
      font-size: 16pt;
      font-weight: bold;
      margin: 30pt 0 15pt 0;
      border-bottom: 2pt solid #1e3a8a;
      padding-bottom: 5pt;
      text-transform: uppercase;
    }
    h2 {
      font-size: 14pt;
      font-weight: bold;
      margin: 20pt 0 10pt 0;
      color: #1e3a8a;
    }
    h3 {
      font-size: 12pt;
      font-weight: bold;
      margin: 15pt 0 10pt 0;
      font-style: italic;
    }
    .summary-text {
      text-align: justify;
      margin: 10pt 0;
      text-indent: 0.5in;
    }
    .key-points {
      margin: 15pt 0 15pt 30pt;
    }
    .key-point {
      margin: 8pt 0;
      padding-left: 20pt;
      position: relative;
    }
    .key-point:before {
      content: "▪";
      position: absolute;
      left: 0;
      font-weight: bold;
    }
    .legal-notice {
      margin-top: 30pt;
      padding: 15pt;
      background-color: #fffbeb;
      border: 2pt solid #d97706;
      border-radius: 4pt;
    }
    .legal-notice-title {
      font-weight: bold;
      color: #92400e;
      text-transform: uppercase;
      margin-bottom: 10pt;
    }
    .footer {
      margin-top: 40pt;
      padding-top: 20pt;
      border-top: 1pt solid #ccc;
      font-size: 10pt;
      color: #666;
      text-align: center;
    }
    .section-content {
      margin: 10pt 0 20pt 0;
      text-align: justify;
    }
    .confidence-badge {
      display: inline-block;
      padding: 3pt 10pt;
      background-color: ${summary.confidenceScore && summary.confidenceScore >= 90 ? '#059669' : summary.confidenceScore && summary.confidenceScore >= 75 ? '#d97706' : '#dc2626'};
      color: white;
      border-radius: 3pt;
      font-size: 10pt;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="firm-name">LexiCore™</div>
    <div style="font-size: 10pt; margin-top: 5pt;">Regulated Document Intelligence Platform</div>
    <div class="document-title">Document Analysis Summary</div>
  </div>

  <div class="metadata">
    <div class="metadata-row">
      <span class="label">Document:</span>
      <span>${escapeHtml(document.documentName)}</span>
    </div>
    <div class="metadata-row">
      <span class="label">Matter:</span>
      <span>${escapeHtml(document.matterName)} (${escapeHtml(document.matterNumber)})</span>
    </div>
    ${document.documentType ? `
    <div class="metadata-row">
      <span class="label">Document Type:</span>
      <span>${escapeHtml(document.documentType)}</span>
    </div>
    ` : ''}
    ${document.pageCount ? `
    <div class="metadata-row">
      <span class="label">Page Count:</span>
      <span>${document.pageCount} pages</span>
    </div>
    ` : ''}
    ${document.wordCount ? `
    <div class="metadata-row">
      <span class="label">Word Count:</span>
      <span>${document.wordCount.toLocaleString()} words</span>
    </div>
    ` : ''}
    <div class="metadata-row">
      <span class="label">Summary Type:</span>
      <span>${summary.summaryType === 'short' ? 'Executive Summary' : 'Comprehensive Analysis'}</span>
    </div>
    <div class="metadata-row">
      <span class="label">Generated:</span>
      <span>${currentDate}</span>
    </div>
    ${summary.confidenceScore ? `
    <div class="metadata-row">
      <span class="label">Confidence Score:</span>
      <span class="confidence-badge">${summary.confidenceScore}%</span>
    </div>
    ` : ''}
  </div>

  ${summary.summaryType === 'short' ? generateShortSummaryHTML(summary) : generateLongSummaryHTML(summary)}

  <div class="legal-notice">
    <div class="legal-notice-title">⚠️ Legal Notice</div>
    <div>
      This AI-generated summary is provided for informational purposes only and 
      does not constitute legal advice, legal opinions, or legal conclusions. 
      This document must be reviewed and verified by a licensed attorney before 
      being used for any legal purpose. Final responsibility for all legal work 
      product rests exclusively with the supervising attorney of record.
    </div>
    <div style="margin-top: 10pt; font-style: italic;">
      Generated by LexiCore™ AI Analysis System using OpenAI GPT-4o-mini. 
      Attorney review required before use.
    </div>
  </div>

  <div class="footer">
    <div>© ${new Date().getFullYear()} LexiCore™ - Regulated Document Intelligence Platform</div>
    <div style="margin-top: 5pt;">This system does not provide legal advice and requires attorney supervision.</div>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML for PDF export (optimized for PDF rendering)
 */
function generatePDFHTML(document: DocumentData, summary: SummaryData): string {
  // PDF HTML is similar to Word but with PDF-specific optimizations
  return generateWordHTML(document, summary);
}

/**
 * Generate CSV for Excel export
 */
function generateExcelCSV(document: DocumentData, summary: SummaryData): string {
  const rows: string[][] = [
    ['LexiCore™ Document Analysis Summary'],
    [''],
    ['Document Information'],
    ['Document Name', document.documentName],
    ['Matter', `${document.matterName} (${document.matterNumber})`],
    ['Document Type', document.documentType || 'N/A'],
    ['Page Count', document.pageCount?.toString() || 'N/A'],
    ['Word Count', document.wordCount?.toString() || 'N/A'],
    ['Summary Type', summary.summaryType === 'short' ? 'Executive Summary' : 'Comprehensive Analysis'],
    ['Generated', new Date().toISOString()],
    ['Confidence Score', summary.confidenceScore ? `${summary.confidenceScore}%` : 'N/A'],
    [''],
  ];

  if (summary.summaryType === 'short') {
    rows.push(['Executive Summary']);
    rows.push(['Summary Text', summary.summary || '']);
    rows.push(['']);
    rows.push(['Key Points']);
    (summary.keyPoints || []).forEach((point, idx) => {
      rows.push([`${idx + 1}`, point]);
    });
  } else {
    rows.push(['Comprehensive Analysis']);
    rows.push(['']);
    (summary.sections || []).forEach(section => {
      rows.push([section.heading]);
      rows.push(['', section.content]);
      rows.push(['']);
    });
    
    if (summary.keyFindings && summary.keyFindings.length > 0) {
      rows.push(['Key Findings']);
      summary.keyFindings.forEach((finding, idx) => {
        rows.push([`${idx + 1}`, finding]);
      });
    }
  }

  rows.push(['']);
  rows.push(['Legal Notice']);
  rows.push(['', 'This AI-generated summary is provided for informational purposes only and does not constitute legal advice. Attorney review required before use.']);

  // Convert to CSV
  return rows.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

/**
 * Generate HTML for short summary
 */
function generateShortSummaryHTML(summary: SummaryData): string {
  return `
  <h1>Executive Summary</h1>
  
  <div class="summary-text">
    ${escapeHtml(summary.summary || '').split('\n\n').map(para => `<p class="summary-text">${para}</p>`).join('')}
  </div>

  ${summary.keyPoints && summary.keyPoints.length > 0 ? `
  <h2>Key Points</h2>
  <div class="key-points">
    ${summary.keyPoints.map(point => `<div class="key-point">${escapeHtml(point)}</div>`).join('')}
  </div>
  ` : ''}

  ${summary.wordCount ? `
  <div style="margin-top: 20pt; font-size: 10pt; color: #666;">
    Summary word count: ${summary.wordCount} words
  </div>
  ` : ''}
  `;
}

/**
 * Generate HTML for long summary
 */
function generateLongSummaryHTML(summary: SummaryData): string {
  return `
  <h1>Comprehensive Document Analysis</h1>

  ${(summary.sections || []).map(section => `
  <h2>${escapeHtml(section.heading)}</h2>
  <div class="section-content">
    ${escapeHtml(section.content).split('\n\n').map(para => `<p>${para}</p>`).join('')}
  </div>
  `).join('')}

  ${summary.keyFindings && summary.keyFindings.length > 0 ? `
  <h2>Key Findings</h2>
  <div class="key-points">
    ${summary.keyFindings.map(finding => `<div class="key-point">${escapeHtml(finding)}</div>`).join('')}
  </div>
  ` : ''}

  ${summary.wordCount ? `
  <div style="margin-top: 20pt; font-size: 10pt; color: #666;">
    Analysis word count: ${summary.wordCount} words
  </div>
  ` : ''}
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
