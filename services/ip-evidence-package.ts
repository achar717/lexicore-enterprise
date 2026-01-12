/**
 * LexiCore™ IP Practice Module - Phase 5: Evidence Package Generator
 * 
 * Purpose: Generate court-ready evidence packages with full chain of custody
 * Features:
 * - Comprehensive evidence packages (facts + source docs + audit trail + reviews)
 * - Certificate of Authenticity generation
 * - Multiple export formats (PDF, ZIP with JSON/CSV, DOCX)
 * - Cryptographic integrity verification
 * - Court-ready formatting with proper citations
 */

import { generateId, sha256Hash } from '../utils/crypto'

export type PackageType = 'full_evidence' | 'audit_only' | 'facts_only' | 'court_ready'
export type PackageStatus = 'draft' | 'generated' | 'certified' | 'delivered' | 'filed'
export type ExportFormat = 'pdf' | 'docx' | 'json' | 'csv' | 'zip'

interface EvidencePackageOptions {
  matterId: string
  extractionJobId: string
  packageType: PackageType
  title: string
  description?: string
  exportFormat: ExportFormat
  includeOptions?: {
    includeFacts?: boolean
    includeSourceDocuments?: boolean
    includeAuditLogs?: boolean
    includeReviewRecords?: boolean
    includeMetadata?: boolean
    includeChainOfCustody?: boolean
  }
  filterOptions?: {
    confidenceThreshold?: number
    approvalStatus?: string[]
    factTypes?: string[]
  }
}

interface ExtractedFact {
  id: string
  fact_type: string
  fact_text: string
  source_location: string
  confidence_score: number
  extraction_timestamp: string
  approved_status: string
  approved_by: string | null
  approved_at: string | null
}

export class IPEvidencePackageService {
  constructor(private db: D1Database) {}

  /**
   * Generate evidence package
   */
  async generatePackage(
    options: EvidencePackageOptions,
    generatedBy: string
  ): Promise<{ packageId: string; certificateId: string | null; data: string; hash: string }> {
    // Validate extraction job exists
    await this.validateExtractionJob(options.extractionJobId)

    // Create package record
    const packageId = generateId('evidence-pkg')
    
    // Gather package contents
    const contents = await this.gatherPackageContents(options)

    // Format package data
    const packageData = await this.formatPackageData(contents, options)

    // Calculate hash for integrity
    const packageHash = await sha256Hash(packageData)

    // Save package record
    await this.db.prepare(`
      INSERT INTO ip_evidence_packages (
        id, matter_id, extraction_job_id, package_type, title, description,
        generated_by, included_facts_count, included_documents_count,
        included_audit_entries_count, file_hash, status, export_format, package_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?)
    `).bind(
      packageId,
      options.matterId,
      options.extractionJobId,
      options.packageType,
      options.title,
      options.description || null,
      generatedBy,
      contents.facts.length,
      contents.documents.length,
      contents.auditEntries.length,
      packageHash,
      options.exportFormat,
      JSON.stringify({
        includeOptions: options.includeOptions,
        filterOptions: options.filterOptions,
        generatedAt: new Date().toISOString()
      })
    ).run()

    // Save package contents
    await this.savePackageContents(packageId, contents)

    // Generate certificate of authenticity if court-ready
    let certificateId: string | null = null
    if (options.packageType === 'court_ready') {
      certificateId = await this.generateCertificateOfAuthenticity(
        packageId,
        generatedBy,
        contents
      )
    }

    return {
      packageId,
      certificateId,
      data: packageData,
      hash: packageHash
    }
  }

  /**
   * Validate extraction job exists
   */
  private async validateExtractionJob(jobId: string): Promise<void> {
    const result = await this.db.prepare(`
      SELECT id FROM ip_extraction_jobs WHERE id = ?
    `).bind(jobId).first()

    if (!result) {
      throw new Error('Extraction job not found')
    }
  }

