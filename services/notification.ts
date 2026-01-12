// LexiCore™ Notification Service
// © 2024 LexiCore. Email notification system for contract workflow events.

import type { D1Database } from '@cloudflare/workers-types'
import { EmailService } from './email'

export interface NotificationConfig {
  userId: string
  notificationType: 
    | 'contract_uploaded'
    | 'extraction_complete'
    | 'review_assigned'
    | 'review_completed'
    | 'contract_approved'
    | 'ambiguous_detected'
    | 'deadline_approaching'
  matterId?: string
  contractId?: string
  extractionId?: string
  subject: string
  message: string
  actionUrl?: string
  priority?: number
}

export interface NotificationPreferences {
  emailEnabled: boolean
  notifyContractUploaded: boolean
  notifyExtractionComplete: boolean
  notifyReviewAssigned: boolean
  notifyReviewCompleted: boolean
  notifyContractApproved: boolean
  notifyAmbiguousDetected: boolean
  immediateNotifications: boolean
}

export class NotificationService {
  private emailService?: EmailService

  constructor(
    private db: D1Database,
    resendApiKey?: string,
    config?: {
      fromAddress?: string
      fromName?: string
      siteUrl?: string
    }
  ) {
    if (resendApiKey) {
      this.emailService = new EmailService(resendApiKey, config)
    }
  }

