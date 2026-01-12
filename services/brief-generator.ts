/**
 * LexiCore™ Litigation - Automated Brief & Motion Generator
 * Phase 8: AI-Powered Legal Document Drafting
 * 
 * Legal Compliance: AI Drafts are STARTING POINTS ONLY
 * - Attorney MUST review and revise all generated content
 * - AI does NOT provide legal advice or strategy
 * - Generated briefs require attorney approval before filing
 * - Citations must be independently verified
 * - AI assistance does NOT replace attorney judgment
 * - Final work product is attorney's responsibility
 */

import type { D1Database } from '@cloudflare/workers-types';

// Brief Types
export enum BriefType {
  MOTION_TO_DISMISS = 'motion_to_dismiss',
  MOTION_SUMMARY_JUDGMENT = 'motion_summary_judgment',
  OPPOSITION = 'opposition',
  REPLY = 'reply',
  MEMORANDUM = 'memorandum',
  BRIEF_IN_SUPPORT = 'brief_in_support',
  DISCOVERY_MOTION = 'discovery_motion',
  EVIDENTIARY_MOTION = 'evidentiary_motion'
}

// Brief Status
export enum BriefStatus {
  DRAFT = 'draft',
  ATTORNEY_REVIEW = 'attorney_review',
  APPROVED = 'approved',
  FILED = 'filed',
  ARCHIVED = 'archived'
}

// Citation Style
export enum CitationStyle {
  BLUEBOOK = 'bluebook',
  ALWD = 'alwd',
  STATE_RULES = 'state_rules'
}

// Brief Section
export interface BriefSection {
  id: string;
  title: string;
  content: string;
  order: number;
  include: boolean;
}

// Brief Template
export interface BriefTemplate {
  id: string;
  type: BriefType;
  name: string;
  description: string;
  sections: BriefSection[];
  default_formatting: {
    font: string;
    font_size: number;
    line_spacing: number;
    margin_top: number;
    margin_bottom: number;
    margin_left: number;
    margin_right: number;
  };
}

// Generated Brief
export interface GeneratedBrief {
  id?: number;
  matter_id: number;
  brief_type: BriefType;
  title: string;
  content: string; // HTML content
  sections: BriefSection[];
  citations: string[]; // Array of citations used
  facts_used: number[]; // IDs of extractions/citations used
  status: BriefStatus;
  citation_style: CitationStyle;
  word_count: number;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  reviewed_by?: number;
  reviewed_at?: string;
  approved_by?: number;
  approved_at?: string;
  version?: number;
}

// Brief Generation Options
export interface BriefGenerationOptions {
  matter_id: number;
  brief_type: BriefType;
  title: string;
  parties: {
    plaintiff?: string;
    defendant?: string;
    movant?: string;
    respondent?: string;
  };
  court_info: {
    court_name?: string;
    case_number?: string;
    judge_name?: string;
  };
  arguments: string[]; // Main arguments to make
  facts_to_include?: number[]; // IDs of extractions/citations
  citation_style?: CitationStyle;
  tone?: 'formal' | 'aggressive' | 'persuasive' | 'neutral';
  length_preference?: 'concise' | 'moderate' | 'detailed';
}

/**
 * Get brief templates
 */
