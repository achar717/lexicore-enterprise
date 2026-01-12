/**
 * LexiCore™ Litigation - Timeline Builder Service
 * Phase 5: Chronological Event Organization
 * 
 * Legal Compliance: Timeline is for ORGANIZATION ONLY
 * - Events are extracted facts from documents
 * - Timeline does NOT establish legal significance
 * - Attorney must verify all event dates and connections
 * - Timeline does NOT establish causation or liability
 */

import type { D1Database } from '@cloudflare/workers-types';

// Timeline Event Types
export enum TimelineEventType {
  FILING = 'filing',              // Court filings, pleadings
  DEADLINE = 'deadline',          // Court deadlines, response dates
  DEPOSITION = 'deposition',      // Deposition dates
  INCIDENT = 'incident',          // Key factual events
  CORRESPONDENCE = 'correspondence', // Letters, emails
  CONTRACT = 'contract',          // Contract execution, amendments
  DISCOVERY = 'discovery',        // Discovery events
  HEARING = 'hearing',            // Court hearings, motions
  SETTLEMENT = 'settlement',      // Settlement discussions
  OTHER = 'other'                 // Other events
}

// Timeline Event Source
export interface TimelineEventSource {
  document_id: number;
  extraction_id?: number;
  citation_id?: number;
  exhibit_id?: number;
  deposition_id?: number;
  page_number?: number;
  line_start?: number;
  line_end?: number;
  bates_number?: string;
}

// Timeline Event
export interface TimelineEvent {
  id?: number;
  matter_id: number;
  event_date: string;              // ISO date (YYYY-MM-DD)
  event_type: TimelineEventType;
  title: string;                   // Brief event title
  description: string;             // Detailed description
  parties_involved?: string[];     // Parties involved in event
  location?: string;               // Event location
  confidence_score?: number;       // 0-100
  is_verified: boolean;           // Attorney verified
  source: TimelineEventSource;     // Document source
  tags?: string[];                // Custom tags
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  reviewed_by?: number;
  reviewed_at?: string;
}

// Timeline Filters
export interface TimelineFilters {
  event_types?: TimelineEventType[];
  start_date?: string;
  end_date?: string;
  parties?: string[];
  tags?: string[];
  verified_only?: boolean;
  min_confidence?: number;
}

// Timeline Statistics
export interface TimelineStats {
  total_events: number;
  verified_events: number;
  unverified_events: number;
  events_by_type: Record<TimelineEventType, number>;
  date_range: {
    earliest: string | null;
    latest: string | null;
  };
  avg_confidence: number;
}

// Date Detection Patterns
const DATE_PATTERNS = [
  // ISO format: 2024-01-15
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  // US format: 01/15/2024, 1/15/2024
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
  // Written format: January 15, 2024
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  // Abbreviated: Jan 15, 2024
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi,
];

// Event Type Detection Keywords
const EVENT_TYPE_KEYWORDS: Record<TimelineEventType, string[]> = {
  [TimelineEventType.FILING]: ['filed', 'complaint', 'answer', 'motion', 'petition', 'pleading'],
  [TimelineEventType.DEADLINE]: ['deadline', 'due date', 'must respond', 'by this date'],
  [TimelineEventType.DEPOSITION]: ['deposition', 'deposed', 'testimony', 'sworn statement'],
  [TimelineEventType.INCIDENT]: ['incident', 'occurred', 'happened', 'took place', 'event'],
  [TimelineEventType.CORRESPONDENCE]: ['letter', 'email', 'correspondence', 'communication'],
  [TimelineEventType.CONTRACT]: ['contract', 'agreement', 'executed', 'signed'],
  [TimelineEventType.DISCOVERY]: ['discovery', 'interrogatory', 'request for production', 'subpoena'],
  [TimelineEventType.HEARING]: ['hearing', 'court date', 'appearance', 'argued'],
  [TimelineEventType.SETTLEMENT]: ['settlement', 'offer', 'negotiation', 'mediation'],
  [TimelineEventType.OTHER]: []
};

