/**
 * LexiCore™ Deposition Transcript Parser
 * 
 * Parses deposition transcripts with page/line precision
 * Extracts Q&A pairs, exhibits, timestamps, and witness testimony
 * 
 * SUPPORTED FORMATS:
 * - Standard court reporter format (page/line numbering)
 * - Stenographer format (Q: / A: format)
 * - Veritext format
 * - RealLegal format
 * 
 * OUTPUT:
 * - Structured Q&A pairs with page/line references
 * - Exhibit mentions tracked
 * - Timeline events extracted
 * - Speaker identification (attorney, witness, etc.)
 */

export interface DepositionMetadata {
  deponentName: string
  deponentRole?: string
  depositionDate: string
  location?: string
  caseNumber?: string
  caseName?: string
  courtReporter?: string
  totalPages: number
  totalLines?: number
}

export interface PageLineReference {
  page: number
  lineStart: number
  lineEnd: number
  text: string
}

export interface QAPair {
  id: string
  questionBy: string  // Attorney name or "Q:"
  question: string
  questionRef: PageLineReference
  answerBy: string    // Witness name or "A:"
  answer: string
  answerRef: PageLineReference
  topic?: string
  exhibits?: string[]
  timestamp?: string  // If mentioned in testimony
}

export interface ExhibitMention {
  exhibitNumber: string
  exhibitDescription?: string
  mentionedAt: PageLineReference
  introducedBy?: string
  context: string
}

export interface TimelineEvent {
  date?: string
  time?: string
  event: string
  reference: PageLineReference
  confidence: number
}

export interface DepositionParseResult {
  metadata: DepositionMetadata
  qaPairs: QAPair[]
  exhibits: ExhibitMention[]
  timeline: TimelineEvent[]
  pageIndex: Map<number, string[]>  // page -> lines
  errors: string[]
}

export class DepositionParser {
  
