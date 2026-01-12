/**
 * LexiCore™ Litigation - Advanced Search & Discovery Intelligence
 * Phase 6: Comprehensive Search Across All Litigation Data
 * 
 * Legal Compliance: Search is for DISCOVERY ONLY
 * - Results show facts as extracted from documents
 * - Search does NOT establish legal significance
 * - Attorney must verify all search results
 * - Search does NOT create attorney work product
 */

import type { D1Database } from '@cloudflare/workers-types';

// Search Scope
export enum SearchScope {
  ALL = 'all',
  EXTRACTIONS = 'extractions',
  DEPOSITIONS = 'depositions',
  EXHIBITS = 'exhibits',
  TIMELINE = 'timeline',
  DOCUMENTS = 'documents'
}

// Search Result Types
export enum SearchResultType {
  EXTRACTION = 'extraction',
  CITATION = 'citation',
  DEPOSITION = 'deposition',
  EXCERPT = 'excerpt',
  EXHIBIT = 'exhibit',
  TIMELINE_EVENT = 'timeline_event',
  DOCUMENT = 'document'
}

// Search Result
export interface SearchResult {
  id: number;
  type: SearchResultType;
  title: string;
  content: string;
  highlight?: string;
  relevance_score: number;
  source: {
    document_id?: number;
    document_name?: string;
    page_number?: number;
    line_start?: number;
    line_end?: number;
    bates_number?: string;
    event_date?: string;
  };
  metadata?: Record<string, any>;
  created_at: string;
}

// Search Filters
export interface SearchFilters {
  scope?: SearchScope;
  document_types?: string[];
  date_from?: string;
  date_to?: string;
  event_types?: string[];
  exhibit_types?: string[];
  verified_only?: boolean;
  min_confidence?: number;
  parties?: string[];
  has_bates?: boolean;
}

// Search Options
export interface SearchOptions {
  matter_id: number;
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  sort_by?: 'relevance' | 'date' | 'confidence';
  sort_order?: 'asc' | 'desc';
}

// Search Results Response
export interface SearchResultsResponse {
  results: SearchResult[];
  total: number;
  query: string;
  execution_time_ms: number;
  filters_applied: SearchFilters;
  scope: SearchScope;
}

// Saved Search
export interface SavedSearch {
  id?: number;
  user_id: number;
  matter_id: number;
  name: string;
  query: string;
  filters: SearchFilters;
  created_at?: string;
  last_used?: string;
  use_count?: number;
}

// Search Analytics
export interface SearchAnalytics {
  total_searches: number;
  unique_queries: number;
  avg_results_per_search: number;
  most_common_queries: Array<{ query: string; count: number }>;
  most_searched_scopes: Array<{ scope: SearchScope; count: number }>;
  search_history: Array<{
    query: string;
    scope: SearchScope;
    result_count: number;
    timestamp: string;
  }>;
}

/**
 * Calculate relevance score for text match
 */
function calculateRelevanceScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(t => t.length > 0);
  
  let score = 0;
  
  // Exact match bonus (+50)
  if (lowerText.includes(lowerQuery)) {
    score += 50;
  }
  
  // Term matches (+10 each)
  for (const term of terms) {
    if (lowerText.includes(term)) {
      score += 10;
      
      // Multiple occurrences (+5 each, max +20)
      const occurrences = (lowerText.match(new RegExp(term, 'g')) || []).length;
      score += Math.min((occurrences - 1) * 5, 20);
    }
  }
  
  // Title/beginning match bonus (+20)
  if (lowerText.substring(0, 100).includes(lowerQuery)) {
    score += 20;
  }
  
  return Math.min(score, 100);
}

/**
 * Create text highlight with query terms
 */
