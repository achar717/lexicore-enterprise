/**
 * LexiCore™ PDF.co API Integration
 * External PDF text extraction service
 */

interface PDFcoExtractionResult {
  text: string
  pageCount?: number
  url?: string
  error?: string
}

/**
 * Extract text from PDF using PDF.co API
 * @param pdfBuffer - PDF file as Uint8Array
 * @param apiKey - PDF.co API key
 * @returns Extracted text
 */
export async function extractTextViaPDFco(
  pdfBuffer: Uint8Array,
  apiKey: string
): Promise<string> {
  console.log('🔷 Starting PDF.co text extraction, size:', pdfBuffer.length, 'bytes')

  try {
    // Convert Uint8Array to base64
    let binary = ''
    const len = pdfBuffer.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(pdfBuffer[i])
    }
    const base64Data = btoa(binary)
    
    console.log('📤 Sending PDF to PDF.co API...')

    // Call PDF.co text extraction API
    const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        async: false, // Synchronous extraction
        inline: true,  // Return text in response
        file: base64Data,
        pages: '',     // Extract all pages
        lineGrouping: true // Group text by lines for better formatting
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ PDF.co API error:', response.status, errorText)
      throw new Error(`PDF.co API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as PDFcoExtractionResult

    // Check for errors in response
    if (data.error) {
      console.error('❌ PDF.co returned error:', data.error)
      throw new Error(`PDF.co error: ${data.error}`)
    }

    // Extract text from response
    const extractedText = data.text || data.body || ''
    
    if (!extractedText) {
      console.warn('⚠️ PDF.co returned empty text')
      throw new Error('PDF.co returned empty text')
    }

    console.log('✅ PDF.co extraction successful:', {
      textLength: extractedText.length,
      pageCount: data.pageCount,
      hasUrl: !!data.url
    })

    return extractedText.trim()

  } catch (error) {
    console.error('❌ PDF.co extraction failed:', error)
    throw new Error(`PDF.co extraction failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract text from PDF with retry logic
 */
export async function extractTextViaPDFcoWithRetry(
  pdfBuffer: Uint8Array,
  apiKey: string,
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔷 PDF.co extraction attempt ${attempt}/${maxRetries}`)
      const text = await extractTextViaPDFco(pdfBuffer, apiKey)
      return text
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`⚠️ Attempt ${attempt} failed:`, lastError.message)
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000
        console.log(`⏳ Waiting ${waitTime}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }
  
  throw lastError || new Error('PDF.co extraction failed after retries')
}