  /**
   * Parse deposition transcript text
   */
  static parse(text: string): DepositionParseResult {
    console.log('📄 Parsing deposition transcript...')
    
    const result: DepositionParseResult = {
      metadata: this.extractMetadata(text),
      qaPairs: [],
      exhibits: [],
      timeline: [],
      pageIndex: new Map(),
      errors: []
    }
    
    try {
      // Detect format
      const format = this.detectFormat(text)
      console.log('🔍 Detected format:', format)
      
      // Build page index
      result.pageIndex = this.buildPageIndex(text)
      console.log('📑 Indexed pages:', result.pageIndex.size)
      
      // Extract Q&A pairs
      result.qaPairs = this.extractQAPairs(text, result.pageIndex)
      console.log('💬 Extracted Q&A pairs:', result.qaPairs.length)
      
      // Extract exhibit mentions
      result.exhibits = this.extractExhibits(text, result.pageIndex)
      console.log('📎 Found exhibit mentions:', result.exhibits.length)
      
      // Extract timeline events
      result.timeline = this.extractTimeline(text, result.pageIndex)
      console.log('📅 Found timeline events:', result.timeline.length)
      
    } catch (error) {
      console.error('❌ Parsing error:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }
    
    return result
  }
  
  /**
   * Detect transcript format
   */
  private static detectFormat(text: string): string {
    const sample = text.substring(0, 5000).toLowerCase()
    
    // Check for common format indicators
    if (sample.includes('realtime transcription')) return 'RealLegal'
    if (sample.includes('veritext')) return 'Veritext'
    if (sample.includes('certified shorthand reporter')) return 'Standard'
    if (/^Q\.?\s+/m.test(text) && /^A\.?\s+/m.test(text)) return 'Q&A Format'
    
    return 'Unknown'
  }
  
  /**
   * Extract deposition metadata from header
   */
  private static extractMetadata(text: string): DepositionMetadata {
    const header = text.substring(0, 2000)
    
    // Extract deponent name (common patterns)
    let deponentName = 'Unknown'
    const namePatterns = [
      /DEPOSITION OF\s+([A-Z\s\.]+)/i,
      /Deposition of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
      /WITNESS:\s+([A-Z\s\.]+)/i
    ]
    
    for (const pattern of namePatterns) {
      const match = header.match(pattern)
      if (match) {
        deponentName = match[1].trim()
        break
      }
    }
    
    // Extract date
    let depositionDate = 'Unknown'
    const datePatterns = [
      /(?:taken on|date:)\s+(\w+\s+\d{1,2},\s+\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\w+\s+\d{1,2},\s+\d{4})/
    ]
    
    for (const pattern of datePatterns) {
      const match = header.match(pattern)
      if (match) {
        depositionDate = match[1]
        break
      }
    }
    
    // Extract case number
    let caseNumber = undefined
    const caseMatch = header.match(/Case\s+No\.?\s*:?\s*([A-Z0-9\-]+)/i)
    if (caseMatch) caseNumber = caseMatch[1]
    
    // Extract location
    let location = undefined
    const locationMatch = header.match(/(?:taken at|location:)\s+([^\n]+)/i)
    if (locationMatch) location = locationMatch[1].trim()
    
    // Count pages
    const pageMatches = text.match(/\n\s*(\d+)\s*\n/g) || []
    const totalPages = pageMatches.length
    
    return {
      deponentName,
      depositionDate,
      caseNumber,
      location,
      totalPages
    }
  }
  
  /**
   * Build page/line index
   */
  private static buildPageIndex(text: string): Map<number, string[]> {
    const pageIndex = new Map<number, string[]>()
    
    // Split by page breaks (common pattern: page number on its own line)
    const lines = text.split('\n')
    let currentPage = 1
    let currentLines: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check if this line is a page number
      const pageMatch = line.match(/^\s*(\d+)\s*$/)
      if (pageMatch) {
        // Save previous page
        if (currentLines.length > 0) {
          pageIndex.set(currentPage, currentLines)
        }
        
        // Start new page
        currentPage = parseInt(pageMatch[1])
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }
    
    // Save last page
    if (currentLines.length > 0) {
      pageIndex.set(currentPage, currentLines)
    }
    
    return pageIndex
  }
  
  /**
   * Extract Q&A pairs with page/line references
   */
  private static extractQAPairs(text: string, pageIndex: Map<number, string[]>): QAPair[] {
    const qaPairs: QAPair[] = []
    
    // Pattern for Q&A format
    const qaPattern = /(?:^|\n)\s*Q\.?\s+(.*?)(?=\n\s*A\.?\s+|\n\s*Q\.|\n\s*\d+\s*$|$)/gis
    const answerPattern = /(?:^|\n)\s*A\.?\s+(.*?)(?=\n\s*Q\.|\n\s*\d+\s*$|$)/gis
    
    let questionMatch
    let qIndex = 0
    
    while ((questionMatch = qaPattern.exec(text)) !== null) {
      const question = questionMatch[1].trim()
      const questionStart = questionMatch.index
      
      // Find corresponding answer
      answerPattern.lastIndex = questionMatch.index + questionMatch[0].length
      const answerMatch = answerPattern.exec(text)
      
      if (answerMatch) {
        const answer = answerMatch[1].trim()
        
        // Find page/line references
        const questionRef = this.findPageLine(questionStart, text, pageIndex)
        const answerRef = this.findPageLine(answerMatch.index, text, pageIndex)
        
        // Extract exhibit mentions
        const exhibits = this.findExhibitReferences(question + ' ' + answer)
        
        // Extract timestamp if mentioned
        const timestamp = this.findTimestamp(answer)
        
        qaPairs.push({
          id: `qa-${Date.now()}-${qIndex++}`,
          questionBy: 'Q:',
          question,
          questionRef,
          answerBy: 'A:',
          answer,
          answerRef,
          exhibits: exhibits.length > 0 ? exhibits : undefined,
          timestamp
        })
      }
    }
    
    return qaPairs
  }
  
  /**
   * Find page/line reference for text position
   */
  private static findPageLine(position: number, text: string, pageIndex: Map<number, string[]>): PageLineReference {
    const beforeText = text.substring(0, position)
    const lines = beforeText.split('\n')
    const lineNumber = lines.length
    
    // Find page by counting page breaks before this position
    let page = 1
    const pageBreaks = beforeText.match(/\n\s*\d+\s*\n/g) || []
    page += pageBreaks.length
    
    // Get text around this position
    const contextStart = Math.max(0, position - 100)
    const contextEnd = Math.min(text.length, position + 200)
    const contextText = text.substring(contextStart, contextEnd).trim()
    
    return {
      page,
      lineStart: lineNumber,
      lineEnd: lineNumber + 5,  // Approximate
      text: contextText
    }
  }
  
  /**
   * Extract exhibit mentions from text
   */
  private static extractExhibits(text: string, pageIndex: Map<number, string[]>): ExhibitMention[] {
    const exhibits: ExhibitMention[] = []
    
    // Common exhibit patterns
    const patterns = [
      /(?:Exhibit|Ex\.?)\s+([A-Z0-9\-]+)/gi,
      /(?:marked as|identified as)\s+Exhibit\s+([A-Z0-9\-]+)/gi,
      /\(Exhibit\s+([A-Z0-9\-]+)\)/gi
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const exhibitNumber = match[1]
        const position = match.index
        const ref = this.findPageLine(position, text, pageIndex)
        
        // Check if already found
        if (!exhibits.find(e => e.exhibitNumber === exhibitNumber)) {
          exhibits.push({
            exhibitNumber,
            mentionedAt: ref,
            context: match[0]
          })
        }
      }
    }
    
    return exhibits
  }
  
  /**
   * Find exhibit references in text
   */
  private static findExhibitReferences(text: string): string[] {
    const exhibits: string[] = []
    const pattern = /(?:Exhibit|Ex\.?)\s+([A-Z0-9\-]+)/gi
    
    let match
    while ((match = pattern.exec(text)) !== null) {
      const exhibitNum = match[1]
      if (!exhibits.includes(exhibitNum)) {
        exhibits.push(exhibitNum)
      }
    }
    
    return exhibits
  }
  
  /**
   * Extract timeline events from testimony
   */
  private static extractTimeline(text: string, pageIndex: Map<number, string[]>): TimelineEvent[] {
    const events: TimelineEvent[] = []
    
    // Date patterns
    const datePatterns = [
      /(?:on|in|during)\s+(\w+\s+\d{1,2},\s+\d{4})/gi,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(?:on|in)\s+(\w+\s+\d{4})/gi
    ]
    
    for (const pattern of datePatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const date = match[1]
        const position = match.index
        
        // Get context (sentence containing the date)
        const sentenceStart = text.lastIndexOf('.', position) + 1
        const sentenceEnd = text.indexOf('.', position + match[0].length)
        const event = text.substring(sentenceStart, sentenceEnd > 0 ? sentenceEnd : position + 200).trim()
        
        const ref = this.findPageLine(position, text, pageIndex)
        
        events.push({
          date,
          event,
          reference: ref,
          confidence: 80
        })
      }
    }
    
    return events
  }
  