function createHighlight(text: string, query: string, contextLength: number = 100): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Find first occurrence of query or first term
  const terms = lowerQuery.split(/\s+/).filter(t => t.length > 0);
  let matchIndex = lowerText.indexOf(lowerQuery);
  
  if (matchIndex === -1) {
    // Try individual terms
    for (const term of terms) {
      matchIndex = lowerText.indexOf(term);
      if (matchIndex !== -1) break;
    }
  }
  
  if (matchIndex === -1) {
    // No match found, return beginning
    return text.substring(0, contextLength) + '...';
  }
  
  // Extract context around match
  const start = Math.max(0, matchIndex - contextLength / 2);
  const end = Math.min(text.length, matchIndex + contextLength / 2);
  
  let highlight = text.substring(start, end);
  if (start > 0) highlight = '...' + highlight;
  if (end < text.length) highlight = highlight + '...';
  
  // Bold the matching terms
  for (const term of terms) {
    const regex = new RegExp(`(${term})`, 'gi');
    highlight = highlight.replace(regex, '<mark>$1</mark>');
  }
  
  return highlight;
}

/**
 * Search extractions
 */
async function searchExtractions(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { matter_id, query, filters, limit = 50, offset = 0 } = options;
  
  let sql = `
    SELECT 
      le.id,
      le.extracted_data,
      le.confidence_score,
      le.review_status,
      le.created_at,
      d.id as document_id,
      d.original_filename as document_name,
      d.document_type
    FROM litigation_extractions le
    JOIN documents d ON le.document_id = d.id
    WHERE d.matter_id = ?
  `;
  
  const params: any[] = [matter_id];
  
  // Apply filters
  if (filters?.document_types && filters.document_types.length > 0) {
    sql += ` AND d.document_type IN (${filters.document_types.map(() => '?').join(',')})`;
    params.push(...filters.document_types);
  }
  
  if (filters?.date_from) {
    sql += ` AND le.created_at >= ?`;
    params.push(filters.date_from);
  }
  
  if (filters?.date_to) {
    sql += ` AND le.created_at <= ?`;
    params.push(filters.date_to);
  }
  
  if (filters?.verified_only) {
    sql += ` AND le.review_status = 'approved'`;
  }
  
  if (filters?.min_confidence) {
    sql += ` AND le.confidence_score >= ?`;
    params.push(filters.min_confidence);
  }
  
  sql += ` ORDER BY le.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await db.prepare(sql).bind(...params).all();
  
  const searchResults: SearchResult[] = [];
  
  for (const row of result.results || []) {
    const extractedData = JSON.parse(row.extracted_data as string);
    const fullText = JSON.stringify(extractedData);
    
    // Check if query matches
    if (fullText.toLowerCase().includes(query.toLowerCase())) {
      const relevance = calculateRelevanceScore(fullText, query);
      
      searchResults.push({
        id: row.id as number,
        type: SearchResultType.EXTRACTION,
        title: `Extraction from ${row.document_name}`,
        content: fullText.substring(0, 500),
        highlight: createHighlight(fullText, query, 150),
        relevance_score: relevance,
        source: {
          document_id: row.document_id as number,
          document_name: row.document_name as string
        },
        metadata: {
          confidence_score: row.confidence_score,
          review_status: row.review_status,
          document_type: row.document_type
        },
        created_at: row.created_at as string
      });
    }
  }
  
  return searchResults;
}

/**
 * Search citations
 */
async function searchCitations(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { matter_id, query, filters, limit = 50, offset = 0 } = options;
  
  let sql = `
    SELECT 
      lc.id,
      lc.extracted_value,
      lc.verbatim_text,
      lc.page_number,
      lc.line_number,
      lc.confidence,
      lc.created_at,
      d.id as document_id,
      d.original_filename as document_name
    FROM litigation_citations lc
    JOIN litigation_extractions le ON lc.extraction_id = le.id
    JOIN documents d ON le.document_id = d.id
    WHERE d.matter_id = ?
    AND (lc.extracted_value LIKE ? OR lc.verbatim_text LIKE ?)
  `;
  
  const params: any[] = [matter_id, `%${query}%`, `%${query}%`];
  
  if (filters?.min_confidence) {
    sql += ` AND lc.confidence >= ?`;
    params.push(filters.min_confidence);
  }
  
  sql += ` ORDER BY lc.confidence DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    type: SearchResultType.CITATION,
    title: `Citation from ${row.document_name}`,
    content: row.verbatim_text as string,
    highlight: createHighlight(row.verbatim_text as string, query),
    relevance_score: calculateRelevanceScore(row.verbatim_text as string, query),
    source: {
      document_id: row.document_id as number,
      document_name: row.document_name as string,
      page_number: row.page_number as number
    },
    metadata: {
      confidence_score: row.confidence
    },
    created_at: row.created_at as string
  }));
}

