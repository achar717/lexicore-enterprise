/**
 * LexiCore™ AI Summarization Service
 * Multi-provider AI document summarization with legal-specific prompts
 */

import { AIProviderService, AIMessage } from './ai-providers'

interface SummarizationOptions {
  documentName: string;
  matterName: string;
  matterNumber: string;
  documentType?: string;
  extractedText?: string; // Optional: actual PDF text when available
}

interface ShortSummary {
  problem: string;
  bottomLine: string;
  soWhat: string;
  fullSummary: string;
  keyPoints: string[];
  wordCount: number;
  confidenceScore: number;
}

interface LongSummary {
  executiveSummary: string;
  logicalChain: string[];
  evidenceHierarchy: string;
  scopeAndLimitations: string;
  structuralSignposting: string[];
  fullSummary: string;
  keyFindings: string[];
  wordCount: number;
  confidenceScore: number;
}

/**
 * Generate executive summary (short)
 * Target: Decision-maker with 60 seconds to spare
 */
export async function generateShortSummary(
  options: SummarizationOptions,
  providerConfig: {
    openaiApiKey?: string
    geminiApiKey?: string
    defaultProvider?: 'openai' | 'gemini'
    fallbackEnabled?: boolean
  }
): Promise<ShortSummary> {
  const systemPrompt = `You are a senior legal analyst preparing an executive summary for a busy attorney.

CRITICAL RULES:
1. READ THE ENTIRE DOCUMENT TEXT CAREFULLY before generating summary
2. EXTRACT SPECIFIC FACTS, NAMES, DATES, AMOUNTS from the actual document
3. QUOTE KEY PHRASES verbatim when important (use "quotation marks")
4. NEVER make up information - only use what's in the document
5. If document text is missing or insufficient, clearly state that

OUTPUT REQUIREMENTS:
1. **The Problem/Context**: State the specific issue from THIS document in one clear sentence
2. **The Bottom Line**: The actual conclusion, decision, or finding from THIS document
3. **The "So What?"**: Real implications based on what's in THIS document (deadlines, amounts, parties affected)
4. **Key Points**: 4-6 specific, factual points extracted from THIS document
5. **Tone**: Objective, factual, professional
6. **Length**: Dense, specific, 1-3 paragraphs maximum

EXAMPLES OF GOOD VS BAD:
❌ BAD: "This audit document reviews compliance matters"
✅ GOOD: "Springfield School District audit (June 2023) found $125,000 in IDEA Part B compliance violations affecting 23% of IEP cases"

❌ BAD: "The parties have a dispute"
✅ GOOD: "Plaintiff John Doe v. ABC Corporation seeks $2.5M for breach of employment contract dated January 15, 2023"`

  const userPrompt = `Analyze this specific document and provide a factual executive summary based ONLY on the actual content:

Document: ${options.documentName}
Matter: ${options.matterName} (${options.matterNumber})
Document Type: ${options.documentType || 'Legal Document'}

${options.extractedText ? `\n\nFULL DOCUMENT TEXT (read carefully):\n${options.extractedText.substring(0, 10000)}\n\n${options.extractedText.length > 10000 ? `[Document continues... Total length: ${options.extractedText.length} characters]` : ''}` : '\n\n⚠️ WARNING: Document text not available. Cannot generate accurate summary without actual content.'}

INSTRUCTIONS:
1. Read the document text above carefully
2. Extract SPECIFIC facts, names, dates, amounts, findings
3. Base your summary ONLY on what's actually in the document
4. Quote key phrases when important
5. DO NOT make assumptions or add generic information

Provide your analysis in this JSON format:
{
  "problem": "One clear sentence stating the SPECIFIC issue/topic from THIS document",
  "bottomLine": "The ACTUAL conclusion, decision, finding, or outcome from THIS document",
  "soWhat": "Real implications from THIS document (specific deadlines, amounts, parties, consequences)",
  "keyPoints": [
    "Specific fact 1 with details (names, dates, amounts)",
    "Specific fact 2 with details", 
    "Specific fact 3 with details",
    "Specific fact 4 with details",
    "Specific fact 5 with details (if available)",
    "Specific fact 6 with details (if available)"
  ]
}`

  try {
    // Initialize AI Provider Service
    const aiService = new AIProviderService({
      openai: providerConfig.openaiApiKey ? {
        apiKey: providerConfig.openaiApiKey,
        model: 'gpt-4o-mini'
      } : undefined,
      gemini: providerConfig.geminiApiKey ? {
        apiKey: providerConfig.geminiApiKey,
        model: 'gemini-1.5-flash'
      } : undefined,
      defaultProvider: providerConfig.defaultProvider || 'gemini',
      fallbackEnabled: providerConfig.fallbackEnabled !== false
    })

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const aiResponse = await aiService.generateCompletion(messages, {
      temperature: 0.2, // Even lower temperature for factual, detailed extraction
      maxTokens: 2500 // Increased for more detailed summaries
    })

    // Clean AI response - remove markdown code blocks if present
    let cleanedContent = aiResponse.content.trim()
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    const content = JSON.parse(cleanedContent)

    // Construct full summary from components
    const fullSummary = `${content.problem}\n\n${content.bottomLine}\n\n${content.soWhat}`

    return {
      problem: content.problem,
      bottomLine: content.bottomLine,
      soWhat: content.soWhat,
      fullSummary: fullSummary,
      keyPoints: content.keyPoints || [],
      wordCount: fullSummary.split(/\s+/).length,
      confidenceScore: options.extractedText ? 95 : 75 // Lower confidence if no actual text
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    throw new Error(`AI summarization failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Generate comprehensive summary (long)
 * Target: Stakeholder who needs to understand "how" and "why"
 */
export async function generateLongSummary(
  options: SummarizationOptions,
  providerConfig: {
    openaiApiKey?: string
    geminiApiKey?: string
    defaultProvider?: 'openai' | 'gemini'
    fallbackEnabled?: boolean
  }
): Promise<LongSummary> {
  const systemPrompt = `You are a senior legal analyst preparing a comprehensive document summary for an attorney who needs to understand every important detail in the document.

CRITICAL RULES:
1. READ THE ENTIRE DOCUMENT TEXT CAREFULLY before generating summary
2. EXTRACT ALL IMPORTANT FACTS: names, dates, amounts, deadlines, parties, findings, recommendations
3. QUOTE KEY LANGUAGE verbatim (use "quotation marks" for exact quotes)
4. CITE SPECIFIC SECTIONS by their actual headings/numbers from the document
5. NEVER make up information - only use what's in the document
6. If document text is missing or insufficient, clearly state that

OUTPUT REQUIREMENTS:
1. **Executive Summary**: 2-3 detailed paragraphs covering WHO, WHAT, WHEN, WHERE, WHY, HOW from THIS document
2. **Logical Chain**: The actual flow/structure of THIS document (not generic legal patterns)
3. **Evidence/Support**: Specific evidence, data, citations, or findings from THIS document
4. **Scope**: What THIS document actually covers and doesn't cover
5. **Key Sections**: The actual sections/parts of THIS document with their real content
6. **Key Findings**: 6-10 specific, factual findings from THIS document
7. **Length**: Comprehensive, detailed, 1-2 pages

EXAMPLES OF GOOD VS BAD:
❌ BAD: "The document discusses audit findings"
✅ GOOD: "Section 3 'Findings and Recommendations' identifies 12 compliance violations across three categories: IEP Documentation (23% failure rate), Evaluation Timelines (15 cases exceeded 60-day requirement), and Parent Consent (12 missing forms)"

❌ BAD: "Evidence was presented"
✅ GOOD: "Plaintiff relies on Employment Agreement dated 1/15/2023 (Exhibit A), email correspondence from 3/22/2023 showing defendant's knowledge (Exhibit B), and deposition testimony of CFO Sarah Chen confirming $2.5M severance obligation (Exhibit C, p. 47-52)"`

  const userPrompt = `Provide a comprehensive, detailed analysis of this specific document based ONLY on its actual content:

Document: ${options.documentName}
Matter: ${options.matterName} (${options.matterNumber})
Document Type: ${options.documentType || 'Legal Document'}

${options.extractedText ? `\n\nFULL DOCUMENT TEXT (read all of it carefully):\n${options.extractedText.substring(0, 15000)}\n\n${options.extractedText.length > 15000 ? `[Document continues... Total length: ${options.extractedText.length} characters. Above is first 15,000 characters showing main content.]` : ''}` : '\n\n⚠️ WARNING: Document text not available. Cannot generate accurate summary without actual content. This summary will be generic and unreliable.'}

INSTRUCTIONS:
1. Read the ENTIRE document text above very carefully
2. Extract EVERY important detail: names, titles, dates, amounts, deadlines, findings, recommendations, citations
3. Cite ACTUAL section headings and page references from the document
4. Quote KEY LANGUAGE verbatim when important (exact quotes in "quotation marks")
5. Be SPECIFIC and DETAILED - this is a comprehensive summary
6. Base everything ONLY on what's actually in the document
7. DO NOT add generic legal analysis or assumptions

Provide your comprehensive analysis in this JSON format:
{
  "executiveSummary": "2-3 detailed paragraphs covering: WHO (parties/people), WHAT (document purpose/type), WHEN (dates/timeline), WHERE (jurisdiction/location), WHY (reason/context), HOW (process/methodology). Include specific names, dates, amounts, findings from THIS document.",
  
  "logicalChain": [
    "Section 1: [Actual section name] - [Specific content summary]",
    "Section 2: [Actual section name] - [Specific content summary]",
    "Section 3: [Actual section name] - [Specific content summary]",
    "[Continue for all major sections actually in the document]"
  ],
  
  "evidenceHierarchy": "Detailed description of the specific evidence, data, findings, or citations in THIS document. Include: (1) Primary evidence/findings with specifics, (2) Supporting data/statistics with numbers, (3) Key citations or references with details. Be specific and factual.",
  
  "scopeAndLimitations": "What THIS specific document actually covers and does NOT cover. Be specific about: topics addressed, time periods covered, parties included/excluded, types of analysis performed, disclaimers or limitations stated in the document.",
  
  "structuralSignposting": [
    "[Actual Section/Page 1 name]: [Real content description]",
    "[Actual Section/Page 2 name]: [Real content description]",
    "[Actual Section/Page 3 name]: [Real content description]",
    "[Continue for all actual sections]"
  ],
  
  "keyFindings": [
    "Finding 1: [Specific fact with names/dates/amounts]",
    "Finding 2: [Specific fact with names/dates/amounts]",
    "Finding 3: [Specific fact with names/dates/amounts]",
    "Finding 4: [Specific fact with names/dates/amounts]",
    "Finding 5: [Specific fact with names/dates/amounts]",
    "Finding 6: [Specific fact with names/dates/amounts]",
    "Finding 7: [Specific fact with names/dates/amounts if available]",
    "Finding 8: [Specific fact with names/dates/amounts if available]",
    "Finding 9: [Specific fact with names/dates/amounts if available]",
    "Finding 10: [Specific fact with names/dates/amounts if available]"
  ]
}`

  try {
    // Initialize AI Provider Service
    const aiService = new AIProviderService({
      openai: providerConfig.openaiApiKey ? {
        apiKey: providerConfig.openaiApiKey,
        model: 'gpt-4o-mini'
      } : undefined,
      gemini: providerConfig.geminiApiKey ? {
        apiKey: providerConfig.geminiApiKey,
        model: 'gemini-1.5-flash'
      } : undefined,
      defaultProvider: providerConfig.defaultProvider || 'gemini',
      fallbackEnabled: providerConfig.fallbackEnabled !== false
    })

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const aiResponse = await aiService.generateCompletion(messages, {
      temperature: 0.2, // Lower temperature for factual, detailed extraction
      maxTokens: 4000 // Increased for comprehensive summaries
    })

    // Clean AI response - remove markdown code blocks if present
    let cleanedContent = aiResponse.content.trim()
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    const content = JSON.parse(cleanedContent)

    // Construct full summary
    const sections = [
      { heading: 'Executive Summary', content: content.executiveSummary },
      { heading: 'Logical Chain', content: content.logicalChain.join('\n\n') },
      { heading: 'Evidence Hierarchy', content: content.evidenceHierarchy },
      { heading: 'Scope and Limitations', content: content.scopeAndLimitations },
      { heading: 'Document Structure', content: content.structuralSignposting.join('\n') }
    ]

    const fullSummary = sections.map(s => `${s.heading}:\n${s.content}`).join('\n\n')

    return {
      executiveSummary: content.executiveSummary,
      logicalChain: content.logicalChain || [],
      evidenceHierarchy: content.evidenceHierarchy,
      scopeAndLimitations: content.scopeAndLimitations,
      structuralSignposting: content.structuralSignposting || [],
      fullSummary: fullSummary,
      keyFindings: content.keyFindings || [],
      wordCount: fullSummary.split(/\s+/).length,
      confidenceScore: options.extractedText ? 92 : 72 // Lower confidence if no actual text
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    throw new Error(`AI summarization failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
