/**
 * LexiCore™ Litigation - Document Comparison & Conflict Analysis
 * Phase 7: AI-Powered Discrepancy Detection
 * 
 * Legal Compliance: Comparison is for ANALYSIS ONLY
 * - Identifies factual differences between documents
 * - Does NOT establish which version is correct
 * - Attorney must verify all detected conflicts
 * - Comparison does NOT create legal conclusions
 * - Discrepancies require independent verification
 */

import type { D1Database } from '@cloudflare/workers-types';

// Comparison Types
export enum ComparisonType {
  DOCUMENT_VERSION = 'document_version',     // Compare document versions
  DEPOSITION_CONFLICT = 'deposition_conflict', // Compare depositions
  STATEMENT_CONFLICT = 'statement_conflict',   // Compare statements
  EXTRACTION_DIFF = 'extraction_diff',         // Compare extractions
  EXHIBIT_CROSS_CHECK = 'exhibit_cross_check'  // Cross-check exhibits
}

// Conflict Severity
export enum ConflictSeverity {
  CRITICAL = 'critical',     // Direct contradiction
  HIGH = 'high',             // Significant difference
  MEDIUM = 'medium',         // Moderate discrepancy
  LOW = 'low',               // Minor difference
  INFO = 'info'              // Informational only
}

// Difference Type
export enum DifferenceType {
  ADDITION = 'addition',     // Content added
  DELETION = 'deletion',     // Content removed
  MODIFICATION = 'modification', // Content changed
  CONFLICT = 'conflict',     // Direct contradiction
  DISCREPANCY = 'discrepancy' // Inconsistency
}

// Text Difference
export interface TextDifference {
  type: DifferenceType;
  original_text?: string;
  modified_text?: string;
  position: number;
  length: number;
  context: string;
  severity: ConflictSeverity;
}

// Detected Conflict
export interface DetectedConflict {
  id?: number;
  comparison_id: number;
  conflict_type: DifferenceType;
  severity: ConflictSeverity;
  description: string;
  source_a: {
    type: string;
    id: number;
    text: string;
    citation?: string;
  };
  source_b: {
    type: string;
    id: number;
    text: string;
    citation?: string;
  };
  confidence_score: number;
  is_resolved: boolean;
  resolution_notes?: string;
  resolved_by?: number;
  resolved_at?: string;
}

// Comparison Result
export interface ComparisonResult {
  id?: number;
  matter_id: number;
  comparison_type: ComparisonType;
  source_a_id: number;
  source_a_type: string;
  source_b_id: number;
  source_b_type: string;
  differences: TextDifference[];
  conflicts: DetectedConflict[];
  similarity_score: number; // 0-100
  total_differences: number;
  critical_conflicts: number;
  high_conflicts: number;
  medium_conflicts: number;
  low_conflicts: number;
  created_at?: string;
  created_by?: number;
}