/**
 * Search depositions
 */
async function searchDepositions(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { matter_id, query, filters, limit = 50, offset = 0 } = options;
  
  let sql = `
    SELECT 
      de.id,
      de.excerpt_text,
      de.topic,
      de.page_number,
      de.line_start,
      de.line_end,
      d.id as deposition_id,
      d.deponent_name,
      d.deposition_date,
      doc.original_filename as document_name
    FROM deposition_excerpts de
    JOIN depositions d ON de.deposition_id = d.id
    JOIN documents doc ON d.document_id = doc.id
    WHERE doc.matter_id = ?
    AND de.excerpt_text LIKE ?
  `;
  
  const params: any[] = [matter_id, `%${query}%`];
  
  sql += ` ORDER BY de.page_number ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => {
    const content = row.excerpt_text as string;
    
    return {
      id: row.id as number,
      type: SearchResultType.EXCERPT,
      title: `Deposition of ${row.deponent_name}${row.topic ? ': ' + row.topic : ''}`,
      content,
      highlight: createHighlight(content, query),
      relevance_score: calculateRelevanceScore(content, query),
      source: {
        document_name: row.document_name as string,
        page_number: row.page_number as number,
        line_start: row.line_start as number,
        line_end: row.line_end as number,
        event_date: row.deposition_date as string
      },
      metadata: {
        deposition_id: row.deposition_id,
        deponent_name: row.deponent_name
      },
      created_at: row.deposition_date as string
    };
  });
}

/**
 * Search exhibits
 */
async function searchExhibits(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { matter_id, query, filters, limit = 50, offset = 0 } = options;
  
  let sql = `
    SELECT 
      e.id,
      e.exhibit_number,
      e.exhibit_label,
      e.exhibit_type,
      e.description,
      e.status,
      e.bates_number_start,
      e.created_at,
      d.original_filename as document_name
    FROM exhibits e
    JOIN documents d ON e.document_id = d.id
    WHERE e.matter_id = ?
    AND (e.description LIKE ? OR e.exhibit_label LIKE ?)
  `;
  
  const params: any[] = [matter_id, `%${query}%`, `%${query}%`];
  
  if (filters?.exhibit_types && filters.exhibit_types.length > 0) {
    sql += ` AND e.exhibit_type IN (${filters.exhibit_types.map(() => '?').join(',')})`;
    params.push(...filters.exhibit_types);
  }
  
  sql += ` ORDER BY e.exhibit_number ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    type: SearchResultType.EXHIBIT,
    title: `Exhibit ${row.exhibit_label || row.exhibit_number}`,
    content: row.description as string,
    highlight: createHighlight(row.description as string, query),
    relevance_score: calculateRelevanceScore((row.description as string) + ' ' + (row.exhibit_label as string), query),
    source: {
      document_name: row.document_name as string,
      bates_number: row.bates_number_start as string
    },
    metadata: {
      exhibit_number: row.exhibit_number,
      exhibit_type: row.exhibit_type,
      status: row.status
    },
    created_at: row.created_at as string
  }));
}

/**
 * Search timeline events
 */
