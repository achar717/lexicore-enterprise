/**
 * Kafka Service for LexiCore
 * 
 * Provides Kafka integration for async message processing
 * Uses Kafka REST Proxy (HTTP) for Cloudflare Workers compatibility
 * 
 * IMPORTANT: This is an OPTIONAL feature controlled by KAFKA_ENABLED flag
 * System works perfectly fine without Kafka using fallback queue
 */

import type { CloudflareBindings } from '../types'

export interface KafkaMessage {
  topic: string
  key?: string
  value: any
  headers?: Record<string, string>
}

export interface KafkaProducerResponse {
  topic: string
  partition: number
  offset: number
  timestamp: number
}

/**
 * Kafka Service using REST Proxy
 * Compatible with Cloudflare Workers (HTTP-only)
 */
export class KafkaService {
  private restProxyUrl: string
  private enabled: boolean
  private topics: {
    ocrJobs: string
    ocrResults: string
    documentEvents: string
    auditLogs: string
  }

  constructor(env: CloudflareBindings) {
    this.enabled = env.KAFKA_ENABLED === 'true'
    this.restProxyUrl = env.KAFKA_REST_PROXY_URL || ''
    this.topics = {
      ocrJobs: env.KAFKA_OCR_JOBS_TOPIC || 'lexicore.ocr.jobs',
      ocrResults: env.KAFKA_OCR_RESULTS_TOPIC || 'lexicore.ocr.results',
      documentEvents: env.KAFKA_DOCUMENT_EVENTS_TOPIC || 'lexicore.documents.events',
      auditLogs: env.KAFKA_AUDIT_LOGS_TOPIC || 'lexicore.audit.logs'
    }
  }