// Comparison Options
export interface ComparisonOptions {
  matter_id: number;
  source_a_id: number;
  source_a_type: string;
  source_b_id: number;
  source_b_type: string;
  comparison_type: ComparisonType;
  detect_conflicts?: boolean;
  min_severity?: ConflictSeverity;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two texts
 */
export function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  const maxLen = Math.max(text1.length, text2.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(text1, text2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity);
}

/**
 * Find text differences using word-level diff
 */
export function findTextDifferences(original: string, modified: string): TextDifference[] {
  const differences: TextDifference[] = [];
  
  // Split into words
  const originalWords = original.split(/\s+/);
  const modifiedWords = modified.split(/\s+/);
  
  let i = 0, j = 0;
  let position = 0;
  
  while (i < originalWords.length || j < modifiedWords.length) {
    if (i >= originalWords.length) {
      // Addition at end
      const addedText = modifiedWords.slice(j).join(' ');
      differences.push({
        type: DifferenceType.ADDITION,
        modified_text: addedText,
        position,
        length: addedText.length,
        context: getContext(modified, position, 50),
        severity: ConflictSeverity.LOW
      });
      break;
    }
    
    if (j >= modifiedWords.length) {
      // Deletion at end
      const deletedText = originalWords.slice(i).join(' ');
      differences.push({
        type: DifferenceType.DELETION,
        original_text: deletedText,
        position,
        length: deletedText.length,
        context: getContext(original, position, 50),
        severity: ConflictSeverity.LOW
      });
      break;
    }
    
    if (originalWords[i] === modifiedWords[j]) {
      // Same word
      position += originalWords[i].length + 1;
      i++;
      j++;
    } else {
      // Difference detected
      const origWord = originalWords[i];
      const modWord = modifiedWords[j];
      
      // Check if it's a modification or insertion/deletion
      if (levenshteinDistance(origWord, modWord) <= 3) {
        // Similar words - likely modification
        differences.push({
          type: DifferenceType.MODIFICATION,
          original_text: origWord,
          modified_text: modWord,
          position,
          length: origWord.length,
          context: getContext(original, position, 50),
          severity: determineSeverity(origWord, modWord)
        });
        position += origWord.length + 1;
        i++;
        j++;
      } else {
        // Check if next words match (deletion or insertion)
        if (i + 1 < originalWords.length && originalWords[i + 1] === modifiedWords[j]) {
          // Deletion
          differences.push({
            type: DifferenceType.DELETION,
            original_text: origWord,
            position,
            length: origWord.length,
            context: getContext(original, position, 50),
            severity: ConflictSeverity.MEDIUM
          });
          position += origWord.length + 1;
          i++;
        } else if (j + 1 < modifiedWords.length && originalWords[i] === modifiedWords[j + 1]) {
          // Insertion
          differences.push({
            type: DifferenceType.ADDITION,
            modified_text: modWord,
            position,
            length: modWord.length,
            context: getContext(modified, position, 50),
            severity: ConflictSeverity.MEDIUM
          });
          j++;
        } else {
          // Replacement
          differences.push({
            type: DifferenceType.MODIFICATION,
            original_text: origWord,
            modified_text: modWord,
            position,
            length: origWord.length,
            context: getContext(original, position, 50),
            severity: ConflictSeverity.HIGH
          });
          position += origWord.length + 1;
          i++;
          j++;
        }
      }
    }
  }
  
  return differences;
}

/**
 * Get context around a position in text
 */
function getContext(text: string, position: number, length: number): string {
  const start = Math.max(0, position - length);
  const end = Math.min(text.length, position + length);
  let context = text.substring(start, end);
  
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';
  
  return context;
}

/**
 * Determine severity based on word differences
 */
function determineSeverity(word1: string, word2: string): ConflictSeverity {
  // Negation words
  const negations = ['not', 'no', 'never', 'none', 'nothing', 'neither'];
  const isNegation1 = negations.includes(word1.toLowerCase());
  const isNegation2 = negations.includes(word2.toLowerCase());
  
  if (isNegation1 || isNegation2) {
    return ConflictSeverity.CRITICAL; // Negation changes meaning completely
  }
  
  // Numbers
  if (/^\d+$/.test(word1) && /^\d+$/.test(word2)) {
    return ConflictSeverity.HIGH; // Number changes are significant
  }
  
  // Similar words
  const distance = levenshteinDistance(word1.toLowerCase(), word2.toLowerCase());
  if (distance <= 2) {
    return ConflictSeverity.LOW; // Minor typo
  }
  
  return ConflictSeverity.MEDIUM;
}

/**
 * Detect conflicts between two texts
 */
export function detectConflicts(
  textA: string,
  textB: string,
  sourceA: { type: string; id: number; citation?: string },
  sourceB: { type: string; id: number; citation?: string }
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  
  // Split into sentences
  const sentencesA = textA.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentencesB = textB.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Look for contradictions
  for (const sentA of sentencesA) {
    const lowerA = sentA.toLowerCase().trim();
    
    for (const sentB of sentencesB) {
      const lowerB = sentB.toLowerCase().trim();
      
      // Check for direct contradictions
      const hasNegation = (text: string) => {
        return /\b(not|no|never|neither|wasn't|weren't|didn't|don't|doesn't|isn't|aren't)\b/.test(text);
      };
      
      const aHasNeg = hasNegation(lowerA);
      const bHasNeg = hasNegation(lowerB);
      
      // Remove negations and compare
      const aWithoutNeg = lowerA.replace(/\b(not|no|never|neither|wasn't|weren't|didn't|don't|doesn't|isn't|aren't)\b/g, '').trim();
      const bWithoutNeg = lowerB.replace(/\b(not|no|never|neither|wasn't|weren't|didn't|don't|doesn't|isn't|aren't)\b/g, '').trim();
      
      // If one has negation and the other doesn't, and the rest is similar
      if (aHasNeg !== bHasNeg) {
        const similarity = calculateSimilarity(aWithoutNeg, bWithoutNeg);
        if (similarity > 70) {
          conflicts.push({
            comparison_id: 0, // Will be set later
            conflict_type: DifferenceType.CONFLICT,
            severity: ConflictSeverity.CRITICAL,
            description: 'Direct contradiction detected - one statement negates the other',
            source_a: {
              type: sourceA.type,
              id: sourceA.id,
              text: sentA.trim(),
              citation: sourceA.citation
            },
            source_b: {
              type: sourceB.type,
              id: sourceB.id,
              text: sentB.trim(),
              citation: sourceB.citation
            },
            confidence_score: Math.round(similarity),
            is_resolved: false
          });
        }
      }
      
      // Check for numeric discrepancies
      const numbersA = sentA.match(/\d+/g);
      const numbersB = sentB.match(/\d+/g);
      
      if (numbersA && numbersB && numbersA.length > 0 && numbersB.length > 0) {
        const similarity = calculateSimilarity(aWithoutNeg, bWithoutNeg);
        if (similarity > 60 && numbersA[0] !== numbersB[0]) {
          conflicts.push({
            comparison_id: 0,
            conflict_type: DifferenceType.DISCREPANCY,
            severity: ConflictSeverity.HIGH,
            description: 'Numeric discrepancy detected - different numbers in similar contexts',
            source_a: {
              type: sourceA.type,
              id: sourceA.id,
              text: sentA.trim(),
              citation: sourceA.citation
            },
            source_b: {
              type: sourceB.type,
              id: sourceB.id,
              text: sentB.trim(),
              citation: sourceB.citation
            },
            confidence_score: Math.round(similarity),
            is_resolved: false
          });
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Compare two documents
 */
export async function compareDocuments(
  db: D1Database,
  options: ComparisonOptions
): Promise<ComparisonResult> {
  // Fetch source A
  const sourceA = await fetchSource(db, options.source_a_type, options.source_a_id);
  const sourceB = await fetchSource(db, options.source_b_type, options.source_b_id);
  
  if (!sourceA || !sourceB) {
    throw new Error('Source document not found');
  }
  
  // Calculate similarity
  const similarity = calculateSimilarity(sourceA.text, sourceB.text);
  
  // Find differences
  const differences = findTextDifferences(sourceA.text, sourceB.text);
  
  // Detect conflicts if requested
  let conflicts: DetectedConflict[] = [];
  if (options.detect_conflicts) {
    conflicts = detectConflicts(
      sourceA.text,
      sourceB.text,
      { type: options.source_a_type, id: options.source_a_id, citation: sourceA.citation },
      { type: options.source_b_type, id: options.source_b_id, citation: sourceB.citation }
    );
  }
  
  // Count conflicts by severity
  const criticalCount = conflicts.filter(c => c.severity === ConflictSeverity.CRITICAL).length;
  const highCount = conflicts.filter(c => c.severity === ConflictSeverity.HIGH).length;
  const mediumCount = conflicts.filter(c => c.severity === ConflictSeverity.MEDIUM).length;
  const lowCount = conflicts.filter(c => c.severity === ConflictSeverity.LOW).length;
  
  return {
    matter_id: options.matter_id,
    comparison_type: options.comparison_type,
    source_a_id: options.source_a_id,
    source_a_type: options.source_a_type,
    source_b_id: options.source_b_id,
    source_b_type: options.source_b_type,
    differences,
    conflicts,
    similarity_score: similarity,
    total_differences: differences.length,
    critical_conflicts: criticalCount,
    high_conflicts: highCount,
    medium_conflicts: mediumCount,
    low_conflicts: lowCount
  };
}

/**
 * Fetch source text by type and ID
 */
async function fetchSource(
  db: D1Database,
  sourceType: string,
  sourceId: number
): Promise<{ text: string; citation?: string } | null> {
  if (sourceType === 'extraction') {
    const result = await db.prepare(`
      SELECT extracted_data FROM litigation_extractions WHERE id = ?
    `).bind(sourceId).first();
    
    if (result) {
      const data = JSON.parse(result.extracted_data as string);
      return { text: JSON.stringify(data) };
    }
  } else if (sourceType === 'deposition') {
    const result = await db.prepare(`
      SELECT GROUP_CONCAT(question || ' ' || answer, ' ') as text
      FROM deposition_excerpts
      WHERE deposition_id = ?
    `).bind(sourceId).first();
    
    if (result && result.text) {
      return { text: result.text as string };
    }
  } else if (sourceType === 'citation') {
    const result = await db.prepare(`
      SELECT fact_extracted, page_number, line_start
      FROM litigation_citations
      WHERE id = ?
    `).bind(sourceId).first();
    
    if (result) {
      return {
        text: result.fact_extracted as string,
        citation: `Page ${result.page_number}, Line ${result.line_start}`
      };
    }
  } else if (sourceType === 'timeline_event') {
    const result = await db.prepare(`
      SELECT title || ' ' || description as text, event_date
      FROM timeline_events
      WHERE id = ?
    `).bind(sourceId).first();
    
    if (result) {
      return {
        text: result.text as string,
        citation: `Event on ${result.event_date}`
      };
    }
  }
  
  return null;
}

/**
 * Save comparison to database
 */
export async function saveComparison(
  db: D1Database,
  comparison: ComparisonResult,
  userId: number
): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO document_comparisons (
      matter_id, comparison_type, source_a_id, source_a_type,
      source_b_id, source_b_type, differences, conflicts,
      similarity_score, total_differences, critical_conflicts,
      high_conflicts, medium_conflicts, low_conflicts, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    comparison.matter_id,
    comparison.comparison_type,
    comparison.source_a_id,
    comparison.source_a_type,
    comparison.source_b_id,
    comparison.source_b_type,
    JSON.stringify(comparison.differences),
    JSON.stringify(comparison.conflicts),
    comparison.similarity_score,
    comparison.total_differences,
    comparison.critical_conflicts,
    comparison.high_conflicts,
    comparison.medium_conflicts,
    comparison.low_conflicts,
    userId
  ).run();
  
  return result.meta.last_row_id as number;
}

/**
 * Get comparison history for a matter
 */
export async function getComparisonHistory(
  db: D1Database,
  matterId: number
): Promise<ComparisonResult[]> {
  const result = await db.prepare(`
    SELECT * FROM document_comparisons
    WHERE matter_id = ?
    ORDER BY created_at DESC
  `).bind(matterId).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    matter_id: row.matter_id as number,
    comparison_type: row.comparison_type as ComparisonType,
    source_a_id: row.source_a_id as number,
    source_a_type: row.source_a_type as string,
    source_b_id: row.source_b_id as number,
    source_b_type: row.source_b_type as string,
    differences: JSON.parse(row.differences as string),
    conflicts: JSON.parse(row.conflicts as string),
    similarity_score: row.similarity_score as number,
    total_differences: row.total_differences as number,
    critical_conflicts: row.critical_conflicts as number,
    high_conflicts: row.high_conflicts as number,
    medium_conflicts: row.medium_conflicts as number,
    low_conflicts: row.low_conflicts as number,
    created_at: row.created_at as string,
    created_by: row.created_by as number
  }));
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  db: D1Database,
  comparisonId: number,
  conflictIndex: number,
  resolutionNotes: string,
  resolvedBy: number
): Promise<void> {
  // Get comparison
  const comparison = await db.prepare(`
    SELECT conflicts FROM document_comparisons WHERE id = ?
  `).bind(comparisonId).first();
  
  if (!comparison) {
    throw new Error('Comparison not found');
  }
  
  // Update conflict
  const conflicts = JSON.parse(comparison.conflicts as string) as DetectedConflict[];
  if (conflictIndex < conflicts.length) {
    conflicts[conflictIndex].is_resolved = true;
    conflicts[conflictIndex].resolution_notes = resolutionNotes;
    conflicts[conflictIndex].resolved_by = resolvedBy;
    conflicts[conflictIndex].resolved_at = new Date().toISOString();
    
    // Save back
    await db.prepare(`
      UPDATE document_comparisons
      SET conflicts = ?
      WHERE id = ?
    `).bind(JSON.stringify(conflicts), comparisonId).run();
  }
}