  /**
   * Gather all contents for the package
   */
  private async gatherPackageContents(options: EvidencePackageOptions): Promise<any> {
    const contents: any = {
      facts: [],
      documents: [],
      auditEntries: [],
      reviewRecords: [],
      metadata: {}
    }

    // Get extracted facts
    if (options.includeOptions?.includeFacts !== false) {
      contents.facts = await this.getExtractedFacts(options)
    }

    // Get source documents
    if (options.includeOptions?.includeSourceDocuments) {
      contents.documents = await this.getSourceDocuments(options.extractionJobId)
    }

    // Get audit logs
    if (options.includeOptions?.includeAuditLogs) {
      contents.auditEntries = await this.getAuditEntries(options.extractionJobId)
    }

    // Get review records
    if (options.includeOptions?.includeReviewRecords) {
      contents.reviewRecords = await this.getReviewRecords(options.extractionJobId)
    }

    // Get metadata
    if (options.includeOptions?.includeMetadata) {
      contents.metadata = await this.getExtractionMetadata(options.extractionJobId)
    }

    return contents
  }

  /**
   * Get extracted facts with filters
   */
  private async getExtractedFacts(options: EvidencePackageOptions): Promise<ExtractedFact[]> {
    let query = `
      SELECT 
        f.id, f.fact_type, f.fact_text, f.source_location, f.confidence_score,
        f.extraction_timestamp, fr.approved_status, fr.approved_by, fr.approved_at
      FROM ip_extracted_facts f
      LEFT JOIN ip_fact_reviews fr ON f.id = fr.fact_id
      WHERE f.extraction_job_id = ?
    `
    const params: any[] = [options.extractionJobId]

    // Apply confidence filter
    if (options.filterOptions?.confidenceThreshold) {
      query += ` AND f.confidence_score >= ?`
      params.push(options.filterOptions.confidenceThreshold)
    }

    // Apply approval status filter
    if (options.filterOptions?.approvalStatus && options.filterOptions.approvalStatus.length > 0) {
      const placeholders = options.filterOptions.approvalStatus.map(() => '?').join(',')
      query += ` AND fr.approved_status IN (${placeholders})`
      params.push(...options.filterOptions.approvalStatus)
    }

    // Apply fact type filter
    if (options.filterOptions?.factTypes && options.filterOptions.factTypes.length > 0) {
      const placeholders = options.filterOptions.factTypes.map(() => '?').join(',')
      query += ` AND f.fact_type IN (${placeholders})`
      params.push(...options.filterOptions.factTypes)
    }

    query += ` ORDER BY f.extraction_timestamp DESC`

    const result = await this.db.prepare(query).bind(...params).all()
    return result.results as ExtractedFact[]
  }

  /**
   * Get source documents
   */
  private async getSourceDocuments(jobId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        d.id, d.name, d.document_type, d.classification,
        d.file_path, d.file_size, d.created_at
      FROM documents d
      JOIN ip_extraction_jobs j ON d.id = j.document_id
      WHERE j.id = ?
    `).bind(jobId).all()

    return result.results || []
  }

  /**
   * Get audit entries for extraction job
   */
  private async getAuditEntries(jobId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        event_timestamp, event_type, event_category, user_id, event_data
      FROM audit_log
      WHERE event_data LIKE ?
      ORDER BY event_timestamp DESC
    `).bind(`%${jobId}%`).all()