  /**
   * Queue a notification for delivery
   */
  async queueNotification(config: NotificationConfig): Promise<string> {
    // Check user preferences
    const prefs = await this.getUserPreferences(config.userId)
    
    if (!prefs.emailEnabled) {
      console.log(`[Notification] Skipped for user ${config.userId} - email disabled`)
      return ''
    }

    // Check if this notification type is enabled
    if (!this.isNotificationTypeEnabled(prefs, config.notificationType)) {
      console.log(`[Notification] Skipped ${config.notificationType} for user ${config.userId}`)
      return ''
    }

    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    await this.db.prepare(`
      INSERT INTO notification_queue (
        id, user_id, notification_type, matter_id, contract_id, extraction_id,
        subject, message, action_url, priority, status, scheduled_for
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(
      notificationId,
      config.userId,
      config.notificationType,
      config.matterId || null,
      config.contractId || null,
      config.extractionId || null,
      config.subject,
      config.message,
      config.actionUrl || null,
      config.priority || 3
    ).run()

    console.log(`[Notification] Queued: ${notificationId} for ${config.userId}`)

    // Send email immediately if email service is available
    if (this.emailService && prefs.immediateNotifications) {
      await this.sendEmailNotification(config)
    }
    
    return notificationId
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await this.db.prepare(`
      SELECT 
        email_enabled as emailEnabled,
        notify_contract_uploaded as notifyContractUploaded,
        notify_extraction_complete as notifyExtractionComplete,
        notify_review_assigned as notifyReviewAssigned,
        notify_review_completed as notifyReviewCompleted,
        notify_contract_approved as notifyContractApproved,
        notify_ambiguous_detected as notifyAmbiguousDetected,
        immediate_notifications as immediateNotifications
      FROM notification_preferences
      WHERE user_id = ?
    `).bind(userId).first<NotificationPreferences>()

    // Default to all enabled if preferences don't exist
    if (!result) {
      return {
        emailEnabled: true,
        notifyContractUploaded: true,
        notifyExtractionComplete: true,
        notifyReviewAssigned: true,
        notifyReviewCompleted: true,
        notifyContractApproved: true,
        notifyAmbiguousDetected: true,
        immediateNotifications: true
      }
    }

    return result
  }

  /**
   * Check if notification type is enabled
   */
  private isNotificationTypeEnabled(prefs: NotificationPreferences, type: string): boolean {
    const mapping: Record<string, keyof NotificationPreferences> = {
      'contract_uploaded': 'notifyContractUploaded',
      'extraction_complete': 'notifyExtractionComplete',
      'review_assigned': 'notifyReviewAssigned',
      'review_completed': 'notifyReviewCompleted',
      'contract_approved': 'notifyContractApproved',
      'ambiguous_detected': 'notifyAmbiguousDetected'
    }

    const prefKey = mapping[type]
    return prefKey ? !!prefs[prefKey] : true
  }

  /**
   * Get user's notification queue
   */
  async getUserNotifications(userId: string, limit = 50): Promise<any[]> {
    const result = await this.db.prepare(`
      SELECT 
        id, notification_type, subject, message, action_url,
        status, priority, scheduled_for, sent_at, created_at
      FROM notification_queue
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(userId, limit).all()

    return result.results || []
  }

  /**
   * Mark notification as sent
   */
  async markAsSent(notificationId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE notification_queue
      SET status = 'sent', sent_at = datetime('now')
      WHERE id = ?
    `).bind(notificationId).run()
  }

  /**
   * Log notification delivery
   */
  async logNotification(
    userId: string,
    notificationType: string,
    subject: string,
    status: string,
    matterId?: string,
    contractId?: string
  ): Promise<void> {
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    await this.db.prepare(`
      INSERT INTO notification_log (
        id, user_id, notification_type, matter_id, contract_id,
        subject, status, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      logId,
      userId,
      notificationType,
      matterId || null,
      contractId || null,
      subject,
      status
    ).run()
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    const updates: string[] = []
    const values: any[] = []

    if (preferences.emailEnabled !== undefined) {
      updates.push('email_enabled = ?')
      values.push(preferences.emailEnabled ? 1 : 0)
    }
    if (preferences.notifyContractUploaded !== undefined) {
      updates.push('notify_contract_uploaded = ?')
      values.push(preferences.notifyContractUploaded ? 1 : 0)
    }
    if (preferences.notifyExtractionComplete !== undefined) {
      updates.push('notify_extraction_complete = ?')
      values.push(preferences.notifyExtractionComplete ? 1 : 0)
    }
    if (preferences.notifyReviewAssigned !== undefined) {
      updates.push('notify_review_assigned = ?')
      values.push(preferences.notifyReviewAssigned ? 1 : 0)
    }
    if (preferences.notifyReviewCompleted !== undefined) {
      updates.push('notify_review_completed = ?')
      values.push(preferences.notifyReviewCompleted ? 1 : 0)
    }
    if (preferences.notifyContractApproved !== undefined) {
      updates.push('notify_contract_approved = ?')
      values.push(preferences.notifyContractApproved ? 1 : 0)
    }
    if (preferences.notifyAmbiguousDetected !== undefined) {
      updates.push('notify_ambiguous_detected = ?')
      values.push(preferences.notifyAmbiguousDetected ? 1 : 0)
    }
    if (preferences.immediateNotifications !== undefined) {
      updates.push('immediate_notifications = ?')
      values.push(preferences.immediateNotifications ? 1 : 0)
    }

    if (updates.length === 0) return

    updates.push('updated_at = datetime(\'now\')')
    values.push(userId)

    await this.db.prepare(`
      UPDATE notification_preferences
      SET ${updates.join(', ')}
      WHERE user_id = ?
    `).bind(...values).run()
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId: string): Promise<any> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM notification_queue
      WHERE user_id = ?
    `).bind(userId).first()

    return stats || { total: 0, pending: 0, sent: 0, failed: 0 }
  }

  /**
   * Send email notification based on type
   */
  private async sendEmailNotification(config: NotificationConfig): Promise<void> {
    if (!this.emailService) {
      console.log('[Notification] Email service not configured')
      return
    }

    try {
      // Get user email
      const user = await this.db.prepare(`
        SELECT email, first_name, last_name FROM users WHERE id = ?
      `).bind(config.userId).first<{ email: string; first_name: string; last_name: string }>()

      if (!user || !user.email) {
        console.warn(`[Notification] User ${config.userId} has no email`)
        return
      }

      // Send appropriate email based on notification type
      switch (config.notificationType) {
        case 'contract_uploaded':
          if (config.contractId) {
            await this.emailService.sendContractUploadedEmail(user.email, {
              userName: `${user.first_name} ${user.last_name}`,
              contractName: config.subject.replace('Contract uploaded: ', ''),
              matterTitle: config.message.match(/to matter (.+)/)?.[1] || 'Unknown Matter',
              uploadedBy: user.email,
              contractId: config.contractId,
              siteUrl: 'https://www.apexailexicolegal.com'
            })
          }
          break

        case 'extraction_complete':
          if (config.extractionId) {
            const itemsMatch = config.message.match(/extracted (\d+) key terms/)
            await this.emailService.sendExtractionCompleteEmail(user.email, {
              userName: `${user.first_name} ${user.last_name}`,
              contractName: config.subject.replace('AI extraction complete for ', ''),
              extractionId: config.extractionId,
              itemsExtracted: itemsMatch ? parseInt(itemsMatch[1]) : 0,
              siteUrl: 'https://www.apexailexicolegal.com'
            })
          }
          break

        case 'ambiguous_detected':
          if (config.extractionId) {
            const countMatch = config.message.match(/detected (\d+) items/)
            await this.emailService.sendAmbiguousItemsEmail(user.email, {
              userName: `${user.first_name} ${user.last_name}`,
              contractName: config.subject.replace('Ambiguous items detected in ', ''),
              extractionId: config.extractionId,
              ambiguousCount: countMatch ? parseInt(countMatch[1]) : 0,
              siteUrl: 'https://www.apexailexicolegal.com'
            })
          }
          break

        default:
          console.log(`[Notification] No email handler for type: ${config.notificationType}`)
      }

      console.log(`[Notification] Email sent to ${user.email} for ${config.notificationType}`)
    } catch (error) {
      console.error('[Notification] Failed to send email:', error)
      // Don't throw - email failure shouldn't break the workflow
    }
  }
}
