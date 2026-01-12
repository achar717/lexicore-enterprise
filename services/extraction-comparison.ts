/**
 * LexiCore™ - Extraction Comparison Service
 * 
 * Compares results between legacy and category-based extraction systems
 * Used for A/B testing and quality validation
 */

export interface ComparisonResult {
  timestamp: string
  documentId: string
  extractionType: string
  legacy: {
    success: boolean
    processingTimeMs: number
    fields: string[]
    dataSize: number
    errors?: string[]
  }
  category: {
    success: boolean
    processingTimeMs: number
    category: string
    fields: string[]
    dataSize: number
    errors?: string[]
  }
  metrics: {
    timeDifferenceMs: number
    timeImprovement: number // Percentage
    fieldsInLegacy: number
    fieldsInCategory: number
    fieldsInBoth: number
    fieldsOnlyInLegacy: string[]
    fieldsOnlyInCategory: string[]
  }
  quality: {
    similarityScore: number // 0-1
    hasMajorDifferences: boolean
    differences: Array<{
      field: string
      legacyValue: any
      categoryValue: any
      type: 'missing' | 'different' | 'added'
    }>
  }
}

/**
 * Compare extraction results from legacy and category-based systems
 */
export function compareExtractionResults(
  documentId: string,
  extractionType: string,
  legacyResult: {
    success: boolean
    data: any
    processingTimeMs: number
    errors?: string[]
  },
  categoryResult: {
    success: boolean
    data: any
    metadata: any
    errors?: string[]
  }
): ComparisonResult {
  const legacyFields = legacyResult.success ? Object.keys(legacyResult.data || {}) : []
  const categoryFields = categoryResult.success ? Object.keys(categoryResult.data || {}) : []
  
  // Calculate field overlap
  const fieldsInBoth = legacyFields.filter(f => categoryFields.includes(f))
  const fieldsOnlyInLegacy = legacyFields.filter(f => !categoryFields.includes(f))
  const fieldsOnlyInCategory = categoryFields.filter(f => !legacyFields.includes(f))
  
  // Calculate timing metrics
  const timeDifferenceMs = legacyResult.processingTimeMs - categoryResult.metadata.processingTimeMs
  const timeImprovement = legacyResult.processingTimeMs > 0
    ? (timeDifferenceMs / legacyResult.processingTimeMs) * 100
    : 0
  
  // Detect differences in shared fields
  const differences: ComparisonResult['quality']['differences'] = []
  
  for (const field of fieldsInBoth) {
    const legacyValue = legacyResult.data[field]
    const categoryValue = categoryResult.data[field]
    
    // Skip if both are undefined/null
    if (!legacyValue && !categoryValue) continue
    
    // Deep comparison
    if (JSON.stringify(legacyValue) !== JSON.stringify(categoryValue)) {
      differences.push({
        field,
        legacyValue,
        categoryValue,
        type: 'different'
      })
    }
  }
  
  // Add missing fields
  for (const field of fieldsOnlyInLegacy) {
    differences.push({
      field,
      legacyValue: legacyResult.data[field],
      categoryValue: undefined,
      type: 'missing'
    })
  }
  
  // Add added fields
  for (const field of fieldsOnlyInCategory) {
    differences.push({
      field,
      legacyValue: undefined,
      categoryValue: categoryResult.data[field],
      type: 'added'
    })
  }
  
  // Calculate similarity score (0-1)
  const totalFields = Math.max(legacyFields.length, categoryFields.length)
  const similarityScore = totalFields > 0
    ? fieldsInBoth.length / totalFields
    : 1
  
  // Major differences: >20% field difference or >5 different values
  const hasMajorDifferences = 
    similarityScore < 0.8 || 
    differences.filter(d => d.type === 'different').length > 5
  
  return {
    timestamp: new Date().toISOString(),
    documentId,
    extractionType,
    legacy: {
      success: legacyResult.success,
      processingTimeMs: legacyResult.processingTimeMs,
      fields: legacyFields,
      dataSize: JSON.stringify(legacyResult.data || {}).length,
      errors: legacyResult.errors
    },
    category: {
      success: categoryResult.success,
      processingTimeMs: categoryResult.metadata.processingTimeMs,
      category: categoryResult.metadata.category,
      fields: categoryFields,
      dataSize: JSON.stringify(categoryResult.data || {}).length,
      errors: categoryResult.errors
    },
    metrics: {
      timeDifferenceMs,
      timeImprovement,
      fieldsInLegacy: legacyFields.length,
      fieldsInCategory: categoryFields.length,
      fieldsInBoth: fieldsInBoth.length,
      fieldsOnlyInLegacy,
      fieldsOnlyInCategory
    },
    quality: {
      similarityScore,
      hasMajorDifferences,
      differences
    }
  }
}