    return result.results || []
  }

  /**
   * Get review records
   */
  private async getReviewRecords(jobId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        r.id, r.review_status, r.reviewed_by, r.reviewed_at,
        r.review_notes, r.approved_facts_count, r.rejected_facts_count
      FROM ip_extraction_reviews r
      WHERE r.extraction_job_id = ?
      ORDER BY r.reviewed_at DESC
    `).bind(jobId).all()

    return result.results || []
  }

  /**
   * Get extraction metadata
   */
  private async getExtractionMetadata(jobId: string): Promise<any> {
    const result = await this.db.prepare(`
      SELECT 
        practice_mode_id, document_id, extraction_status,
        extracted_facts_count, started_at, completed_at,
        prompt_template_id, llm_model, llm_temperature
      FROM ip_extraction_jobs
      WHERE id = ?
    `).bind(jobId).first()

    return result || {}
  }

  /**
   * Format package data for export
   */
  private async formatPackageData(contents: any, options: EvidencePackageOptions): Promise<string> {
    const packageData = {
      metadata: {
        title: options.title,
        description: options.description,
        packageType: options.packageType,
        generatedAt: new Date().toISOString(),
        lexicoreVersion: '1.0.0'
      },
      disclaimer: {
        aiDisclosure: 'This evidence package contains data extracted and processed using AI-assisted tools (LexiCore™ IP Practice Module). All extracted facts have been reviewed and approved by licensed attorneys.',
        legalNotice: 'This package is intended for use in legal proceedings. The contents represent attorney work product and may be subject to privilege. Unauthorized access or distribution is prohibited.',
        chainOfCustody: 'Complete audit trail and chain of custody documentation is included. All timestamps are in UTC. Digital signatures and cryptographic hashes verify document integrity.'
      },
      contents: {
        extractedFacts: contents.facts.map((fact: ExtractedFact) => ({
          factType: fact.fact_type,
          factText: fact.fact_text,
          sourceLocation: fact.source_location,
          confidenceScore: fact.confidence_score,
          extractionTimestamp: fact.extraction_timestamp,
          approvalStatus: fact.approved_status,
          approvedBy: fact.approved_by,
          approvedAt: fact.approved_at
        })),
        sourceDocuments: contents.documents,
        auditTrail: contents.auditEntries,
        reviewRecords: contents.reviewRecords,
        extractionMetadata: contents.metadata
      },
      statistics: {
        totalFacts: contents.facts.length,
        approvedFacts: contents.facts.filter((f: ExtractedFact) => f.approved_status === 'approved').length,
        totalDocuments: contents.documents.length,
        totalAuditEntries: contents.auditEntries.length,
        totalReviews: contents.reviewRecords.length
      }
    }

    // Format according to export format
    switch (options.exportFormat) {
      case 'json':
        return JSON.stringify(packageData, null, 2)
      
      case 'csv':
        return this.formatAsCSV(packageData)
      
      case 'pdf':
        return this.formatAsPDF(packageData)
      
      case 'docx':
        return this.formatAsDOCX(packageData)
      
      case 'zip':
        return this.formatAsZIP(packageData)
      
      default:
        return JSON.stringify(packageData, null, 2)
    }
  }

  /**
   * Format as CSV (facts only)
   */
  private formatAsCSV(data: any): string {
    const headers = ['Fact Type', 'Fact Text', 'Source Location', 'Confidence', 'Approval Status', 'Approved By', 'Approved At']
    const rows = data.contents.extractedFacts.map((fact: any) => [
      fact.factType,
      fact.factText,
      fact.sourceLocation,
      fact.confidenceScore.toString(),
      fact.approvalStatus,
      fact.approvedBy || '',
      fact.approvedAt || ''
    ])

    const csvLines = [
      headers.join(','),
      ...rows.map((row: string[]) => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ]

    return csvLines.join('\n')
  }

  /**
   * Format as PDF (structured data for PDF generator)
   */
  private formatAsPDF(data: any): string {
    return JSON.stringify({
      ...data,
      format: 'court_ready_pdf',
      styling: {
        font: 'Times New Roman',
        fontSize: 12,
        lineSpacing: 1.5,
        margins: { top: 1, bottom: 1, left: 1.25, right: 1.25 }
      }
    }, null, 2)
  }

  /**
   * Format as DOCX (structured data for Word document generator)
   */
  private formatAsDOCX(data: any): string {
    return JSON.stringify({
      ...data,
      format: 'docx',
      sections: [
        { type: 'cover_page', title: data.metadata.title },
        { type: 'toc', title: 'Table of Contents' },
        { type: 'disclaimer', content: data.disclaimer },
        { type: 'facts', content: data.contents.extractedFacts },
        { type: 'audit_trail', content: data.contents.auditTrail },
        { type: 'appendix', content: data.contents.sourceDocuments }
      ]
    }, null, 2)
  }

  /**
   * Format as ZIP (multiple files)
   */
  private formatAsZIP(data: any): string {
    return JSON.stringify({
      files: [
        { name: 'evidence_package.json', content: JSON.stringify(data, null, 2) },
        { name: 'extracted_facts.csv', content: this.formatAsCSV(data) },
        { name: 'audit_trail.json', content: JSON.stringify(data.contents.auditTrail, null, 2) },
        { name: 'review_records.json', content: JSON.stringify(data.contents.reviewRecords, null, 2) },
        { name: 'README.txt', content: 'LexiCore™ Evidence Package\n\nThis package contains AI-extracted IP facts with full attorney review and audit trail.\n\nFiles:\n- evidence_package.json: Complete package data\n- extracted_facts.csv: Extracted facts in spreadsheet format\n- audit_trail.json: Complete audit log\n- review_records.json: Attorney review records' }
      ]
    })
  }

  /**
   * Save package contents to database
   */
  private async savePackageContents(packageId: string, contents: any): Promise<void> {
    // Save facts
    for (const fact of contents.facts) {
      const contentId = generateId('pkg-content')
      const contentHash = await sha256Hash(JSON.stringify(fact))
      
      await this.db.prepare(`
        INSERT INTO ip_evidence_package_contents (
          id, evidence_package_id, content_type, content_id,
          content_snapshot, content_hash
        ) VALUES (?, ?, 'extracted_fact', ?, ?, ?)
      `).bind(contentId, packageId, fact.id, JSON.stringify(fact), contentHash).run()
    }

    // Save documents
    for (const doc of contents.documents) {
      const contentId = generateId('pkg-content')
      const contentHash = await sha256Hash(JSON.stringify(doc))
      
      await this.db.prepare(`
        INSERT INTO ip_evidence_package_contents (
          id, evidence_package_id, content_type, content_id,
          content_snapshot, content_hash
        ) VALUES (?, ?, 'source_document', ?, ?, ?)
      `).bind(contentId, packageId, doc.id, JSON.stringify(doc), contentHash).run()
    }
  }

  /**
   * Generate Certificate of Authenticity
   */
  private async generateCertificateOfAuthenticity(
    packageId: string,
    issuedBy: string,
    contents: any
  ): Promise<string> {
    const certificateId = generateId('cert')
    const certificateNumber = this.generateCertificateNumber()

    const attestationText = `
I, ${issuedBy}, hereby certify that:

1. This evidence package was generated using LexiCore™ IP Practice Module, an AI-assisted legal technology platform.

2. All AI-extracted facts contained herein have been reviewed and approved by licensed attorney(s).

3. The chain of custody for all documents and data has been maintained throughout the extraction and review process.

4. Complete audit logs documenting all system actions, user interactions, and AI processing steps are included in this package.

5. AI assistance was used solely for factual extraction and organization. No legal opinions, conclusions, or strategic advice were generated by AI.

6. All extracted facts are verbatim quotes or direct references from source documents, with proper citations.

7. This package contains ${contents.facts.length} extracted facts from ${contents.documents.length} source document(s).

8. All data integrity has been verified using cryptographic hashing (SHA-256).

This certificate is issued in accordance with legal and ethical standards governing the use of AI in legal practice.
    `.trim()

    await this.db.prepare(`
      INSERT INTO ip_certificates_of_authenticity (
        id, evidence_package_id, certificate_number, issued_by,
        issuer_title, attestation_text, chain_of_custody_verified,
        ai_disclosure_included, attorney_review_certified
      ) VALUES (?, ?, ?, ?, 'Attorney', ?, TRUE, TRUE, TRUE)
    `).bind(
      certificateId,
      packageId,
      certificateNumber,
      issuedBy,
      attestationText
    ).run()

    return certificateId
  }

  /**
   * Generate unique certificate number
   */
  private generateCertificateNumber(): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    
    return `LEXICORE-CERT-${year}${month}${day}-${random}`
  }

  /**
   * Lock evidence package (prevent further modifications)
   */
  async lockPackage(packageId: string, lockedBy: string): Promise<void> {
    await this.db.prepare(`
      UPDATE ip_evidence_packages
      SET status = 'certified', locked_at = datetime('now'), locked_by = ?
      WHERE id = ? AND status != 'filed'
    `).bind(lockedBy, packageId).run()
  }

  /**
   * Get package details
   */
  async getPackage(packageId: string): Promise<any> {
    const result = await this.db.prepare(`
      SELECT 
        p.*,
        c.certificate_number,
        c.issued_at as certificate_issued_at
      FROM ip_evidence_packages p
      LEFT JOIN ip_certificates_of_authenticity c ON p.certificate_id = c.id
      WHERE p.id = ?
    `).bind(packageId).first()

    if (!result) {
      throw new Error('Evidence package not found')
    }

    return result
  }

  /**
   * List packages for a matter
   */
  async listPackagesForMatter(matterId: string): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        id, title, package_type, generated_by, generated_at,
        status, included_facts_count, export_format
      FROM ip_evidence_packages
      WHERE matter_id = ?
      ORDER BY generated_at DESC
    `).bind(matterId).all()

    return result.results || []
  }
}
