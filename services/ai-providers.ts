/**
 * LexiCore™ - AI Provider Service
 * Multi-provider AI integration supporting OpenAI, Gemini, and future providers
 * 
 * FEATURES:
 * - Multiple AI provider support (OpenAI, Gemini)
 * - Provider fallback and redundancy
 * - Cost optimization (route to cheapest provider)
 * - Performance monitoring
 * - Provider health checks
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  content: string
  model: string
  provider: string
  tokensUsed?: number
  promptTokens?: number
  completionTokens?: number
  confidence?: number
  finishReason?: string
}

export interface AIProviderConfig {
  openai?: {
    apiKey: string
    model?: string // default: gpt-4o-mini
    baseUrl?: string
  }
  gemini?: {
    apiKey: string
    model?: string // default: gemini-1.5-flash
  }
  defaultProvider?: 'openai' | 'gemini'
  fallbackEnabled?: boolean
}

export class AIProviderService {
  private config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = {
      defaultProvider: config.defaultProvider || 'openai',
      fallbackEnabled: config.fallbackEnabled !== false,
      ...config
    }
  }

  /**
   * Generate AI completion using specified or default provider
   */
  async generateCompletion(
    messages: AIMessage[],
    options?: {
      provider?: 'openai' | 'gemini'
      temperature?: number
      maxTokens?: number
      model?: string
      jsonMode?: boolean  // Enable JSON response format
    }
  ): Promise<AIResponse> {
    const provider = options?.provider || this.config.defaultProvider || 'openai'

    console.log('🤖 AI Provider Service - generateCompletion called:', {
      requestedProvider: provider,
      hasOpenAI: !!this.config.openai,
      hasGemini: !!this.config.gemini,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens
    })

    try {
      if (provider === 'openai' && this.config.openai) {
        console.log('✅ Using OpenAI for completion')
        return await this.openAICompletion(messages, options)
      } else if (provider === 'gemini' && this.config.gemini) {
        console.log('✅ Using Gemini for completion')
        return await this.geminiCompletion(messages, options)
      } else {
        throw new Error(`Provider ${provider} not configured`)
      }
    } catch (error) {
      // Try fallback provider if enabled
      if (this.config.fallbackEnabled) {
        const fallbackProvider = provider === 'openai' ? 'gemini' : 'openai'
        console.warn(`${provider} failed, trying fallback to ${fallbackProvider}`)
        
        try {
          if (fallbackProvider === 'openai' && this.config.openai) {
            return await this.openAICompletion(messages, options)
          } else if (fallbackProvider === 'gemini' && this.config.gemini) {
            return await this.geminiCompletion(messages, options)
          }
        } catch (fallbackError) {
          console.error('Fallback provider also failed:', fallbackError)
        }
      }
      
      throw error
    }
  }

  /**
   * OpenAI API completion
   */
  private async openAICompletion(
    messages: AIMessage[],
    options?: {
      temperature?: number
      maxTokens?: number
      model?: string
      jsonMode?: boolean
    }
  ): Promise<AIResponse> {
    if (!this.config.openai?.apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const model = options?.model || this.config.openai.model || 'gpt-4o-mini'
    const baseUrl = this.config.openai.baseUrl || 'https://api.openai.com/v1'
    const maxTokens = options?.maxTokens || 2000

    console.log('🔧 OpenAI Request Config:', {
      model,
      temperature: options?.temperature || 0.7,
      max_tokens: maxTokens,
      messagesCount: messages.length
    })

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openai.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: maxTokens,
        ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {})
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as any

    console.log('🤖 OpenAI Response:', {
      finishReason: data.choices[0].finish_reason,
      tokensUsed: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      contentLength: data.choices[0].message.content.length
    })

    if (data.choices[0].finish_reason === 'length') {
      console.warn('⚠️ OpenAI response was truncated due to max_tokens limit!')
    }

    return {
      content: data.choices[0].message.content,
      model: data.model,
      provider: 'openai',
      tokensUsed: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      finishReason: data.choices[0].finish_reason
    }
  }

  /**
   * Google Gemini API completion
   */
  private async geminiCompletion(
    messages: AIMessage[],
    options?: {
      temperature?: number
      maxTokens?: number
      model?: string
    }
  ): Promise<AIResponse> {
    if (!this.config.gemini?.apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const model = options?.model || this.config.gemini.model || 'gemini-1.5-flash'
    
    // Convert messages to Gemini format
    const systemMessage = messages.find(m => m.role === 'system')?.content || ''
    const conversationMessages = messages.filter(m => m.role !== 'system')
    
    // Gemini API format
    const contents = conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))

    // Add system message as first user message if present
    if (systemMessage) {
      contents.unshift({
        role: 'user',
        parts: [{ text: systemMessage }]
      })
    }

    console.log('🔷 Calling Gemini API:', {
      model,
      temperature: options?.temperature || 0.7,
      maxTokens: options?.maxTokens || 2000
    })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.config.gemini.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature || 0.7,
            maxOutputTokens: options?.maxTokens || 2000
          }
        })
      }
    )

    console.log('✅ Gemini API response received:', {
      status: response.status,
      ok: response.ok
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Gemini API error:', error)
      throw new Error(`Gemini API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as any

    console.log('✅ Gemini completion successful:', {
      provider: 'gemini',
      model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
      finishReason: data.candidates[0].finishReason,
      contentLength: data.candidates[0].content.parts[0].text.length
    })

    return {
      content: data.candidates[0].content.parts[0].text,
      model,
      provider: 'gemini',
      tokensUsed: data.usageMetadata?.totalTokenCount,
      promptTokens: data.usageMetadata?.promptTokenCount,
      completionTokens: data.usageMetadata?.candidatesTokenCount,
      finishReason: data.candidates[0].finishReason
    }
  }

  /**
   * Extract structured data from document using AI
   */
  async extractDocumentData(
    documentText: string,
    extractionPrompt: string,
    options?: {
      provider?: 'openai' | 'gemini'
      model?: string
    }
  ): Promise<any> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a legal document analysis assistant. Extract information accurately and provide source citations.'
      },
      {
        role: 'user',
        content: `${extractionPrompt}\n\nDocument:\n${documentText}`
      }
    ]

    const response = await this.generateCompletion(messages, options)

    try {
      // Try to parse as JSON
      return JSON.parse(response.content)
    } catch {
      // If not JSON, return structured response
      return {
        extracted_data: response.content,
        model: response.model,
        provider: response.provider
      }
    }
  }

  /**
   * Classify document type using AI
   */
  async classifyDocument(
    documentText: string,
    options?: {
      provider?: 'openai' | 'gemini'
    }
  ): Promise<{
    documentType: string
    subtype: string
    confidence: number
    reasoning: string
  }> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a legal document classifier. Classify the document and respond in JSON format:
{
  "documentType": "contract|brief|correspondence|discovery|regulatory|other",
  "subtype": "specific document subtype",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`
      },
      {
        role: 'user',
        content: `Classify this document:\n\n${documentText.substring(0, 3000)}`
      }
    ]

    const response = await this.generateCompletion(messages, {
      ...options,
      temperature: 0.3 // Lower temperature for classification
    })

    return JSON.parse(response.content)
  }

  /**
   * Check provider health
   */
  async checkProviderHealth(provider: 'openai' | 'gemini'): Promise<boolean> {
    try {
      const testMessages: AIMessage[] = [
        { role: 'user', content: 'Hello' }
      ]

      await this.generateCompletion(testMessages, {
        provider,
        maxTokens: 10
      })

      return true
    } catch (error) {
      console.error(`Provider ${provider} health check failed:`, error)
      return false
    }
  }

  /**
   * Get provider cost estimate (tokens * cost per token)
   */
  estimateCost(provider: 'openai' | 'gemini', tokens: number): number {
    // Approximate costs (USD per 1M tokens)
    const costs = {
      openai: {
        'gpt-4o-mini': { input: 0.15, output: 0.6 },
        'gpt-4o': { input: 2.5, output: 10 }
      },
      gemini: {
        'gemini-1.5-flash': { input: 0.075, output: 0.3 },
        'gemini-1.5-pro': { input: 1.25, output: 5 }
      }
    }

    // Use default models for estimation
    const modelCost = provider === 'openai' 
      ? costs.openai['gpt-4o-mini']
      : costs.gemini['gemini-1.5-flash']

    // Average input/output for estimation
    const avgCost = (modelCost.input + modelCost.output) / 2
    return (tokens / 1_000_000) * avgCost
  }

  /**
   * Choose optimal provider based on criteria
   */
  selectProvider(criteria: 'cost' | 'speed' | 'quality'): 'openai' | 'gemini' {
    switch (criteria) {
      case 'cost':
        // Gemini is generally cheaper
        return this.config.gemini ? 'gemini' : 'openai'
      case 'speed':
        // Gemini Flash is very fast
        return this.config.gemini ? 'gemini' : 'openai'
      case 'quality':
        // OpenAI GPT-4 series for highest quality
        return this.config.openai ? 'openai' : 'gemini'
      default:
        return this.config.defaultProvider || 'openai'
    }
  }

  /**
   * Extract text from image/scanned PDF using Gemini Vision (OCR)
   * 
   * @param imageData - Base64 encoded image data or ArrayBuffer
   * @param mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png', 'application/pdf')
   * @param options - Additional OCR options
   * @returns Extracted text content
   */
  async extractTextFromImage(
    imageData: string | ArrayBuffer,
    mimeType: string,
    options?: {
      language?: string
      includePageNumbers?: boolean
      preserveFormatting?: boolean
    }
  ): Promise<{
    text: string
    pageCount?: number
    confidence?: number
  }> {
    if (!this.config.gemini?.apiKey) {
      throw new Error('Gemini API key required for OCR. Please configure GEMINI_API_KEY.')
    }

    // Convert ArrayBuffer to base64 if needed
    let base64Data: string
    if (typeof imageData === 'string') {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,...")
      base64Data = imageData.replace(/^data:[^;]+;base64,/, '')
    } else {
      // Convert ArrayBuffer to base64 using modern approach (no btoa limit)
      const uint8Array = new Uint8Array(imageData)
      const chunks: string[] = []
      const chunkSize = 0x8000 // 32KB chunks
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length))
        chunks.push(String.fromCharCode(...chunk))
      }
      
      try {
        base64Data = btoa(chunks.join(''))
      } catch (e) {
        // Fallback: use smaller chunks if still failing
        base64Data = ''
        for (const chunk of chunks) {
          base64Data += btoa(chunk)
        }
      }
    }

    const model = this.config.gemini.model || 'gemini-1.5-flash'

    console.log('🔍 Gemini Vision OCR:', {
      model,
      mimeType,
      dataLength: base64Data.length,
      language: options?.language || 'en'
    })

    // Create OCR prompt
    const ocrPrompt = `Extract ALL text from this document image. 

INSTRUCTIONS:
- Extract every word, number, and symbol visible in the image
- Preserve the original text layout and structure as much as possible
- ${options?.includePageNumbers ? 'Include page numbers if visible' : 'Exclude page numbers'}
- ${options?.preserveFormatting ? 'Maintain line breaks and formatting' : 'Output as continuous text'}
- If the document is in a language other than English, specify: "${options?.language || 'auto-detect'}"
- For legal documents, maintain exact wording and citations
- If text is unclear or partially obscured, mark it with [unclear]

Output ONLY the extracted text, no commentary or analysis.`

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.config.gemini.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: ocrPrompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1, // Low temperature for accurate extraction
              maxOutputTokens: 8000 // Allow long documents
            }
          })
        }
      )

      if (!response.ok) {
        const error = await response.text()
        console.error('❌ Gemini Vision OCR error:', error)
        throw new Error(`Gemini Vision API error: ${response.status} - ${error}`)
      }

      const data = await response.json() as any

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini Vision returned no results')
      }

      const extractedText = data.candidates[0].content.parts[0].text

      console.log('✅ Gemini Vision OCR complete:', {
        textLength: extractedText.length,
        wordCount: extractedText.split(/\s+/).filter(w => w.length > 0).length,
        tokensUsed: data.usageMetadata?.totalTokenCount
      })

      return {
        text: extractedText.trim(),
        confidence: data.candidates[0].finishReason === 'STOP' ? 0.9 : 0.7
      }

    } catch (error: any) {
      console.error('❌ Gemini Vision OCR failed:', error)
      throw new Error(`OCR extraction failed: ${error.message}`)
    }
  }
}

/**
 * Example usage:
 * 
 * const aiService = new AIProviderService({
 *   openai: {
 *     apiKey: env.OPENAI_API_KEY,
 *     model: 'gpt-4o-mini'
 *   },
 *   gemini: {
 *     apiKey: env.GEMINI_API_KEY,
 *     model: 'gemini-1.5-flash'
 *   },
 *   defaultProvider: 'gemini',
 *   fallbackEnabled: true
 * })
 * 
 * // Use default provider (Gemini)
 * const response = await aiService.generateCompletion(messages)
 * 
 * // Explicitly use OpenAI
 * const response = await aiService.generateCompletion(messages, { provider: 'openai' })
 * 
 * // Extract document data with Gemini
 * const data = await aiService.extractDocumentData(text, prompt, { provider: 'gemini' })
 * 
 * // OCR from scanned PDF/image
 * const ocrResult = await aiService.extractTextFromImage(imageData, 'image/jpeg')
 */