async function searchTimelineEvents(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { matter_id, query, filters, limit = 50, offset = 0 } = options;
  
  let sql = `
    SELECT 
      te.id,
      te.event_date,
      te.event_type,
      te.title,
      te.description,
      te.confidence_score,
      te.is_verified,
      te.source_page_number,
      te.source_bates_number,
      te.created_at,
      d.original_filename as document_name
    FROM timeline_events te
    JOIN documents d ON te.source_document_id = d.id
    WHERE te.matter_id = ?
    AND (te.title LIKE ? OR te.description LIKE ?)
  `;
  
  const params: any[] = [matter_id, `%${query}%`, `%${query}%`];
  
  if (filters?.event_types && filters.event_types.length > 0) {
    sql += ` AND te.event_type IN (${filters.event_types.map(() => '?').join(',')})`;
    params.push(...filters.event_types);
  }
  
  if (filters?.verified_only) {
    sql += ` AND te.is_verified = 1`;
  }
  
  sql += ` ORDER BY te.event_date DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    type: SearchResultType.TIMELINE_EVENT,
    title: row.title as string,
    content: row.description as string,
    highlight: createHighlight(row.description as string, query),
    relevance_score: calculateRelevanceScore((row.title as string) + ' ' + (row.description as string), query),
    source: {
      document_name: row.document_name as string,
      page_number: row.source_page_number as number,
      bates_number: row.source_bates_number as string,
      event_date: row.event_date as string
    },
    metadata: {
      event_type: row.event_type,
      confidence_score: row.confidence_score,
      is_verified: row.is_verified === 1
    },
    created_at: row.created_at as string
  }));
}

/**
 * Main search function
 */
export async function search(
  db: D1Database,
  options: SearchOptions
): Promise<SearchResultsResponse> {
  const startTime = Date.now();
  const scope = options.filters?.scope || SearchScope.ALL;
  
  let allResults: SearchResult[] = [];
  
  // Search based on scope
  if (scope === SearchScope.ALL || scope === SearchScope.EXTRACTIONS) {
    const extractionResults = await searchExtractions(db, options);
    allResults.push(...extractionResults);
    
    const citationResults = await searchCitations(db, options);
    allResults.push(...citationResults);
  }
  
  if (scope === SearchScope.ALL || scope === SearchScope.DEPOSITIONS) {
    const depositionResults = await searchDepositions(db, options);
    allResults.push(...depositionResults);
  }
  
  if (scope === SearchScope.ALL || scope === SearchScope.EXHIBITS) {
    const exhibitResults = await searchExhibits(db, options);
    allResults.push(...exhibitResults);
  }
  
  if (scope === SearchScope.ALL || scope === SearchScope.TIMELINE) {
    const timelineResults = await searchTimelineEvents(db, options);
    allResults.push(...timelineResults);
  }
  
  // Sort by relevance or other criteria
  const sortBy = options.sort_by || 'relevance';
  const sortOrder = options.sort_order || 'desc';
  
  allResults.sort((a, b) => {
    let compareValue = 0;
    
    if (sortBy === 'relevance') {
      compareValue = a.relevance_score - b.relevance_score;
    } else if (sortBy === 'date') {
      compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sortBy === 'confidence') {
      compareValue = (a.metadata?.confidence_score || 0) - (b.metadata?.confidence_score || 0);
    }
    
    return sortOrder === 'desc' ? -compareValue : compareValue;
  });
  
  // Apply pagination
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  const paginatedResults = allResults.slice(offset, offset + limit);
  
  const executionTime = Date.now() - startTime;
  
  return {
    results: paginatedResults,
    total: allResults.length,
    query: options.query,
    execution_time_ms: executionTime,
    filters_applied: options.filters || {},
    scope
  };
}

/**
 * Save search for later use
 */
export async function saveSearch(
  db: D1Database,
  search: SavedSearch
): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO saved_searches (
      user_id, matter_id, name, query, filters, use_count
    ) VALUES (?, ?, ?, ?, ?, 0)
  `).bind(
    search.user_id,
    search.matter_id,
    search.name,
    search.query,
    JSON.stringify(search.filters)
  ).run();
  
  return result.meta.last_row_id as number;
}

