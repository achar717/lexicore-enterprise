/**
 * LexiCore™ Prompt Governance Service
 * 
 * Bank-grade governance for AI prompts across all practice modes
 * - Version control and approval workflows
 * - Prompt hierarchy (global → practice → task)
 * - Usage tracking and audit trail
 * - Practice-specific prompt enforcement
 * 
 * © 2024 LexiCore™. All rights reserved.
 */

import type { Bindings } from '../types'
import type { PracticeType } from '../middleware/practice-mode'

export interface Prompt {
  id: string
  prompt_name: string
  prompt_purpose: string
  prompt_text: string
  prompt_version: string
  prompt_type?: string
  practice_type_new?: string
  task_category?: string
  status: string
  is_active: boolean
  approved_by?: string
  approved_at?: string
  locked_at?: string
  parent_prompt_id?: string
  description?: string
  use_cases?: string
  constraints?: string
  created_at: string
  updated_at: string
}

export interface PromptUsageLog {
  prompt_id: string
  matter_id: number
  document_id?: number
  extraction_id?: number
  practice_type: PracticeType
  task_category?: string
  user_id: number
  input_data?: string
  output_data?: string
  tokens_used?: number
  execution_time_ms?: number
  status: 'success' | 'error' | 'timeout'
  error_message?: string
}

/**
 * Get the complete prompt chain for a task
 * Returns: [Global Master Prompt, Practice Mode Prompt, Task-Specific Prompt]
 */
export async function getPromptChain(
  env: Bindings,
  practiceType: PracticeType,
  taskCategory?: string
): Promise<Prompt[]> {
  const prompts: Prompt[] = []

  try {
    // 1. Get Global Master Prompt (applies to ALL)
    const globalPrompt = await env.DB.prepare(`
      SELECT * FROM prompt_registry
      WHERE prompt_type = 'global_master'
        AND practice_type_new = 'all'
        AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).first()

    if (globalPrompt) {
      prompts.push(globalPrompt as Prompt)
    }

    // 2. Get Practice Mode Prompt
    const practiceModePrompt = await env.DB.prepare(`
      SELECT * FROM prompt_registry
      WHERE prompt_type = 'practice_mode'
        AND practice_type_new = ?
        AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(practiceType).first()

    if (practiceModePrompt) {
      prompts.push(practiceModePrompt as Prompt)
    }

    // 3. Get Task-Specific Prompt (if task category provided)
    if (taskCategory) {
      const taskPrompt = await env.DB.prepare(`
        SELECT * FROM prompt_registry
        WHERE prompt_type = 'task_specific'
          AND practice_type_new = ?
          AND task_category = ?
          AND is_active = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `).bind(practiceType, taskCategory).first()

      if (taskPrompt) {
        prompts.push(taskPrompt as Prompt)
      }
    }

    return prompts
  } catch (error) {
    console.error('Failed to build prompt chain:', error)
    throw new Error(`Prompt chain construction failed: ${error}`)
  }
}

/**
 * Combine prompt chain into single executable prompt
 * Maintains hierarchy: Global → Practice → Task
 */
export function combinePromptChain(prompts: Prompt[]): string {
  if (prompts.length === 0) {
    throw new Error('Cannot combine empty prompt chain')
  }

  const sections = prompts.map((prompt, index) => {
    const level = ['GLOBAL FOUNDATION', 'PRACTICE MODE RULES', 'TASK INSTRUCTIONS'][index] || 'ADDITIONAL INSTRUCTIONS'
    return `
═══════════════════════════════════════════════════════════════
${level}: ${prompt.prompt_name}
Purpose: ${prompt.prompt_purpose}
═══════════════════════════════════════════════════════════════

${prompt.prompt_text}

`.trim()
  })

  return sections.join('\n\n---\n\n')
}

/**
 * Get approved prompts for a specific practice type
 */
export async function getApprovedPromptsForPractice(
  env: Bindings,
  practiceType: PracticeType
): Promise<Prompt[]> {
  try {
    const result = await env.DB.prepare(`
      SELECT * FROM prompt_registry
      WHERE (practice_type_new = ? OR practice_type_new = 'all')
        AND is_active = 1
        AND status = 'approved'
      ORDER BY prompt_type, task_category, updated_at DESC
    `).bind(practiceType).all()

    return result.results as Prompt[]
  } catch (error) {
    console.error('Failed to get approved prompts:', error)
    return []
  }
}

/**
 * Log prompt usage for audit trail
 */
export async function logPromptUsage(
  env: Bindings,
  log: PromptUsageLog
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO prompt_usage_log (
        prompt_id,
        matter_id,
        document_id,
        extraction_id,
        practice_type,
        task_category,
        user_id,
        input_data,
        output_data,
        tokens_used,
        execution_time_ms,
        status,
        error_message,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      log.prompt_id,
      log.matter_id,
      log.document_id || null,
      log.extraction_id || null,
      log.practice_type,
      log.task_category || null,
      log.user_id,
      log.input_data || null,
      log.output_data || null,
      log.tokens_used || null,
      log.execution_time_ms || null,
      log.status,
      log.error_message || null
    ).run()

    // Increment usage count on prompt
    await env.DB.prepare(`
      UPDATE prompt_registry
      SET usage_count = usage_count + 1,
          last_used_at = datetime('now')
      WHERE id = ?
    `).bind(log.prompt_id).run()
  } catch (error) {
    console.error('Failed to log prompt usage:', error)
    // Don't throw - logging failure shouldn't break the request
  }
}