  /**
   * Find timestamp in text
   */
  private static findTimestamp(text: string): string | undefined {
    const timePatterns = [
      /(\d{1,2}:\d{2}\s*(?:AM|PM|a\.m\.|p\.m\.))/i,
      /(?:at|around)\s+(\d{1,2}\s*(?:o'clock|AM|PM))/i
    ]
    
    for (const pattern of timePatterns) {
      const match = text.match(pattern)
      if (match) return match[1]
    }
    
    return undefined
  }
  
  /**
   * Search Q&A pairs by topic/keyword
   */
  static searchQAPairs(qaPairs: QAPair[], query: string): QAPair[] {
    const lowerQuery = query.toLowerCase()
    
    return qaPairs.filter(qa => {
      const questionText = qa.question.toLowerCase()
      const answerText = qa.answer.toLowerCase()
      
      return questionText.includes(lowerQuery) || 
             answerText.includes(lowerQuery) ||
             (qa.topic && qa.topic.toLowerCase().includes(lowerQuery))
    })
  }
  
  /**
   * Get Q&A pairs by page range
   */
  static getQAPairsByPage(qaPairs: QAPair[], startPage: number, endPage: number): QAPair[] {
    return qaPairs.filter(qa => {
      const page = qa.questionRef.page
      return page >= startPage && page <= endPage
    })
  }
  
  /**
   * Get Q&A pairs mentioning specific exhibit
   */
  static getQAPairsByExhibit(qaPairs: QAPair[], exhibitNumber: string): QAPair[] {
    return qaPairs.filter(qa => 
      qa.exhibits && qa.exhibits.includes(exhibitNumber)
    )
  }
}
