/**
 * LexiCore™ Exhibit Tracking Service
 * Phase 3: Exhibit Cross-Reference System
 * 
 * Automatically detects and tracks exhibit mentions across litigation documents:
 * - Depositions
 * - Pleadings
 * - Motions
 * - Briefs
 * - Discovery responses
 * 
 * © 2024 LexiCore. All rights reserved.
 */

export interface ExhibitMention {
  exhibitNumber: string        // e.g., "Exhibit A", "Plaintiff's Ex. 12"
  contextBefore: string         // Text before mention
  contextAfter: string          // Text after mention
  fullText: string              // Complete sentence/paragraph
  pageNumber?: number           // Page where found
  lineNumber?: number           // Line where found (for depositions)
  paragraphNumber?: number      // Paragraph number (for pleadings)
  confidence: number            // 0-100
}

export interface ExhibitReference {
  id: string
  exhibitId: string
  referenceType: 'deposition' | 'pleading' | 'motion' | 'order' | 'brief' | 'discovery' | 'other'
  referenceId: string           // Document or deposition ID
  pageNumber?: number
  lineNumber?: number
  paragraphNumber?: number
  referenceText: string
  citedAt: string
  citedBy: string
}

export interface Exhibit {
  id: string
  matterId: string
  documentId?: string
  exhibitNumber: string
  exhibitLabel?: string
  exhibitType: 'document' | 'photo' | 'video' | 'audio' | 'physical' | 'other'
  sourceType: 'deposition' | 'discovery' | 'trial' | 'motion' | 'other'
  sourceId?: string
  introducedBy?: string
  introducedDate?: string
  batesNumberStart?: string
  batesNumberEnd?: string
  totalPages?: number
  description: string
  relevanceNotes?: string
  status: 'identified' | 'requested' | 'received' | 'authenticated' | 'admitted' | 'excluded'
  createdAt: string
  updatedAt: string
  createdBy: string
  references?: ExhibitReference[]
}

/**
 * Exhibit detection patterns
 * Matches various formats:
 * - "Exhibit A"
 * - "Plaintiff's Exhibit 12"
 * - "Defendant Ex. 5"
 * - "marked as Exhibit B"
 * - "Defense Exhibit 3"
 */
const EXHIBIT_PATTERNS = [
  // Standard format: "Exhibit A", "Exhibit 12"
  /\bExhibit\s+([A-Z]|\d+)\b/gi,
  
  // Party-specific: "Plaintiff's Exhibit A", "Defendant's Ex. 12"
  /\b(Plaintiff'?s?|Defendant'?s?|Defense|Prosecution)\s+Ex(?:hibit)?\.?\s+([A-Z]|\d+)\b/gi,
  
  // With "marked as": "marked as Exhibit A", "identified as Defendant's 5"
  /\b(?:marked|identified|labeled)\s+as\s+(?:(Plaintiff'?s?|Defendant'?s?|Defense)\s+)?Ex(?:hibit)?\.?\s+([A-Z]|\d+)\b/gi,
  
  // Court exhibit format: "Court Exhibit A"
  /\bCourt\s+Ex(?:hibit)?\.?\s+([A-Z]|\d+)\b/gi,
  
  // Abbreviated: "Ex. A", "Ex. 12"
  /\bEx\.?\s+([A-Z]|\d+)\b/gi,
  
  // Joint exhibits: "Joint Exhibit 1"
  /\bJoint\s+Ex(?:hibit)?\.?\s+([A-Z]|\d+)\b/gi
]

/**
 * Detect exhibit mentions in text
 */
export function detectExhibitMentions(
  text: string,
  pageNumber?: number,
  lineNumber?: number,
  paragraphNumber?: number
): ExhibitMention[] {
  const mentions: ExhibitMention[] = []
  const foundExhibits = new Set<string>() // Avoid duplicates on same page/line

  // Split text into sentences for better context
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

  sentences.forEach(sentence => {
    EXHIBIT_PATTERNS.forEach(pattern => {
      const matches = sentence.matchAll(pattern)
      
      for (const match of matches) {
        // Extract exhibit number (last capture group)
        const exhibitNumber = match[match.length - 1] || match[1]
        if (!exhibitNumber) continue

        // Normalize exhibit number
        const normalizedNumber = normalizeExhibitNumber(match[0], exhibitNumber)
        
        // Create unique key to avoid duplicates
        const key = `${normalizedNumber}-${pageNumber || 0}-${lineNumber || 0}`
        if (foundExhibits.has(key)) continue
        foundExhibits.add(key)

        // Extract context (50 chars before and after)
        const matchIndex = sentence.indexOf(match[0])
        const contextStart = Math.max(0, matchIndex - 50)
        const contextEnd = Math.min(sentence.length, matchIndex + match[0].length + 50)
        
        mentions.push({
          exhibitNumber: normalizedNumber,
          contextBefore: sentence.substring(contextStart, matchIndex).trim(),
          contextAfter: sentence.substring(matchIndex + match[0].length, contextEnd).trim(),
          fullText: sentence.trim(),
          pageNumber,
          lineNumber,
          paragraphNumber,
          confidence: calculateConfidence(match[0], sentence)
        })
      }
    })
  })

  return mentions
}

/**
 * Normalize exhibit number to standard format
 * "Plaintiff's Exhibit 12" -> "Plaintiff's Ex. 12"
 * "Exhibit A" -> "Exhibit A"
 * "Defense Ex. 5" -> "Defense Ex. 5"
 */