/**
 * Validate prompt is allowed for practice type
 */
export async function validatePromptForPractice(
  env: Bindings,
  promptId: string,
  practiceType: PracticeType
): Promise<{ valid: boolean; reason?: string; prompt?: Prompt }> {
  try {
    const prompt = await env.DB.prepare(`
      SELECT * FROM prompt_registry WHERE id = ?
    `).bind(promptId).first() as Prompt | null

    if (!prompt) {
      return { valid: false, reason: 'Prompt not found' }
    }

    if (!prompt.is_active) {
      return { valid: false, reason: 'Prompt is not active', prompt }
    }

    if (prompt.status !== 'approved') {
      return { valid: false, reason: `Prompt status is '${prompt.status}', not 'approved'`, prompt }
    }

    const promptPractice = prompt.practice_type_new
    if (promptPractice !== 'all' && promptPractice !== practiceType) {
      return {
        valid: false,
        reason: `Prompt is for '${promptPractice}' practice, matter is '${practiceType}'`,
        prompt
      }
    }

    return { valid: true, prompt }
  } catch (error) {
    console.error('Prompt validation error:', error)
    return { valid: false, reason: 'Validation failed due to error' }
  }
}

/**
 * Get prompt usage statistics
 */
export async function getPromptUsageStats(
  env: Bindings,
  promptId?: string,
  practiceType?: PracticeType,
  startDate?: string,
  endDate?: string
): Promise<any> {
  try {
    let query = `
      SELECT 
        prompt_id,
        practice_type,
        COUNT(*) as usage_count,
        AVG(execution_time_ms) as avg_execution_time,
        SUM(tokens_used) as total_tokens,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN status = 'timeout' THEN 1 END) as timeout_count
      FROM prompt_usage_log
      WHERE 1=1
    `
    const bindings: any[] = []

    if (promptId) {
      query += ` AND prompt_id = ?`
      bindings.push(promptId)
    }

    if (practiceType) {
      query += ` AND practice_type = ?`
      bindings.push(practiceType)
    }

    if (startDate) {
      query += ` AND timestamp >= ?`
      bindings.push(startDate)
    }

    if (endDate) {
      query += ` AND timestamp <= ?`
      bindings.push(endDate)
    }

    query += ` GROUP BY prompt_id, practice_type`

    const result = await env.DB.prepare(query).bind(...bindings).all()
    return result.results
  } catch (error) {
    console.error('Failed to get prompt usage stats:', error)
    return []
  }
}

/**
 * Create or update a prompt (admin only)
 * This would typically be called from an admin API endpoint
 */
export async function upsertPrompt(
  env: Bindings,
  prompt: Partial<Prompt> & { id: string },
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if prompt exists
    const existing = await env.DB.prepare(`
      SELECT id FROM prompt_registry WHERE id = ?
    `).bind(prompt.id).first()

    if (existing) {
      // Update
      await env.DB.prepare(`
        UPDATE prompt_registry
        SET prompt_name = ?,
            prompt_purpose = ?,
            prompt_text = ?,
            prompt_type = ?,
            practice_type_new = ?,
            task_category = ?,
            description = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        prompt.prompt_name,
        prompt.prompt_purpose,
        prompt.prompt_text,
        prompt.prompt_type,
        prompt.practice_type_new,
        prompt.task_category || null,
        prompt.description || null,
        prompt.id
      ).run()
    } else {
      // Insert
      await env.DB.prepare(`
        INSERT INTO prompt_registry (
          id,
          prompt_name,
          prompt_purpose,
          prompt_text,
          prompt_version,
          prompt_type,
          practice_type_new,
          task_category,
          status,
          is_active,
          owner_id,
          description,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        prompt.id,
        prompt.prompt_name,
        prompt.prompt_purpose,
        prompt.prompt_text,
        prompt.prompt_version || 'v1',
        prompt.prompt_type || 'task_specific',
        prompt.practice_type_new || 'all',
        prompt.task_category || null,
        prompt.status || 'draft',
        prompt.is_active ? 1 : 0,
        userId,
        prompt.description || null
      ).run()
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to upsert prompt:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
