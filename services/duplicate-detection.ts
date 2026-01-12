// LexiCore™ - Duplicate Detection Service
// Advanced duplicate and similarity detection for legal clauses
// © 2024 LexiCore™. All rights reserved.

export interface DuplicateResult {
  type: 'exact' | 'near_duplicate' | 'similar' | 'variant'
  clause_id_1: string
  clause_id_2: string
  clause_title_1: string
  clause_title_2: string
  similarity_score: number // 0-1
  match_details: {
    title_match: boolean
    text_similarity: number
    category_match: boolean
    practice_area_match: boolean
  }
  recommended_action: 'merge' | 'keep_both' | 'review_required'
  reason: string
}

export interface ClauseFingerprint {
  id: string
  title_normalized: string
  text_normalized: string
  text_hash: string
  word_count: number
  unique_words: Set<string>
  category: string
  practice_area: string
}

export class DuplicateDetectionService {
  /**
   * Normalize text for comparison (remove whitespace, punctuation, lowercase)
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Generate simple hash for exact text comparison
   */
  private static hashText(text: string): string {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private static jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])
    return union.size === 0 ? 0 : intersection.size / union.size
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }

  /**
   * Calculate similarity score between two texts
   */
  private static calculateTextSimilarity(text1: string, text2: string): number {
    const normalized1 = this.normalizeText(text1)
    const normalized2 = this.normalizeText(text2)

    // Exact match
    if (normalized1 === normalized2) return 1.0

    // Word-based Jaccard similarity
    const words1 = new Set(normalized1.split(' '))
    const words2 = new Set(normalized2.split(' '))
    const jaccardScore = this.jaccardSimilarity(words1, words2)

    // Levenshtein-based similarity (for titles and short texts)
    const maxLength = Math.max(text1.length, text2.length)
    const distance = this.levenshteinDistance(normalized1, normalized2)
    const levenshteinScore = 1 - (distance / maxLength)

    // Weighted average (favor Jaccard for longer texts)
    const textLength = Math.max(normalized1.length, normalized2.length)
    const weight = Math.min(textLength / 500, 0.7) // Max 70% weight to Jaccard
    return (jaccardScore * weight) + (levenshteinScore * (1 - weight))
  }

  /**
   * Create fingerprint for a clause
   */
  static createFingerprint(clause: any): ClauseFingerprint {
    const titleNorm = this.normalizeText(clause.clause_title || '')
    const textNorm = this.normalizeText(clause.standard_text || clause.clause_text || '')
    
    return {
      id: clause.id,
      title_normalized: titleNorm,
      text_normalized: textNorm,
      text_hash: this.hashText(textNorm),
      word_count: textNorm.split(' ').length,
      unique_words: new Set(textNorm.split(' ')),
      category: clause.category || '',
      practice_area: clause.practice_area || ''
    }
  }

  /**
   * Detect duplicates in a collection of clauses
   */
  static detectDuplicates(
    clauses: any[],
    options: {
      exactOnly?: boolean
      minSimilarity?: number
      checkTitleOnly?: boolean
    } = {}
  ): DuplicateResult[] {
    const {
      exactOnly = false,
      minSimilarity = 0.85,
      checkTitleOnly = false
    } = options

    const duplicates: DuplicateResult[] = []
    const fingerprints = clauses.map(c => this.createFingerprint(c))

    // Compare all pairs
    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        const fp1 = fingerprints[i]
        const fp2 = fingerprints[j]

        // Skip if same clause
        if (fp1.id === fp2.id) continue

        // Check for exact text match
        if (fp1.text_hash === fp2.text_hash) {
          duplicates.push({
            type: 'exact',
            clause_id_1: fp1.id,
            clause_id_2: fp2.id,
            clause_title_1: clauses[i].clause_title,
            clause_title_2: clauses[j].clause_title,
            similarity_score: 1.0,
            match_details: {
              title_match: fp1.title_normalized === fp2.title_normalized,
              text_similarity: 1.0,
              category_match: fp1.category === fp2.category,
              practice_area_match: fp1.practice_area === fp2.practice_area
            },
            recommended_action: 'merge',
            reason: 'Exact text match detected'
          })
          continue
        }

        // Skip similarity checks if exactOnly
        if (exactOnly) continue

        // Title similarity
        const titleSimilarity = this.calculateTextSimilarity(
          fp1.title_normalized,
          fp2.title_normalized
        )

        // Text similarity
        const textSimilarity = checkTitleOnly ? titleSimilarity : 
          this.calculateTextSimilarity(fp1.text_normalized, fp2.text_normalized)

        // Only report if above threshold
        if (textSimilarity >= minSimilarity) {
          let type: 'exact' | 'near_duplicate' | 'similar' | 'variant' = 'similar'
          let action: 'merge' | 'keep_both' | 'review_required' = 'review_required'
          let reason = ''

          if (textSimilarity >= 0.95) {
            type = 'near_duplicate'
            action = 'merge'
            reason = `Very high similarity (${(textSimilarity * 100).toFixed(1)}%)`
          } else if (textSimilarity >= 0.85 && titleSimilarity > 0.7) {
            type = 'variant'
            action = 'review_required'
            reason = `Likely variant of same clause (text: ${(textSimilarity * 100).toFixed(1)}%, title: ${(titleSimilarity * 100).toFixed(1)}%)`
          } else {
            type = 'similar'
            action = fp1.category === fp2.category ? 'review_required' : 'keep_both'
            reason = `Similar content in ${fp1.category === fp2.category ? 'same' : 'different'} category (${(textSimilarity * 100).toFixed(1)}% similarity)`
          }

          duplicates.push({
            type,
            clause_id_1: fp1.id,
            clause_id_2: fp2.id,
            clause_title_1: clauses[i].clause_title,
            clause_title_2: clauses[j].clause_title,
            similarity_score: textSimilarity,
            match_details: {
              title_match: titleSimilarity > 0.9,
              text_similarity: textSimilarity,
              category_match: fp1.category === fp2.category,
              practice_area_match: fp1.practice_area === fp2.practice_area
            },
            recommended_action: action,
            reason
          })
        }
      }
    }

    // Sort by similarity score (descending)
    return duplicates.sort((a, b) => b.similarity_score - a.similarity_score)
  }

  /**
   * Scan database for duplicates
   */
  static async scanDatabase(
    db: D1Database,
    options: {
      category?: string
      practiceArea?: string
      exactOnly?: boolean
      minSimilarity?: number
    } = {}
  ): Promise<{
    duplicates: DuplicateResult[]
    stats: {
      total_clauses: number
      exact_duplicates: number
      near_duplicates: number
      similar_clauses: number
      variants: number
    }
  }> {
    // Build query
    let query = 'SELECT * FROM clause_library WHERE 1=1'
    const params: any[] = []

    if (options.category) {
      query += ' AND category = ?'
      params.push(options.category)
    }

    if (options.practiceArea) {
      query += ' AND practice_area = ?'
      params.push(options.practiceArea)
    }

    // Fetch clauses
    const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query)
    const { results: clauses } = await stmt.all()

    if (!clauses || clauses.length === 0) {
      return {
        duplicates: [],
        stats: {
          total_clauses: 0,
          exact_duplicates: 0,
          near_duplicates: 0,
          similar_clauses: 0,
          variants: 0
        }
      }
    }

    // Detect duplicates
    const duplicates = this.detectDuplicates(clauses, {
      exactOnly: options.exactOnly,
      minSimilarity: options.minSimilarity || 0.85
    })

    // Calculate stats
    const stats = {
      total_clauses: clauses.length,
      exact_duplicates: duplicates.filter(d => d.type === 'exact').length,
      near_duplicates: duplicates.filter(d => d.type === 'near_duplicate').length,
      similar_clauses: duplicates.filter(d => d.type === 'similar').length,
      variants: duplicates.filter(d => d.type === 'variant').length
    }

    return { duplicates, stats }
  }
}