function normalizeExhibitNumber(fullMatch: string, number: string): string {
  // Check if it includes party designation
  const partyMatch = fullMatch.match(/\b(Plaintiff'?s?|Defendant'?s?|Defense|Prosecution|Court|Joint)\b/i)
  
  if (partyMatch) {
    const party = partyMatch[1]
    // Normalize party name
    let normalizedParty = party.replace(/'s?$/, '')
    if (normalizedParty.toLowerCase() === 'defense') normalizedParty = 'Defendant'
    if (normalizedParty.toLowerCase() === 'prosecution') normalizedParty = 'Plaintiff'
    
    return `${normalizedParty}'s Ex. ${number}`
  }
  
  // Standard exhibit format
  return `Exhibit ${number}`
}

/**
 * Calculate confidence score based on context
 * Higher score if:
 * - Full exhibit name is used (not abbreviated)
 * - Context includes legal terms (deposition, testimony, document)
 * - Properly formatted with party designation
 */
function calculateConfidence(match: string, context: string): number {
  let confidence = 70 // Base confidence

  // Full word "Exhibit" vs "Ex." (+10)
  if (/\bExhibit\b/.test(match)) {
    confidence += 10
  }

  // Party designation present (+10)
  if (/\b(Plaintiff'?s?|Defendant'?s?|Defense|Court|Joint)\b/i.test(match)) {
    confidence += 10
  }

  // Legal context words present (+5 each, max +15)
  const legalTerms = ['deposition', 'testimony', 'document', 'marked', 'identified', 'introduced', 'admitted']
  const contextLower = context.toLowerCase()
  let legalTermCount = 0
  for (const term of legalTerms) {
    if (contextLower.includes(term)) {
      legalTermCount++
      if (legalTermCount >= 3) break
    }
  }
  confidence += legalTermCount * 5

  return Math.min(100, confidence)
}

/**
 * Group exhibit mentions by exhibit number
 */
export function groupExhibitMentions(mentions: ExhibitMention[]): Map<string, ExhibitMention[]> {
  const grouped = new Map<string, ExhibitMention[]>()
  
  for (const mention of mentions) {
    const existing = grouped.get(mention.exhibitNumber) || []
    existing.push(mention)
    grouped.set(mention.exhibitNumber, existing)
  }
  
  return grouped
}

/**
 * Extract exhibit list from text
 * Returns unique exhibit numbers found
 */
export function extractExhibitList(text: string): string[] {
  const mentions = detectExhibitMentions(text)
  const uniqueExhibits = new Set<string>()
  
  for (const mention of mentions) {
    uniqueExhibits.add(mention.exhibitNumber)
  }
  
  return Array.from(uniqueExhibits).sort(sortExhibitNumbers)
}

/**
 * Sort exhibit numbers intelligently
 * - Letters first (A, B, C...)
 * - Numbers next (1, 2, 3...)
 * - Party-specific grouped
 */
function sortExhibitNumbers(a: string, b: string): number {
  // Extract party and number
  const aMatch = a.match(/(?:(Plaintiff|Defendant|Court|Joint)'?s?\s+)?Ex\.\s+([A-Z]|\d+)/i)
  const bMatch = b.match(/(?:(Plaintiff|Defendant|Court|Joint)'?s?\s+)?Ex\.\s+([A-Z]|\d+)/i)
  
  if (!aMatch || !bMatch) return a.localeCompare(b)
  
  const [, aParty = '', aNum] = aMatch
  const [, bParty = '', bNum] = bMatch
  
  // Sort by party first
  if (aParty !== bParty) {
    return aParty.localeCompare(bParty)
  }
  
  // Then by number/letter
  const aIsNum = /^\d+$/.test(aNum)
  const bIsNum = /^\d+$/.test(bNum)
  
  if (aIsNum && bIsNum) {
    return parseInt(aNum) - parseInt(bNum)
  }
  
  if (aIsNum !== bIsNum) {
    return aIsNum ? 1 : -1 // Letters before numbers
  }
  
  return aNum.localeCompare(bNum)
}

/**
 * Generate exhibit summary statistics
 */
export interface ExhibitStats {
  totalExhibits: number
  byParty: Record<string, number>
  byType: Record<string, number>
  byStatus: Record<string, number>
  mostReferencedExhibits: Array<{ exhibitNumber: string; referenceCount: number }>
}

export function generateExhibitStats(exhibits: Exhibit[]): ExhibitStats {
  const stats: ExhibitStats = {
    totalExhibits: exhibits.length,
    byParty: {},
    byType: {},
    byStatus: {},
    mostReferencedExhibits: []
  }
  
  // Count by party
  for (const exhibit of exhibits) {
    const partyMatch = exhibit.exhibitNumber.match(/^(Plaintiff|Defendant|Court|Joint)/i)
    const party = partyMatch ? partyMatch[1] : 'General'
    stats.byParty[party] = (stats.byParty[party] || 0) + 1
  }
  
  // Count by type
  for (const exhibit of exhibits) {
    stats.byType[exhibit.exhibitType] = (stats.byType[exhibit.exhibitType] || 0) + 1
  }
  
  // Count by status
  for (const exhibit of exhibits) {
    stats.byStatus[exhibit.status] = (stats.byStatus[exhibit.status] || 0) + 1
  }
  
  // Most referenced exhibits
  const referenceCounts = exhibits
    .map(ex => ({
      exhibitNumber: ex.exhibitNumber,
      referenceCount: ex.references?.length || 0
    }))
    .filter(item => item.referenceCount > 0)
    .sort((a, b) => b.referenceCount - a.referenceCount)
    .slice(0, 10)
  
  stats.mostReferencedExhibits = referenceCounts
  
  return stats
}