/**
 * Extract dates from text
 */
export function extractDates(text: string): string[] {
  const dates: string[] = [];
  
  for (const pattern of DATE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      try {
        let dateStr: string;
        
        // ISO format
        if (match[0].includes('-')) {
          dateStr = match[0];
        }
        // US format (MM/DD/YYYY)
        else if (match[0].includes('/')) {
          const [month, day, year] = match.slice(1, 4);
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Written format
        else {
          const monthMap: Record<string, string> = {
            'january': '01', 'jan': '01',
            'february': '02', 'feb': '02',
            'march': '03', 'mar': '03',
            'april': '04', 'apr': '04',
            'may': '05',
            'june': '06', 'jun': '06',
            'july': '07', 'jul': '07',
            'august': '08', 'aug': '08',
            'september': '09', 'sep': '09', 'sept': '09',
            'october': '10', 'oct': '10',
            'november': '11', 'nov': '11',
            'december': '12', 'dec': '12'
          };
          const monthName = match[1].toLowerCase().replace('.', '');
          const month = monthMap[monthName] || '01';
          const day = match[2].padStart(2, '0');
          const year = match[3];
          dateStr = `${year}-${month}-${day}`;
        }
        
        // Validate date
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          dates.push(dateStr);
        }
      } catch (e) {
        // Skip invalid dates
      }
    }
  }
  
  return Array.from(new Set(dates)); // Remove duplicates
}

/**
 * Detect event type from text
 */
export function detectEventType(text: string): TimelineEventType {
  const lowerText = text.toLowerCase();
  
  for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return type as TimelineEventType;
    }
  }
  
  return TimelineEventType.OTHER;
}

/**
 * Calculate confidence score for detected event
 */
export function calculateEventConfidence(event: Partial<TimelineEvent>): number {
  let score = 0;
  
  // Has clear date (+40)
  if (event.event_date) {
    score += 40;
  }
  
  // Has specific event type (+20)
  if (event.event_type && event.event_type !== TimelineEventType.OTHER) {
    score += 20;
  }
  
  // Has document source (+20)
  if (event.source?.document_id) {
    score += 20;
  }
  
  // Has page/line citation (+10)
  if (event.source?.page_number) {
    score += 10;
  }
  
  // Has Bates number (+10)
  if (event.source?.bates_number) {
    score += 10;
  }
  
  return Math.min(score, 100);
}

/**
 * Create timeline event
 */
