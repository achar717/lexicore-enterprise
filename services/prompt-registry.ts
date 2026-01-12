/**
 * LexiCore™ Central Prompt Registry Service
 * 
 * Unified prompt management system for all practice areas
 * Supports filtering by practice_areas, module, task_type
 */

export interface Prompt {
  id: number
  prompt_id: string
  practice_areas: string[] // Parsed from JSON
  module?: string
  task_type: string
  title: string
  description?: string
  reviewer_role?: string
  confidence_threshold: number
  prompt_text: string
  system_instructions?: string
  output_schema?: string
  extract_fields?: string[]
  prohibited_actions?: string[]
  validation_rules?: string[]
  version: string
  status: string
  created_at: string
  updated_at: string
}

export interface PromptUsageLog {
  id: number
  prompt_id: string
  matter_id?: number
  document_id?: number
  practice_area?: string
  input_preview?: string
  output_preview?: string
  confidence_score?: number
  execution_time_ms?: number
  validation_passed: boolean
  validation_errors?: string[]
  user_id?: number
  ip_address?: string
  user_agent?: string
  executed_at: string
}

export class PromptRegistryService {
  constructor(private db: D1Database) {}

  /**
   * Get prompt by ID
   */
  async getPromptById(promptId: string): Promise<Prompt | null> {
    const result = await this.db
      .prepare('SELECT * FROM prompts WHERE prompt_id = ? AND status = ?')
      .bind(promptId, 'active')
      .first()

    if (!result) return null

    return this.parsePrompt(result)
  }

  /**
   * Get prompts by practice area
   * Supports multiple practice areas (returns prompts matching ANY area)
   */
  async getPromptsByPracticeArea(
    practiceAreas: string[],
    taskType?: string
  ): Promise<Prompt[]> {
    let query = 'SELECT * FROM prompts WHERE status = ? AND ('
    const conditions: string[] = []
    const params: any[] = ['active']

    // Build OR conditions for each practice area
    for (const area of practiceAreas) {
      conditions.push('practice_areas LIKE ?')
      params.push(`%"${area}"%`)
    }

    query += conditions.join(' OR ') + ')'

    // Add task_type filter if provided
    if (taskType) {
      query += ' AND task_type = ?'
      params.push(taskType)
    }

    query += ' ORDER BY created_at DESC'

    const stmt = this.db.prepare(query).bind(...params)
    const result = await stmt.all()

    return result.results.map((row) => this.parsePrompt(row))
  }

  /**
   * Get prompts by module
   */
  async getPromptsByModule(module: string, taskType?: string): Promise<Prompt[]> {
    let query = 'SELECT * FROM prompts WHERE module = ? AND status = ?'
    const params: any[] = [module, 'active']

    if (taskType) {
      query += ' AND task_type = ?'
      params.push(taskType)
    }

    query += ' ORDER BY created_at DESC'

    const stmt = this.db.prepare(query).bind(...params)
    const result = await stmt.all()

    return result.results.map((row) => this.parsePrompt(row))
  }

  /**
   * Search prompts with filters
   */
  async searchPrompts(filters: {
    practiceAreas?: string[]
    module?: string
    taskType?: string
    status?: string
  }): Promise<Prompt[]> {
    const conditions: string[] = []
    const params: any[] = []

    if (filters.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    } else {
      conditions.push('status = ?')
      params.push('active')
    }

    if (filters.practiceAreas && filters.practiceAreas.length > 0) {
      const areaConditions: string[] = []
      for (const area of filters.practiceAreas) {
        areaConditions.push('practice_areas LIKE ?')
        params.push(`%"${area}"%`)
      }
      conditions.push('(' + areaConditions.join(' OR ') + ')')
    }

    if (filters.module) {
      conditions.push('module = ?')
      params.push(filters.module)
    }

    if (filters.taskType) {
      conditions.push('task_type = ?')
      params.push(filters.taskType)
    }

    const query = `SELECT * FROM prompts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`
    const stmt = this.db.prepare(query).bind(...params)
    const result = await stmt.all()

    return result.results.map((row) => this.parsePrompt(row))
  }

  /**
   * Log prompt usage
   */
  async logPromptUsage(log: {
    prompt_id: string
    matter_id?: number
    document_id?: number
    practice_area?: string
    input_preview?: string
    output_preview?: string
    confidence_score?: number
    execution_time_ms?: number
    validation_passed: boolean
    validation_errors?: string[]
    user_id?: number
    ip_address?: string
    user_agent?: string
  }): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO prompt_usage_log (
          prompt_id, matter_id, document_id, practice_area,
          input_preview, output_preview, confidence_score, execution_time_ms,
          validation_passed, validation_errors, user_id, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        log.prompt_id,
        log.matter_id || null,
        log.document_id || null,
        log.practice_area || null,
        log.input_preview || null,
        log.output_preview || null,
        log.confidence_score || null,
        log.execution_time_ms || null,
        log.validation_passed ? 1 : 0,
        log.validation_errors ? JSON.stringify(log.validation_errors) : null,
        log.user_id || null,
        log.ip_address || null,
        log.user_agent || null
      )
      .run()