  /**
   * Check if Kafka is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled && !!this.restProxyUrl
  }

  /**
   * Publish message to Kafka topic via REST Proxy
   * @param message Kafka message to publish
   * @returns Promise<KafkaProducerResponse>
   */
  private async publish(message: KafkaMessage): Promise<KafkaProducerResponse> {
    if (!this.isEnabled()) {
      throw new Error('Kafka is not enabled or configured')
    }

    try {
      // Confluent REST Proxy v3 API format
      const response = await fetch(`${this.restProxyUrl}/topics/${message.topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.kafka.json.v2+json',
          'Accept': 'application/vnd.kafka.v2+json'
        },
        body: JSON.stringify({
          records: [
            {
              key: message.key || null,
              value: message.value,
              headers: message.headers || {}
            }
          ]
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Kafka publish failed: ${response.status} - ${error}`)
      }

      const result = await response.json()
      
      // Extract first offset (single message)
      const offset = result.offsets?.[0] || {}
      
      return {
        topic: message.topic,
        partition: offset.partition || 0,
        offset: offset.offset || 0,
        timestamp: Date.now()
      }
    } catch (error: any) {
      console.error('❌ Kafka publish error:', error)
      throw new Error(`Kafka publish failed: ${error.message}`)
    }
  }

  /**
   * Publish OCR job to Kafka queue
   * @param jobData OCR job data
   */
  async publishOcrJob(jobData: {
    job_id: string
    document_id: string
    matter_id: string
    file_url: string
    file_type: string
    language?: string
    enable_preprocessing?: boolean
    pdf_strategy?: string
  }): Promise<KafkaProducerResponse> {
    console.log('📤 Publishing OCR job to Kafka:', {
      job_id: jobData.job_id,
      topic: this.topics.ocrJobs
    })

    return await this.publish({
      topic: this.topics.ocrJobs,
      key: jobData.job_id,
      value: {
        ...jobData,
        timestamp: Date.now(),
        version: '1.0'
      },
      headers: {
        'source': 'lexicore-api',
        'event-type': 'ocr-job-created'
      }
    })
  }

  /**
   * Publish OCR result back to Kafka
   * @param resultData OCR result data
   */
  async publishOcrResult(resultData: {
    job_id: string
    status: 'completed' | 'failed'
    extracted_text?: string
    confidence_score?: number
    error_message?: string
  }): Promise<KafkaProducerResponse> {
    console.log('📤 Publishing OCR result to Kafka:', {
      job_id: resultData.job_id,
      status: resultData.status,
      topic: this.topics.ocrResults
    })

    return await this.publish({
      topic: this.topics.ocrResults,
      key: resultData.job_id,
      value: {
        ...resultData,
        timestamp: Date.now(),
        version: '1.0'
      },
      headers: {
        'source': 'lexicore-ocr-worker',
        'event-type': 'ocr-job-completed'
      }
    })
  }

  /**
   * Publish document event (create, update, delete)
   * @param eventData Document event data
   */
  async publishDocumentEvent(eventData: {
    event_type: 'created' | 'updated' | 'deleted'
    document_id: string
    matter_id: string
    user_id: string
    metadata?: any
  }): Promise<KafkaProducerResponse> {
    console.log('📤 Publishing document event to Kafka:', {
      event_type: eventData.event_type,
      document_id: eventData.document_id,
      topic: this.topics.documentEvents
    })

    return await this.publish({
      topic: this.topics.documentEvents,
      key: eventData.document_id,
      value: {
        ...eventData,
        timestamp: Date.now(),
        version: '1.0'
      },
      headers: {
        'source': 'lexicore-api',
        'event-type': `document-${eventData.event_type}`
      }
    })
  }

  /**
   * Publish audit log event
   * @param auditData Audit log data
   */
  async publishAuditLog(auditData: {
    event_type: string
    user_id: string
    resource_type: string
    resource_id: string
    action: string
    details?: any
  }): Promise<KafkaProducerResponse> {
    return await this.publish({
      topic: this.topics.auditLogs,
      key: `${auditData.resource_type}:${auditData.resource_id}`,
      value: {
        ...auditData,
        timestamp: Date.now(),
        version: '1.0'
      },
      headers: {
        'source': 'lexicore-api',
        'event-type': auditData.event_type
      }
    })
  }

  /**
   * Get consumer group status (for monitoring)
   */
  async getConsumerStatus(): Promise<any> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        message: 'Kafka is disabled'
      }
    }

    try {
      const response = await fetch(`${this.restProxyUrl}/consumers`, {
        headers: {
          'Accept': 'application/vnd.kafka.v2+json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to get consumer status: ${response.status}`)
      }

      return await response.json()
    } catch (error: any) {
      console.error('❌ Failed to get consumer status:', error)
      return {
        error: error.message,
        enabled: true,
        connected: false
      }
    }
  }

  /**
   * Health check for Kafka connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    if (!this.isEnabled()) {
      return {
        healthy: true,
        message: 'Kafka is disabled (using fallback queue)'
      }
    }

    try {
      const response = await fetch(this.restProxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.kafka.v2+json'
        }
      })

      return {
        healthy: response.ok,
        message: response.ok ? 'Kafka REST Proxy is reachable' : `HTTP ${response.status}`
      }
    } catch (error: any) {
      return {
        healthy: false,
        message: `Kafka connection failed: ${error.message}`
      }
    }
  }
}

/**
 * Fallback queue implementation (when Kafka is disabled)
 * Uses simple in-memory queue or Cloudflare Queue binding
 */
export class FallbackQueueService {
  /**
   * Enqueue OCR job using fallback mechanism
   */
  static async enqueueOcrJob(env: CloudflareBindings, jobData: any): Promise<void> {
    console.log('📋 Enqueuing OCR job (fallback):', jobData.job_id)
    
    // Option 1: Use Cloudflare Queue binding (if available)
    if (env.OCR_QUEUE) {
      await env.OCR_QUEUE.send(jobData)
      return
    }
    
    // Option 2: Store in DB as 'pending' and worker polls
    // This is the current implementation - job is already in DB
    console.log('📋 Job stored in DB, waiting for worker to poll')
    
    // Option 3: Future - Use Cloudflare Durable Objects for queue
    // Option 4: Future - Use external Redis/SQS
  }
}