export async function createTimelineEvent(
  db: D1Database,
  event: TimelineEvent
): Promise<number> {
  // Calculate confidence if not provided
  if (!event.confidence_score) {
    event.confidence_score = calculateEventConfidence(event);
  }
  
  const result = await db.prepare(`
    INSERT INTO timeline_events (
      matter_id, event_date, event_type, title, description,
      parties_involved, location, confidence_score, is_verified,
      source_document_id, source_extraction_id, source_citation_id,
      source_exhibit_id, source_deposition_id, source_page_number,
      source_line_start, source_line_end, source_bates_number,
      tags, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.matter_id,
    event.event_date,
    event.event_type,
    event.title,
    event.description,
    event.parties_involved ? JSON.stringify(event.parties_involved) : null,
    event.location || null,
    event.confidence_score,
    event.is_verified ? 1 : 0,
    event.source.document_id,
    event.source.extraction_id || null,
    event.source.citation_id || null,
    event.source.exhibit_id || null,
    event.source.deposition_id || null,
    event.source.page_number || null,
    event.source.line_start || null,
    event.source.line_end || null,
    event.source.bates_number || null,
    event.tags ? JSON.stringify(event.tags) : null,
    event.created_by || null
  ).run();
  
  return result.meta.last_row_id as number;
}

/**
 * Auto-detect events from extraction
 */
export async function autoDetectEventsFromExtraction(
  db: D1Database,
  matterId: number,
  documentId: number,
  extractionId: number,
  extractedText: string
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  
  // Extract all dates from text
  const dates = extractDates(extractedText);
  
  // For each date, try to create an event
  for (const dateStr of dates) {
    // Get context around date (50 chars before and after)
    const dateIndex = extractedText.indexOf(dateStr);
    if (dateIndex === -1) continue;
    
    const start = Math.max(0, dateIndex - 50);
    const end = Math.min(extractedText.length, dateIndex + dateStr.length + 50);
    const context = extractedText.substring(start, end).trim();
    
    // Detect event type from context
    const eventType = detectEventType(context);
    
    // Create event title (first 100 chars of context)
    const title = context.substring(0, 100) + (context.length > 100 ? '...' : '');
    
    const event: TimelineEvent = {
      matter_id: matterId,
      event_date: dateStr,
      event_type: eventType,
      title,
      description: context,
      confidence_score: 0, // Will be calculated
      is_verified: false,
      source: {
        document_id: documentId,
        extraction_id: extractionId
      }
    };
    
    event.confidence_score = calculateEventConfidence(event);
    
    // Only add events with reasonable confidence
    if (event.confidence_score >= 40) {
      events.push(event);
    }
  }
  
  return events;
}

/**
 * Get timeline events with filters
 */
export async function getTimelineEvents(
  db: D1Database,
  matterId: string | number,
  filters?: TimelineFilters
): Promise<TimelineEvent[]> {
  let sql = `
    SELECT 
      id, matter_id, event_date, event_type, title, description,
      parties_involved, location, confidence_score, is_verified,
      source_document_id, source_extraction_id, source_citation_id,
      source_exhibit_id, source_deposition_id, source_page_number,
      source_line_start, source_line_end, source_bates_number,
      tags, created_at, updated_at, created_by, reviewed_by, reviewed_at
    FROM timeline_events
    WHERE matter_id = ?
  `;
  
  const params: any[] = [matterId];
  
  // Apply filters
  if (filters?.event_types && filters.event_types.length > 0) {
    sql += ` AND event_type IN (${filters.event_types.map(() => '?').join(',')})`;
    params.push(...filters.event_types);
  }
  
  if (filters?.start_date) {
    sql += ` AND event_date >= ?`;
    params.push(filters.start_date);
  }
  
  if (filters?.end_date) {
    sql += ` AND event_date <= ?`;
    params.push(filters.end_date);
  }
  
  if (filters?.verified_only) {
    sql += ` AND is_verified = 1`;
  }
  
  if (filters?.min_confidence) {
    sql += ` AND confidence_score >= ?`;
    params.push(filters.min_confidence);
  }
  
  sql += ` ORDER BY event_date ASC, created_at ASC`;
  
  const result = await db.prepare(sql).bind(...params).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    matter_id: row.matter_id as number,
    event_date: row.event_date as string,
    event_type: row.event_type as TimelineEventType,
    title: row.title as string,
    description: row.description as string,
    parties_involved: row.parties_involved ? JSON.parse(row.parties_involved as string) : undefined,
    location: row.location as string | undefined,
    confidence_score: row.confidence_score as number,
    is_verified: row.is_verified === 1,
    source: {
      document_id: row.source_document_id as number,
      extraction_id: row.source_extraction_id as number | undefined,
      citation_id: row.source_citation_id as number | undefined,
      exhibit_id: row.source_exhibit_id as number | undefined,
      deposition_id: row.source_deposition_id as number | undefined,
      page_number: row.source_page_number as number | undefined,
      line_start: row.source_line_start as number | undefined,
      line_end: row.source_line_end as number | undefined,
      bates_number: row.source_bates_number as string | undefined
    },
    tags: row.tags ? JSON.parse(row.tags as string) : undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string | undefined,
    created_by: row.created_by as number | undefined,
    reviewed_by: row.reviewed_by as number | undefined,
    reviewed_at: row.reviewed_at as string | undefined
  }));
}

/**
 * Get timeline statistics
 */
export async function getTimelineStats(
  db: D1Database,
  matterId: string | number
): Promise<TimelineStats> {
  // Get counts by verification status
  const countResult = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified,
      AVG(confidence_score) as avg_confidence
    FROM timeline_events
    WHERE matter_id = ?
  `).bind(matterId).first();
  
  // Get counts by event type
  const typeResult = await db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM timeline_events
    WHERE matter_id = ?
    GROUP BY event_type
  `).bind(matterId).all();
  
  // Get date range
  const dateResult = await db.prepare(`
    SELECT MIN(event_date) as earliest, MAX(event_date) as latest
    FROM timeline_events
    WHERE matter_id = ?
  `).bind(matterId).first();
  
  const eventsByType: Record<TimelineEventType, number> = {
    [TimelineEventType.FILING]: 0,
    [TimelineEventType.DEADLINE]: 0,
    [TimelineEventType.DEPOSITION]: 0,
    [TimelineEventType.INCIDENT]: 0,
    [TimelineEventType.CORRESPONDENCE]: 0,
    [TimelineEventType.CONTRACT]: 0,
    [TimelineEventType.DISCOVERY]: 0,
    [TimelineEventType.HEARING]: 0,
    [TimelineEventType.SETTLEMENT]: 0,
    [TimelineEventType.OTHER]: 0
  };
  
  for (const row of typeResult.results || []) {
    eventsByType[row.event_type as TimelineEventType] = row.count as number;
  }
  
  return {
    total_events: countResult?.total as number || 0,
    verified_events: countResult?.verified as number || 0,
    unverified_events: (countResult?.total as number || 0) - (countResult?.verified as number || 0),
    events_by_type: eventsByType,
    date_range: {
      earliest: dateResult?.earliest as string | null,
      latest: dateResult?.latest as string | null
    },
    avg_confidence: countResult?.avg_confidence as number || 0
  };
}

/**
 * Update timeline event
 */
export async function updateTimelineEvent(
  db: D1Database,
  eventId: number,
  updates: Partial<TimelineEvent>
): Promise<void> {
  const fields: string[] = [];
  const params: any[] = [];
  
  if (updates.event_date !== undefined) {
    fields.push('event_date = ?');
    params.push(updates.event_date);
  }
  
  if (updates.event_type !== undefined) {
    fields.push('event_type = ?');
    params.push(updates.event_type);
  }
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    params.push(updates.title);
  }
  
  if (updates.description !== undefined) {
    fields.push('description = ?');
    params.push(updates.description);
  }
  
  if (updates.parties_involved !== undefined) {
    fields.push('parties_involved = ?');
    params.push(JSON.stringify(updates.parties_involved));
  }
  
  if (updates.location !== undefined) {
    fields.push('location = ?');
    params.push(updates.location);
  }
  
  if (updates.is_verified !== undefined) {
    fields.push('is_verified = ?');
    params.push(updates.is_verified ? 1 : 0);
    
    if (updates.is_verified) {
      fields.push('reviewed_by = ?', 'reviewed_at = ?');
      params.push(updates.reviewed_by || null, new Date().toISOString());
    }
  }
  
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    params.push(JSON.stringify(updates.tags));
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(eventId);
  
  await db.prepare(`
    UPDATE timeline_events
    SET ${fields.join(', ')}
    WHERE id = ?
  `).bind(...params).run();
}

/**
 * Delete timeline event
 */
export async function deleteTimelineEvent(
  db: D1Database,
  eventId: number
): Promise<void> {
  await db.prepare(`
    DELETE FROM timeline_events WHERE id = ?
  `).bind(eventId).run();
}

/**
 * Verify timeline event (attorney action)
 */
export async function verifyTimelineEvent(
  db: D1Database,
  eventId: number,
  reviewedBy: number
): Promise<void> {
  await db.prepare(`
    UPDATE timeline_events
    SET is_verified = 1, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(reviewedBy, new Date().toISOString(), new Date().toISOString(), eventId).run();
}