/**
 * Log comparison results to console with formatting
 */
export function logComparison(comparison: ComparisonResult): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔬 EXTRACTION COMPARISON')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📄 Document: ${comparison.documentId}`)
  console.log(`📋 Type: ${comparison.extractionType}`)
  console.log(`⏰ Timestamp: ${comparison.timestamp}`)
  console.log('')
  
  console.log('📊 RESULTS:')
  console.log(`  Legacy:   ${comparison.legacy.success ? '✅ Success' : '❌ Failed'} | ${comparison.legacy.processingTimeMs}ms | ${comparison.legacy.fields.length} fields`)
  console.log(`  Category: ${comparison.category.success ? '✅ Success' : '❌ Failed'} | ${comparison.category.processingTimeMs}ms | ${comparison.category.fields.length} fields | ${comparison.category.category}`)
  console.log('')
  
  console.log('⚡ PERFORMANCE:')
  console.log(`  Time Difference: ${comparison.metrics.timeDifferenceMs}ms`)
  console.log(`  Improvement: ${comparison.metrics.timeImprovement.toFixed(1)}%`)
  console.log('')
  
  console.log('📈 FIELD ANALYSIS:')
  console.log(`  Common Fields: ${comparison.metrics.fieldsInBoth}`)
  console.log(`  Legacy Only: ${comparison.metrics.fieldsOnlyInLegacy.length} ${comparison.metrics.fieldsOnlyInLegacy.length > 0 ? JSON.stringify(comparison.metrics.fieldsOnlyInLegacy) : ''}`)
  console.log(`  Category Only: ${comparison.metrics.fieldsOnlyInCategory.length} ${comparison.metrics.fieldsOnlyInCategory.length > 0 ? JSON.stringify(comparison.metrics.fieldsOnlyInCategory) : ''}`)
  console.log('')
  
  console.log('🎯 QUALITY:')
  console.log(`  Similarity Score: ${(comparison.quality.similarityScore * 100).toFixed(1)}%`)
  console.log(`  Major Differences: ${comparison.quality.hasMajorDifferences ? '⚠️ YES' : '✅ NO'}`)
  console.log(`  Total Differences: ${comparison.quality.differences.length}`)
  
  if (comparison.quality.differences.length > 0) {
    console.log('')
    console.log('🔍 DIFFERENCES (first 5):')
    comparison.quality.differences.slice(0, 5).forEach((diff, idx) => {
      console.log(`  ${idx + 1}. ${diff.field} (${diff.type})`)
      if (diff.type === 'different') {
        console.log(`     Legacy: ${JSON.stringify(diff.legacyValue).substring(0, 100)}`)
        console.log(`     Category: ${JSON.stringify(diff.categoryValue).substring(0, 100)}`)
      }
    })
    if (comparison.quality.differences.length > 5) {
      console.log(`  ... and ${comparison.quality.differences.length - 5} more`)
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

/**
 * Save comparison results to database
 */
export async function saveComparisonToDatabase(
  db: any,
  comparison: ComparisonResult
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO extraction_comparisons (
        id, document_id, extraction_type, comparison_data, created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      `comp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      comparison.documentId,
      comparison.extractionType,
      JSON.stringify(comparison)
    ).run()
    
    console.log('✅ Comparison saved to database')
  } catch (error) {
    console.error('❌ Failed to save comparison:', error)
    // Don't throw - comparison logging should never break extraction
  }
}

/**
 * Get comparison statistics for a document type
 */
export function getComparisonStats(comparisons: ComparisonResult[]) {
  if (comparisons.length === 0) {
    return null
  }
  
  const stats = {
    totalComparisons: comparisons.length,
    legacySuccessRate: comparisons.filter(c => c.legacy.success).length / comparisons.length,
    categorySuccessRate: comparisons.filter(c => c.category.success).length / comparisons.length,
    avgTimeImprovement: comparisons.reduce((sum, c) => sum + c.metrics.timeImprovement, 0) / comparisons.length,
    avgSimilarityScore: comparisons.reduce((sum, c) => sum + c.quality.similarityScore, 0) / comparisons.length,
    majorDifferencesCount: comparisons.filter(c => c.quality.hasMajorDifferences).length,
    avgLegacyTime: comparisons.reduce((sum, c) => sum + c.legacy.processingTimeMs, 0) / comparisons.length,
    avgCategoryTime: comparisons.reduce((sum, c) => sum + c.category.processingTimeMs, 0) / comparisons.length
  }
  
  return stats
}
