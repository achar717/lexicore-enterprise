/**
 * Simple AI Provider Wrapper for Drafting
 * Bypasses complex retry/cache logic to avoid timeouts
 */

import { AIProviderService, type AIMessage } from './ai-providers'

export class SimpleDraftingAIProvider {
  private baseProvider: AIProviderService

  constructor(env: any) {
    this.baseProvider = new AIProviderService({
      openai: env.OPENAI_API_KEY ? {
        apiKey: env.OPENAI_API_KEY,
        model: 'gpt-4o-mini'
      } : undefined,
      gemini: env.GEMINI_API_KEY ? {
        apiKey: env.GEMINI_API_KEY,
        model: 'gemini-1.5-flash'
      } : undefined,
      defaultProvider: 'openai',
      fallbackEnabled: true
    })
  }

  /**
   * Generate text from prompt (simplified, no caching/retry)
   */
  async generateText(
    prompt: string,
    options?: {
      temperature?: number
      maxTokens?: number
      responseFormat?: 'text' | 'json'
      provider?: 'openai' | 'gemini'
      model?: string
    }
  ): Promise<string> {
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ]

    try {
      const response = await this.baseProvider.generateCompletion(
        messages,
        {
          provider: options?.provider,
          temperature: options?.temperature ?? 0.7,
          maxTokens: options?.maxTokens ?? 2000,
          model: options?.model,
          jsonMode: options?.responseFormat === 'json'
        }
      )

      return response.content
    } catch (error: any) {
      console.error('AI generation error:', error)
      throw new Error(`AI generation failed: ${error.message}`)
    }
  }
}