    return result.meta.last_row_id || 0
  }

  /**
   * Get prompt usage statistics
   */
  async getPromptUsageStats(
    promptId: string,
    dateRangeStart?: string,
    dateRangeEnd?: string
  ): Promise<{
    total_uses: number
    avg_confidence: number
    avg_execution_time_ms: number
    success_rate: number
  }> {
    let query = `
      SELECT 
        COUNT(*) as total_uses,
        AVG(confidence_score) as avg_confidence,
        AVG(execution_time_ms) as avg_execution_time_ms,
        SUM(CASE WHEN validation_passed = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM prompt_usage_log
      WHERE prompt_id = ?
    `
    const params: any[] = [promptId]

    if (dateRangeStart) {
      query += ' AND executed_at >= ?'
      params.push(dateRangeStart)
    }

    if (dateRangeEnd) {
      query += ' AND executed_at <= ?'
      params.push(dateRangeEnd)
    }

    const result = await this.db.prepare(query).bind(...params).first()

    return {
      total_uses: result?.total_uses || 0,
      avg_confidence: result?.avg_confidence || 0,
      avg_execution_time_ms: result?.avg_execution_time_ms || 0,
      success_rate: result?.success_rate || 0
    }
  }

  /**
   * Parse database row into Prompt object
   */
  private parsePrompt(row: any): Prompt {
    return {
      id: row.id,
      prompt_id: row.prompt_id,
      practice_areas: row.practice_areas ? JSON.parse(row.practice_areas) : [],
      module: row.module,
      task_type: row.task_type,
      title: row.title,
      description: row.description,
      reviewer_role: row.reviewer_role,
      confidence_threshold: row.confidence_threshold || 0.85,
      prompt_text: row.prompt_text,
      system_instructions: row.system_instructions,
      output_schema: row.output_schema,
      extract_fields: row.extract_fields ? JSON.parse(row.extract_fields) : undefined,
      prohibited_actions: row.prohibited_actions
        ? JSON.parse(row.prohibited_actions)
        : undefined,
      validation_rules: row.validation_rules ? JSON.parse(row.validation_rules) : undefined,
      version: row.version || '1.0',
      status: row.status || 'active',
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }

  /**
   * Create or update a prompt
   */
  async upsertPrompt(prompt: {
    prompt_id: string
    practice_areas: string[]
    module?: string
    task_type: string
    title: string
    description?: string
    reviewer_role?: string
    confidence_threshold?: number
    prompt_text: string
    system_instructions?: string
    output_schema?: string
    extract_fields?: string[]
    prohibited_actions?: string[]
    validation_rules?: string[]
    version?: string
    status?: string
    created_by_user_id?: number
  }): Promise<Prompt> {
    const existing = await this.getPromptById(prompt.prompt_id)

    if (existing) {
      // Update existing prompt
      await this.db
        .prepare(
          `UPDATE prompts SET
            practice_areas = ?,
            module = ?,
            task_type = ?,
            title = ?,
            description = ?,
            reviewer_role = ?,
            confidence_threshold = ?,
            prompt_text = ?,
            system_instructions = ?,
            output_schema = ?,
            extract_fields = ?,
            prohibited_actions = ?,
            validation_rules = ?,
            version = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE prompt_id = ?`
        )
        .bind(
          JSON.stringify(prompt.practice_areas),
          prompt.module || null,
          prompt.task_type,
          prompt.title,
          prompt.description || null,
          prompt.reviewer_role || null,
          prompt.confidence_threshold || 0.85,
          prompt.prompt_text,
          prompt.system_instructions || null,
          prompt.output_schema || null,
          prompt.extract_fields ? JSON.stringify(prompt.extract_fields) : null,
          prompt.prohibited_actions ? JSON.stringify(prompt.prohibited_actions) : null,
          prompt.validation_rules ? JSON.stringify(prompt.validation_rules) : null,
          prompt.version || existing.version,
          prompt.status || existing.status,
          prompt.prompt_id
        )
        .run()
    } else {
      // Insert new prompt
      await this.db
        .prepare(
          `INSERT INTO prompts (
            prompt_id, practice_areas, module, task_type, title, description,
            reviewer_role, confidence_threshold, prompt_text, system_instructions,
            output_schema, extract_fields, prohibited_actions, validation_rules,
            version, status, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          prompt.prompt_id,
          JSON.stringify(prompt.practice_areas),
          prompt.module || null,
          prompt.task_type,
          prompt.title,
          prompt.description || null,
          prompt.reviewer_role || null,
          prompt.confidence_threshold || 0.85,
          prompt.prompt_text,
          prompt.system_instructions || null,
          prompt.output_schema || null,
          prompt.extract_fields ? JSON.stringify(prompt.extract_fields) : null,
          prompt.prohibited_actions ? JSON.stringify(prompt.prohibited_actions) : null,
          prompt.validation_rules ? JSON.stringify(prompt.validation_rules) : null,
          prompt.version || '1.0',
          prompt.status || 'active',
          prompt.created_by_user_id || null
        )
        .run()
    }

    return (await this.getPromptById(prompt.prompt_id))!
  }

  /**
   * Deprecate a prompt (soft delete)
   */
  async deprecatePrompt(promptId: string): Promise<void> {
    await this.db
      .prepare('UPDATE prompts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE prompt_id = ?')
      .bind('deprecated', promptId)
      .run()
  }

  /**
   * List all prompts with pagination
   */
  async listPrompts(
    limit: number = 50,
    offset: number = 0,
    status: string = 'active'
  ): Promise<{ prompts: Prompt[]; total: number }> {
    const countResult = await this.db
      .prepare('SELECT COUNT(*) as total FROM prompts WHERE status = ?')
      .bind(status)
      .first()

    const result = await this.db
      .prepare('SELECT * FROM prompts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(status, limit, offset)
      .all()

    return {
      prompts: result.results.map((row) => this.parsePrompt(row)),
      total: countResult?.total || 0
    }
  }
}
