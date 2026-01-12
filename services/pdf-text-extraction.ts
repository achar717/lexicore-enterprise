/**
 * LexiCore™ PDF Text Extraction Service
 * 
 * IMPORTANT LIMITATION:
 * Cloudflare Workers runtime does not support native PDF parsing libraries
 * (pdfjs-dist, pdf-parse, etc.) as they require browser APIs (DOMMatrix, Canvas)
 * or Node.js native modules that don't exist in the Workers environment.
 * 
 * SOLUTION OPTIONS:
 * 1. Use external PDF API service (e.g., Adobe PDF Services, AWS Textract)
 * 2. Extract text during upload (before sending to Workers)
 * 3. Use a separate service for PDF processing
 * 
 * For now, this service provides fallback behavior and documents the limitation.
 */

/**
 * Extract text from PDF file
 * 
 * NOTE: PDF text extraction is NOT currently supported in Cloudflare Workers runtime.
 * This function throws an error with instructions for alternatives.
 * 
 * @param pdfBuffer - PDF file as Uint8Array
 * @throws Error explaining PDF extraction limitation
 */
export async function extractTextFromPDF(
  pdfBuffer: Uint8Array
): Promise<never> {
  console.log('⚠️ PDF text extraction requested but not supported in Workers runtime')
  console.log('📄 PDF size:', pdfBuffer.length, 'bytes')
  
  throw new Error(
    'PDF text extraction not available in Cloudflare Workers. ' +
    'To extract from PDFs: (1) Use external PDF API service, ' +
    '(2) Extract text before upload, or (3) Upload as text file. ' +
    'For now, extraction will use document metadata and filename only.'
  )
}

/**
 * Extract text from DOCX file (basic text extraction)
 * Note: For full DOCX support, consider using mammoth.js or similar
 */
export async function extractTextFromDOCX(
  docxBuffer: Uint8Array
): Promise<string> {
  console.log('📄 DOCX text extraction requested, size:', docxBuffer.length, 'bytes')
  
  // Basic DOCX is a ZIP file with XML content
  // For now, return placeholder - full implementation would require mammoth.js or similar
  throw new Error('DOCX text extraction not yet implemented. Please convert to PDF or upload as text file.')
}

/**
 * Extract text from any supported document type
 */
export async function extractDocumentText(
  buffer: Uint8Array,
  fileType?: string
): Promise<{ success: boolean; text?: string; pageCount?: number; error?: string }> {
  try {
    const type = (fileType || '').toLowerCase()

    // PDF files - use PDF.co API
    if (type.includes('pdf') || type === 'application/pdf') {
      console.log('📄 PDF detected, attempting extraction via PDF.co...')
      
      // Try PDF.co if API key is available
      const pdfcoApiKey = process.env.PDFCO_API_KEY || ''
      
      if (pdfcoApiKey) {
        const { extractTextViaPDFcoWithRetry } = await import('./pdfco-extraction')
        try {
          const text = await extractTextViaPDFcoWithRetry(buffer, pdfcoApiKey)
          console.log('✅ PDF.co extraction successful:', text.length, 'characters')
          return {
            success: true,
            text,
            pageCount: undefined // PDF.co doesn't return page count in sync mode
          }
        } catch (pdfcoError) {
          console.error('❌ PDF.co extraction failed:', pdfcoError)
          return {
            success: false,
            error: `PDF text extraction failed: ${pdfcoError instanceof Error ? pdfcoError.message : String(pdfcoError)}`
          }
        }
      } else {
        console.warn('⚠️ PDF.co API key not configured, extraction skipped')
        return {
          success: false,
          error: 'PDF text extraction not configured. Please set PDFCO_API_KEY environment variable.'
        }
      }
    }

    // Text files
    if (type.includes('text') || type === 'text/plain' || type === 'txt') {
      const text = new TextDecoder().decode(buffer)
      return { success: true, text }
    }

    // DOCX files
    if (type.includes('docx') || type.includes('officedocument.wordprocessingml')) {
      return {
        success: false,
        error: 'DOCX text extraction not yet implemented. Please convert to PDF or upload as text file.'
      }
    }

    // DOC files (old Word format)
    if (type.includes('msword') || type === 'doc') {
      return {
        success: false,
        error: 'Legacy DOC format not supported. Please convert to PDF or DOCX.'
      }
    }

    // Unsupported file type
    return {
      success: false,
      error: `Unsupported file type for text extraction: ${fileType || 'unknown'}`
    }
  } catch (error) {
    console.error('❌ Document text extraction error:', error)
    return {
      success: false,
      error: `Extraction error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