/**
 * Get saved searches for user
 */
export async function getSavedSearches(
  db: D1Database,
  userId: number,
  matterId?: number
): Promise<SavedSearch[]> {
  let sql = `
    SELECT id, user_id, matter_id, name, query, filters, created_at, last_used, use_count
    FROM saved_searches
    WHERE user_id = ?
  `;
  
  const params: any[] = [userId];
  
  if (matterId) {
    sql += ` AND matter_id = ?`;
    params.push(matterId);
  }
  
  sql += ` ORDER BY last_used DESC, use_count DESC`;
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    user_id: row.user_id as number,
    matter_id: row.matter_id as number,
    name: row.name as string,
    query: row.query as string,
    filters: JSON.parse(row.filters as string),
    created_at: row.created_at as string,
    last_used: row.last_used as string,
    use_count: row.use_count as number
  }));
}

/**
 * Update saved search usage
 */
export async function updateSearchUsage(
  db: D1Database,
  searchId: number
): Promise<void> {
  await db.prepare(`
    UPDATE saved_searches
    SET use_count = use_count + 1, last_used = datetime('now')
    WHERE id = ?
  `).bind(searchId).run();
}

/**
 * Delete saved search
 */
export async function deleteSavedSearch(
  db: D1Database,
  searchId: number
): Promise<void> {
  await db.prepare(`
    DELETE FROM saved_searches WHERE id = ?
  `).bind(searchId).run();
}

/**
 * Log search for analytics
 */
export async function logSearch(
  db: D1Database,
  userId: number,
  matterId: number,
  query: string,
  scope: SearchScope,
  resultCount: number
): Promise<void> {
  await db.prepare(`
    INSERT INTO search_history (
      user_id, matter_id, query, scope, result_count
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(userId, matterId, query, scope, resultCount).run();
}

/**
 * Get search analytics
 */
export async function getSearchAnalytics(
  db: D1Database,
  matterId: number,
  days: number = 30
): Promise<SearchAnalytics> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // Total searches
  const totalResult = await db.prepare(`
    SELECT COUNT(*) as total
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
  `).bind(matterId, cutoffDate.toISOString()).first();
  
  // Unique queries
  const uniqueResult = await db.prepare(`
    SELECT COUNT(DISTINCT query) as unique_count
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
  `).bind(matterId, cutoffDate.toISOString()).first();
  
  // Average results
  const avgResult = await db.prepare(`
    SELECT AVG(result_count) as avg_results
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
  `).bind(matterId, cutoffDate.toISOString()).first();
  
  // Most common queries
  const commonQueries = await db.prepare(`
    SELECT query, COUNT(*) as count
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
    GROUP BY query
    ORDER BY count DESC
    LIMIT 10
  `).bind(matterId, cutoffDate.toISOString()).all();
  
  // Most searched scopes
  const commonScopes = await db.prepare(`
    SELECT scope, COUNT(*) as count
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
    GROUP BY scope
    ORDER BY count DESC
  `).bind(matterId, cutoffDate.toISOString()).all();
  
  // Recent history
  const history = await db.prepare(`
    SELECT query, scope, result_count, created_at
    FROM search_history
    WHERE matter_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(matterId, cutoffDate.toISOString()).all();
  
  return {
    total_searches: totalResult?.total as number || 0,
    unique_queries: uniqueResult?.unique_count as number || 0,
    avg_results_per_search: Math.round(avgResult?.avg_results as number || 0),
    most_common_queries: (commonQueries.results || []).map(r => ({
      query: r.query as string,
      count: r.count as number
    })),
    most_searched_scopes: (commonScopes.results || []).map(r => ({
      scope: r.scope as SearchScope,
      count: r.count as number
    })),
    search_history: (history.results || []).map(r => ({
      query: r.query as string,
      scope: r.scope as SearchScope,
      result_count: r.result_count as number,
      timestamp: r.created_at as string
    }))
  };
}