export function getBriefTemplates(): BriefTemplate[] {
  return [
    {
      id: 'motion_to_dismiss',
      type: BriefType.MOTION_TO_DISMISS,
      name: 'Motion to Dismiss',
      description: 'Motion to dismiss for failure to state a claim (Rule 12(b)(6))',
      sections: [
        {
          id: 'caption',
          title: 'Caption',
          content: '[Court and case information]',
          order: 1,
          include: true
        },
        {
          id: 'introduction',
          title: 'Introduction',
          content: '',
          order: 2,
          include: true
        },
        {
          id: 'background',
          title: 'Background',
          content: '',
          order: 3,
          include: true
        },
        {
          id: 'legal_standard',
          title: 'Legal Standard',
          content: '',
          order: 4,
          include: true
        },
        {
          id: 'argument',
          title: 'Argument',
          content: '',
          order: 5,
          include: true
        },
        {
          id: 'conclusion',
          title: 'Conclusion',
          content: '',
          order: 6,
          include: true
        }
      ],
      default_formatting: {
        font: 'Times New Roman',
        font_size: 12,
        line_spacing: 2.0,
        margin_top: 1.0,
        margin_bottom: 1.0,
        margin_left: 1.0,
        margin_right: 1.0
      }
    },
    {
      id: 'motion_summary_judgment',
      type: BriefType.MOTION_SUMMARY_JUDGMENT,
      name: 'Motion for Summary Judgment',
      description: 'Motion for summary judgment (Rule 56)',
      sections: [
        {
          id: 'caption',
          title: 'Caption',
          content: '[Court and case information]',
          order: 1,
          include: true
        },
        {
          id: 'introduction',
          title: 'Introduction',
          content: '',
          order: 2,
          include: true
        },
        {
          id: 'statement_of_facts',
          title: 'Statement of Undisputed Material Facts',
          content: '',
          order: 3,
          include: true
        },
        {
          id: 'legal_standard',
          title: 'Legal Standard',
          content: '',
          order: 4,
          include: true
        },
        {
          id: 'argument',
          title: 'Argument',
          content: '',
          order: 5,
          include: true
        },
        {
          id: 'conclusion',
          title: 'Conclusion',
          content: '',
          order: 6,
          include: true
        }
      ],
      default_formatting: {
        font: 'Times New Roman',
        font_size: 12,
        line_spacing: 2.0,
        margin_top: 1.0,
        margin_bottom: 1.0,
        margin_left: 1.0,
        margin_right: 1.0
      }
    },
    {
      id: 'opposition',
      type: BriefType.OPPOSITION,
      name: 'Opposition Brief',
      description: 'Opposition to motion',
      sections: [
        {
          id: 'caption',
          title: 'Caption',
          content: '[Court and case information]',
          order: 1,
          include: true
        },
        {
          id: 'introduction',
          title: 'Introduction',
          content: '',
          order: 2,
          include: true
        },
        {
          id: 'response_to_facts',
          title: 'Response to Statement of Facts',
          content: '',
          order: 3,
          include: true
        },
        {
          id: 'legal_standard',
          title: 'Legal Standard',
          content: '',
          order: 4,
          include: true
        },
        {
          id: 'argument',
          title: 'Argument',
          content: '',
          order: 5,
          include: true
        },
        {
          id: 'conclusion',
          title: 'Conclusion',
          content: '',
          order: 6,
          include: true
        }
      ],
      default_formatting: {
        font: 'Times New Roman',
        font_size: 12,
        line_spacing: 2.0,
        margin_top: 1.0,
        margin_bottom: 1.0,
        margin_left: 1.0,
        margin_right: 1.0
      }
    }
  ];
}

/**
 * Format citation based on style
 */
export function formatCitation(
  citation: {
    type: 'case' | 'statute' | 'regulation' | 'document';
    name: string;
    volume?: string;
    reporter?: string;
    page?: string;
    year?: string;
    court?: string;
    document_name?: string;
    page_number?: number;
  },
  style: CitationStyle
): string {
  if (citation.type === 'case') {
    if (style === CitationStyle.BLUEBOOK || style === CitationStyle.ALWD) {
      // Case citation: Name v. Name, Vol. Reporter Page (Court Year)
      let formatted = `${citation.name}`;
      if (citation.volume && citation.reporter && citation.page) {
        formatted += `, ${citation.volume} ${citation.reporter} ${citation.page}`;
      }
      if (citation.court && citation.year) {
        formatted += ` (${citation.court} ${citation.year})`;
      } else if (citation.year) {
        formatted += ` (${citation.year})`;
      }
      return formatted;
    }
  } else if (citation.type === 'statute') {
    // Statute citation format
    return `${citation.name}`;
  } else if (citation.type === 'document') {
    // Document citation
    let formatted = citation.document_name || 'Document';
    if (citation.page_number) {
      formatted += ` at ${citation.page_number}`;
    }
    return formatted;
  }
  
  return citation.name;
}

