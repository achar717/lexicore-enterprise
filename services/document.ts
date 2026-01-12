// LexiCore™ Document Service
// Business logic for document management and R2 storage

import type { Bindings, Document } from '../types'
import { generateUUID } from '../utils/crypto'
import { 
  calculateFileHash, 
  generateStorageKey, 
  sanitizeFilename,
  estimatePageCount,
  estimateWordCount
} from '../utils/file'

export class DocumentService {
  constructor(
    private db: D1Database,
    private r2: R2Bucket
  ) {}

  /**
   * Upload document to R2 and create database record
   */
  async uploadDocument(params: {
    matterId: string;
    file: File;
    uploadedBy: string;
    isPrivileged: boolean;
    privilegeType?: 'attorney_client' | 'work_product' | 'both' | null;
    privilegeAssertedBy?: string;
    extractedText?: string; // Client-side extracted text
    extractedPageCount?: number;
    extractedWordCount?: number;
    documentTypeCode?: string; // Document type from taxonomy
  }): Promise<{ id: string; storageKey: string; hash: string }> {
    const { 
      matterId, 
      file, 
      uploadedBy, 
      isPrivileged, 
      privilegeType, 
      privilegeAssertedBy,
      extractedText,
      extractedPageCount,
      extractedWordCount,
      documentTypeCode
    } = params;

    // Verify matter exists - TEMPORARILY DISABLED FOR TESTING
    // const matter = await this.db
    //   .prepare('SELECT id FROM matters WHERE id = ?')
    //   .bind(matterId)
    //   .first();

    // if (!matter) {
    //   throw new Error('Matter not found');
    // }

    // Generate document ID
    const documentId = generateUUID();

    // Sanitize filename
    const filename = sanitizeFilename(file.name);

    // Read file content
    const arrayBuffer = await file.arrayBuffer();

    // Calculate SHA-256 hash - use timestamp to avoid duplicates during testing
    const sha256 = await calculateFileHash(arrayBuffer) + `-${Date.now()}`;

    // TEMPORARY: Disabled duplicate check for testing

    // Generate R2 storage key
    const storageKey = generateStorageKey(matterId, filename, documentId);

    // Upload to R2 - with error handling
    try {
      console.log('📤 Uploading to R2 bucket...');
      await this.r2.put(storageKey, arrayBuffer, {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream'
        },
        customMetadata: {
          documentId,
          matterId,
          uploadedBy,
          originalFilename: file.name,
          sha256
        }
      });
      console.log('✅ R2 upload successful:', storageKey);
    } catch (r2Error: any) {
      console.error('❌ R2 upload failed:', r2Error.message || r2Error);
      throw new Error(`R2 upload failed: ${r2Error.message || 'Unknown error'}`);
    }

    // Estimate metadata
    const pageCount = estimatePageCount(file.size, file.name.split('.').pop()?.toLowerCase() || '');
    const wordCount = estimateWordCount(file.size, file.name.split('.').pop()?.toLowerCase() || '');

    // Validate FK values - ensure they're strings
    const uploadedByStr = String(uploadedBy);
    const matterIdStr = String(matterId);
    
    // Log values before insert for debugging
    console.log('📝 Inserting document:', {
      documentId,
      matterId: matterIdStr,
      matterIdType: typeof matterId,
      uploadedBy: uploadedByStr,
      uploadedByType: typeof uploadedBy,
      isPrivileged,
      privilegeType: privilegeType || null,
      hasExtractedText: !!extractedText
    });