/**
 * Generate brief caption
 */
function generateCaption(options: BriefGenerationOptions): string {
  const { court_info, parties, title } = options;
  
  return `
    <div class="caption" style="text-align: center; margin-bottom: 2em;">
      <div style="font-weight: bold; margin-bottom: 1em;">
        ${court_info.court_name || 'UNITED STATES DISTRICT COURT'}
      </div>
      ${court_info.case_number ? `<div>Case No. ${court_info.case_number}</div>` : ''}
      <div style="margin: 2em 0;">
        <div>${parties.plaintiff || '[PLAINTIFF]'},</div>
        <div style="margin-left: 4em;">Plaintiff,</div>
        <div style="margin: 1em 0;">v.</div>
        <div>${parties.defendant || '[DEFENDANT]'},</div>
        <div style="margin-left: 4em;">Defendant.</div>
      </div>
      <div style="font-weight: bold; margin-top: 2em; text-decoration: underline;">
        ${title.toUpperCase()}
      </div>
    </div>
  `;
}

/**
 * Generate introduction section
 */
function generateIntroduction(options: BriefGenerationOptions): string {
  const { brief_type, parties } = options;
  
  let intro = '<p>';
  
  if (brief_type === BriefType.MOTION_TO_DISMISS) {
    intro += `${parties.defendant || 'Defendant'} respectfully moves this Court to dismiss the Complaint `;
    intro += `filed by ${parties.plaintiff || 'Plaintiff'} for failure to state a claim upon which relief can be granted. `;
    intro += `As demonstrated below, the Complaint fails to plead sufficient facts to support a plausible claim for relief.`;
  } else if (brief_type === BriefType.MOTION_SUMMARY_JUDGMENT) {
    intro += `${parties.movant || 'Movant'} respectfully moves this Court for summary judgment pursuant to Federal Rule of Civil Procedure 56. `;
    intro += `There are no genuine disputes of material fact, and ${parties.movant || 'Movant'} is entitled to judgment as a matter of law.`;
  } else if (brief_type === BriefType.OPPOSITION) {
    intro += `${parties.respondent || 'Respondent'} respectfully opposes the motion filed by ${parties.movant || 'Movant'}. `;
    intro += `As demonstrated below, the motion should be denied.`;
  }
  
  intro += '</p>';
  return intro;
}

/**
 * Generate legal standard section
 */
function generateLegalStandard(briefType: BriefType): string {
  let standard = '<p>';
  
  if (briefType === BriefType.MOTION_TO_DISMISS) {
    standard += 'To survive a motion to dismiss under Federal Rule of Civil Procedure 12(b)(6), ';
    standard += 'a complaint must contain sufficient factual matter, accepted as true, to "state a claim to relief ';
    standard += 'that is plausible on its face." <em>Ashcroft v. Iqbal</em>, 556 U.S. 662, 678 (2009). ';
    standard += 'A claim is facially plausible when the plaintiff pleads factual content that allows the court ';
    standard += 'to draw the reasonable inference that the defendant is liable for the misconduct alleged. <em>Id.</em>';
  } else if (briefType === BriefType.MOTION_SUMMARY_JUDGMENT) {
    standard += 'Summary judgment is appropriate when "there is no genuine dispute as to any material fact ';
    standard += 'and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a). ';
    standard += 'A fact is material if it "might affect the outcome of the suit under the governing law." ';
    standard += '<em>Anderson v. Liberty Lobby, Inc.</em>, 477 U.S. 242, 248 (1986).';
  }
  
  standard += '</p>';
  return standard;
}

/**
 * Generate argument section with AI assistance
 */
async function generateArgument(
  options: BriefGenerationOptions,
  facts: string[]
): Promise<string> {
  const { arguments: mainArgs, tone } = options;
  
  let argument = '<div class="argument">';
  
  // For each main argument
  for (let i = 0; i < mainArgs.length; i++) {
    const arg = mainArgs[i];
    
    argument += `<h3>${String.fromCharCode(65 + i)}. ${arg}</h3>`;
    argument += '<p>';
    
    // Generate argument content based on tone
    if (tone === 'aggressive') {
      argument += 'The evidence overwhelmingly demonstrates that ';
    } else if (tone === 'persuasive') {
      argument += 'As this Court will find, ';
    } else {
      argument += 'The facts establish that ';
    }
    
    argument += arg.toLowerCase() + '. ';
    
    // Include relevant facts
    if (facts.length > 0) {
      argument += 'The record shows that ' + facts[0] + ' ';
    }
    
    argument += '</p>';
  }
  
  argument += '</div>';
  return argument;
}

/**
 * Generate conclusion
 */
function generateConclusion(options: BriefGenerationOptions): string {
  const { brief_type, parties } = options;
  
  let conclusion = '<p>For the foregoing reasons, ';
  
  if (brief_type === BriefType.MOTION_TO_DISMISS || brief_type === BriefType.MOTION_SUMMARY_JUDGMENT) {
    conclusion += `${parties.movant || parties.defendant || 'Movant'} respectfully requests that this Court grant this motion `;
    if (brief_type === BriefType.MOTION_TO_DISMISS) {
      conclusion += 'and dismiss the Complaint with prejudice.';
    } else {
      conclusion += 'and enter judgment in favor of ' + (parties.movant || 'Movant') + '.';
    }
  } else if (brief_type === BriefType.OPPOSITION) {
    conclusion += `${parties.respondent || 'Respondent'} respectfully requests that this Court deny the motion.`;
  }
  
  conclusion += '</p>';
  conclusion += `
    <div style="margin-top: 3em;">
      <p>Dated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p style="margin-top: 2em;">Respectfully submitted,</p>
      <p style="margin-top: 2em;">_________________________</p>
      <p>[Attorney Name]<br>[Bar Number]<br>[Firm Name]<br>[Address]<br>[Phone]<br>[Email]</p>
      <p style="margin-top: 1em;"><em>Attorney for ${parties.defendant || parties.movant || 'Defendant'}</em></p>
    </div>
  `;
  
  return conclusion;
}

/**
 * Generate complete brief
 */