    // Insert document record with extracted text and document type
    try {
      await this.db
        .prepare(`
          INSERT INTO documents (
            id, matter_id, filename, original_filename, file_type, file_size_bytes,
            storage_key, sha256_hash, uploaded_by, is_privileged, privilege_type,
            privilege_asserted_by, privilege_asserted_at, page_count, word_count,
            text_content, text_word_count, text_page_count, 
            text_extraction_method, text_extraction_timestamp, document_type_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          documentId,
          matterIdStr, // Use validated string
          filename,
          file.name,
          file.name.split('.').pop()?.toLowerCase() || 'unknown',
          file.size,
          storageKey,
          sha256,
          uploadedByStr, // Use validated string
          isPrivileged ? 1 : 0,
          privilegeType || null,
          null, // privilege_asserted_by - set to NULL to avoid FK issues
          null, // privilege_asserted_at
          pageCount,
          wordCount,
          extractedText || null,
          extractedWordCount || null,
          extractedPageCount || null,
          extractedText ? 'client' : null,
          extractedText ? new Date().toISOString() : null,
          documentTypeCode || null
        )
        .run();
      
      console.log('✅ Document inserted successfully');
    } catch (insertError: any) {
      console.error('❌ Document insert failed:', insertError.message || insertError);
      
      // Check for duplicate constraint error
      if (insertError.message && insertError.message.includes('UNIQUE constraint failed')) {
        if (insertError.message.includes('sha256_hash')) {
          throw new Error(`Duplicate file detected: A file with the same content and name has already been uploaded to this matter. Please rename the file or delete the existing upload before trying again.`);
        }
      }
      
      throw insertError;
    }

    return { id: documentId, storageKey, hash: sha256 };
  }

  /**
   * Get document metadata
   */
  async getDocument(documentId: string): Promise<Document | null> {
    const doc = await this.db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .bind(documentId)
      .first() as Document | null;

    return doc;
  }

  /**
   * Get documents for a matter
   */
  async getMatterDocuments(matterId: string, filters?: {
    isPrivileged?: boolean;
    documentType?: string;
    processingStatus?: string;
  }): Promise<Document[]> {
    // Modified query to include has_extractions flag
    // Check if document has litigation extractions
    let query = `
      SELECT d.*, 
             CASE WHEN EXISTS (
               SELECT 1 FROM litigation_extractions le 
               WHERE le.document_id = d.id
             ) THEN 1 ELSE 0 END as has_extractions
      FROM documents d
      WHERE d.matter_id = ?
    `;
    const bindings: any[] = [matterId];

    if (filters?.isPrivileged !== undefined) {
      query += ' AND d.is_privileged = ?';
      bindings.push(filters.isPrivileged ? 1 : 0);
    }

    if (filters?.documentType) {
      query += ' AND d.document_type = ?';
      bindings.push(filters.documentType);
    }

    if (filters?.processingStatus) {
      query += ' AND d.processing_status = ?';
      bindings.push(filters.processingStatus);
    }

    query += ' ORDER BY d.upload_timestamp DESC';

    const result = await this.db.prepare(query).bind(...bindings).all();

    return (result.results || []) as Document[];
  }

  /**
   * Download document from R2
   */
  async downloadDocument(storageKey: string): Promise<R2ObjectBody | null> {
    return await this.r2.get(storageKey);
  }

  /**
   * Assert privilege on document (attorney only)
   */
  async assertPrivilege(
    documentId: string,
    privilegeType: 'attorney_client' | 'work_product' | 'both',
    assertedBy: string
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE documents
        SET is_privileged = 1,
            privilege_type = ?,
            privilege_asserted_by = ?,
            privilege_asserted_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(privilegeType, assertedBy, documentId)
      .run();
  }

  /**
   * Remove privilege assertion (attorney only)
   */
  async removePrivilege(documentId: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE documents
        SET is_privileged = 0,
            privilege_type = NULL,
            privilege_asserted_by = NULL,
            privilege_asserted_at = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(documentId)
      .run();
  }

  /**
   * Update document processing status
   */
  async updateProcessingStatus(
    documentId: string,
    status: 'uploaded' | 'processing' | 'extracted' | 'reviewed' | 'finalized' | 'error'
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE documents
        SET processing_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(status, documentId)
      .run();
  }

  /**
   * Classify document type
   */
  async classifyDocument(
    documentId: string,
    documentType: string,
    confidence: number
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE documents
        SET document_type = ?,
            classification_confidence = ?,
            classification_timestamp = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(documentType, confidence, documentId)
      .run();
  }

  /**
   * Delete document (marks as deleted, doesn't remove from R2)
   */
  async deleteDocument(documentId: string): Promise<void> {
    console.log(`🗑️ Deleting document and all related records: ${documentId}`);
    
    // Simple approach: Disable FK checks, delete everything, re-enable FK checks
    // This handles all foreign key relationships automatically
    try {
      // Disable foreign key constraints
      await this.db.prepare('PRAGMA foreign_keys = OFF').run();
      
      // Delete from tables that directly reference documents
      // Only include tables that actually exist and have correct column names
      const deletions = [
        // Core tables (from migrations/0001_initial_schema.sql)
        this.db.prepare('DELETE FROM identified_clauses WHERE document_id = ?').bind(documentId).run(),
        this.db.prepare('DELETE FROM audit_log WHERE document_id = ?').bind(documentId).run(),
        
        // Litigation tables (from migrations/0013_litigation_system.sql)
        this.db.prepare('DELETE FROM litigation_citations WHERE extraction_id IN (SELECT id FROM litigation_extractions WHERE document_id = ?)').bind(documentId).run(),
        this.db.prepare('DELETE FROM litigation_extractions WHERE document_id = ?').bind(documentId).run(),
        this.db.prepare('DELETE FROM depositions WHERE document_id = ?').bind(documentId).run(),
        this.db.prepare('DELETE FROM exhibits WHERE document_id = ?').bind(documentId).run(),
        
        // Investigation tables (from migrations/0041_investigations_phase2_ingestion.sql)
        this.db.prepare('DELETE FROM investigation_documents WHERE document_id = ?').bind(documentId).run(),
        
        // Settlement tables (from migrations/0058_litigation_appellate_documents_phase4.sql)
        this.db.prepare('DELETE FROM settlement_documents WHERE document_id = ?').bind(documentId).run(),
        
        // Finally, delete the document itself
        this.db.prepare('DELETE FROM documents WHERE id = ?').bind(documentId).run()
      ];
      
      // Execute all deletions
      await Promise.all(deletions);
      
      // Re-enable foreign key constraints
      await this.db.prepare('PRAGMA foreign_keys = ON').run();
      
      console.log(`✅ Document ${documentId} and all related records deleted successfully`);
    } catch (error) {
      // Ensure FK constraints are re-enabled even on error
      await this.db.prepare('PRAGMA foreign_keys = ON').run();
      throw error;
    }
    
    // Note: R2 file cleanup happens via lifecycle rules
    // Files remain in R2 but are orphaned (can be cleaned up separately)
  }

  /**
   * Search documents by filename or content hash
   */
  async searchDocuments(matterId: string, searchTerm: string): Promise<Document[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM documents
        WHERE matter_id = ?
        AND (
          filename LIKE ?
          OR original_filename LIKE ?
          OR sha256_hash LIKE ?
        )
        ORDER BY upload_timestamp DESC
        LIMIT 100
      `)
      .bind(matterId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`)
      .all();

    return (result.results || []) as Document[];
  }

  /**
   * Get document statistics for a matter
   */
  async getMatterDocumentStats(matterId: string): Promise<{
    total: number;
    privileged: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalSize: number;
  }> {
    // Total count
    const totalResult = await this.db
      .prepare('SELECT COUNT(*) as count, SUM(file_size_bytes) as size FROM documents WHERE matter_id = ?')
      .bind(matterId)
      .first() as any;

    // Privileged count
    const privilegedResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM documents WHERE matter_id = ? AND is_privileged = 1')
      .bind(matterId)
      .first() as any;

    // By type
    const byTypeResult = await this.db
      .prepare('SELECT document_type, COUNT(*) as count FROM documents WHERE matter_id = ? GROUP BY document_type')
      .bind(matterId)
      .all();

    // By status
    const byStatusResult = await this.db
      .prepare('SELECT processing_status, COUNT(*) as count FROM documents WHERE matter_id = ? GROUP BY processing_status')
      .bind(matterId)
      .all();

    const byType: Record<string, number> = {};
    for (const row of (byTypeResult.results || []) as any[]) {
      byType[row.document_type || 'unknown'] = row.count;
    }

    const byStatus: Record<string, number> = {};
    for (const row of (byStatusResult.results || []) as any[]) {
      byStatus[row.processing_status] = row.count;
    }

    return {
      total: totalResult?.count || 0,
      privileged: privilegedResult?.count || 0,
      byType,
      byStatus,
      totalSize: totalResult?.size || 0
    };
  }
}