export async function generateBrief(
  db: D1Database,
  options: BriefGenerationOptions
): Promise<GeneratedBrief> {
  // Get template
  const templates = getBriefTemplates();
  const template = templates.find(t => t.type === options.brief_type);
  
  if (!template) {
    throw new Error('Template not found');
  }
  
  // Fetch facts if specified
  let facts: string[] = [];
  if (options.facts_to_include && options.facts_to_include.length > 0) {
    const factResults = await db.prepare(`
      SELECT fact_extracted FROM litigation_citations
      WHERE id IN (${options.facts_to_include.map(() => '?').join(',')})
    `).bind(...options.facts_to_include).all();
    
    facts = (factResults.results || []).map(r => r.fact_extracted as string);
  }
  
  // Generate sections
  const sections: BriefSection[] = [];
  let fullContent = '';
  
  // Caption
  const caption = generateCaption(options);
  sections.push({
    id: 'caption',
    title: 'Caption',
    content: caption,
    order: 1,
    include: true
  });
  fullContent += caption;
  
  // Introduction
  const intro = generateIntroduction(options);
  sections.push({
    id: 'introduction',
    title: 'Introduction',
    content: intro,
    order: 2,
    include: true
  });
  fullContent += `<h2>INTRODUCTION</h2>${intro}`;
  
  // Legal Standard
  const legalStandard = generateLegalStandard(options.brief_type);
  sections.push({
    id: 'legal_standard',
    title: 'Legal Standard',
    content: legalStandard,
    order: 3,
    include: true
  });
  fullContent += `<h2>LEGAL STANDARD</h2>${legalStandard}`;
  
  // Argument
  const argument = await generateArgument(options, facts);
  sections.push({
    id: 'argument',
    title: 'Argument',
    content: argument,
    order: 4,
    include: true
  });
  fullContent += `<h2>ARGUMENT</h2>${argument}`;
  
  // Conclusion
  const conclusion = generateConclusion(options);
  sections.push({
    id: 'conclusion',
    title: 'Conclusion',
    content: conclusion,
    order: 5,
    include: true
  });
  fullContent += `<h2>CONCLUSION</h2>${conclusion}`;
  
  // Wrap in proper HTML
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: '${template.default_formatting.font}', serif; font-size: ${template.default_formatting.font_size}pt; line-height: ${template.default_formatting.line_spacing}; margin: ${template.default_formatting.margin_top}in ${template.default_formatting.margin_right}in ${template.default_formatting.margin_bottom}in ${template.default_formatting.margin_left}in; }
        h2 { text-align: center; font-weight: bold; margin: 1.5em 0 1em 0; }
        h3 { font-weight: bold; margin: 1em 0 0.5em 0; }
        p { text-align: justify; margin: 1em 0; }
        .caption { page-break-after: always; }
      </style>
    </head>
    <body>
      ${fullContent}
    </body>
    </html>
  `;
  
  // Calculate word count
  const textContent = fullContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent.split(/\s+/).length;
  
  return {
    matter_id: options.matter_id,
    brief_type: options.brief_type,
    title: options.title,
    content: htmlContent,
    sections,
    citations: [], // Would be populated with actual citations
    facts_used: options.facts_to_include || [],
    status: BriefStatus.DRAFT,
    citation_style: options.citation_style || CitationStyle.BLUEBOOK,
    word_count: wordCount,
    version: 1
  };
}

/**
 * Save generated brief
 */
export async function saveBrief(
  db: D1Database,
  brief: GeneratedBrief,
  userId: number
): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO generated_briefs (
      matter_id, brief_type, title, content, sections, citations,
      facts_used, status, citation_style, word_count, created_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    brief.matter_id,
    brief.brief_type,
    brief.title,
    brief.content,
    JSON.stringify(brief.sections),
    JSON.stringify(brief.citations),
    JSON.stringify(brief.facts_used),
    brief.status,
    brief.citation_style,
    brief.word_count,
    userId,
    brief.version
  ).run();
  
  return result.meta.last_row_id as number;
}

/**
 * Get briefs for a matter
 */
export async function getBriefs(
  db: D1Database,
  matterId: number
): Promise<GeneratedBrief[]> {
  const result = await db.prepare(`
    SELECT * FROM generated_briefs
    WHERE matter_id = ?
    ORDER BY created_at DESC
  `).bind(matterId).all();
  
  return (result.results || []).map(row => ({
    id: row.id as number,
    matter_id: row.matter_id as number,
    brief_type: row.brief_type as BriefType,
    title: row.title as string,
    content: row.content as string,
    sections: JSON.parse(row.sections as string),
    citations: JSON.parse(row.citations as string),
    facts_used: JSON.parse(row.facts_used as string),
    status: row.status as BriefStatus,
    citation_style: row.citation_style as CitationStyle,
    word_count: row.word_count as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: row.created_by as number,
    version: row.version as number
  }));
}

/**
 * Update brief status
 */
export async function updateBriefStatus(
  db: D1Database,
  briefId: number,
  status: BriefStatus,
  userId: number
): Promise<void> {
  const updates: string[] = ['status = ?', 'updated_at = ?'];
  const params: any[] = [status, new Date().toISOString()];
  
  if (status === BriefStatus.APPROVED) {
    updates.push('approved_by = ?', 'approved_at = ?');
    params.push(userId, new Date().toISOString());
  } else if (status === BriefStatus.ATTORNEY_REVIEW) {
    updates.push('reviewed_by = ?', 'reviewed_at = ?');
    params.push(userId, new Date().toISOString());
  }
  
  params.push(briefId);
  
  await db.prepare(`
    UPDATE generated_briefs
    SET ${updates.join(', ')}
    WHERE id = ?
  `).bind(...params).run();
}
