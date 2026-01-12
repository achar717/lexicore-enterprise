/**
 * OCR API Client
 * Service for interacting with OCR endpoints
 */

interface OcrJobRequest {
  document_id: string
  matter_id?: string
  language?: string
  enable_preprocessing?: boolean
  pdf_strategy?: 'auto' | 'image' | 'text'
}

interface OcrJobResponse {
  success: boolean
  job_id: string
  status: string
  document_id: string
  matter_id: string
  file_type: string
  language: string
  estimated_time_seconds: number
  message: string
}

interface OcrJobStatus {
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  document_id: string
  matter_id: string
  matter_name: string
  document_filename: string
  file_type: string
  language: string
  progress_percentage: number
  total_pages: number
  current_page: number
  confidence_score: number
  word_count: number
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  retry_count: number
  pages: Array<{
    page_number: number
    word_count: number
    confidence_score: number
    status: string
  }> | null
  creator_name: string
}

interface OcrJobResults {
  job_id: string
  document_id: string
  status: string
  text: string
  word_count: number
  confidence_score: number
  total_pages: number
  language: string
  pages: Array<{
    page_number: number
    text: string
    word_count: number
    confidence: number
    processing_time_ms: number
    status: string
  }>
  quality_summary: {
    high_confidence_pages: number
    medium_confidence_pages: number
    low_confidence_pages: number
    completed_pages: number
  }
}

interface OcrJobList {
  jobs: Array<{
    job_id: string
    status: string
    document_id: string
    document_filename: string
    matter_id: string
    matter_name: string
    file_type: string
    total_pages: number
    progress: number
    confidence_score: number
    created_at: string
    completed_at?: string
  }>
  total: number
  limit: number
  offset: number
}

interface QueueStatus {
  queue: {
    [status: string]: {
      job_count: number
      total_pages: number
      processed_pages: number
    }
  }
  statistics_7_days: {
    total_jobs: number
    completed_jobs: number
    failed_jobs: number
    avg_words_per_job: number
    total_pages_processed: number
  }
}

class OcrApiClient {
  private baseUrl: string

  constructor(baseUrl: string = '/api/ocr') {
    this.baseUrl = baseUrl
  }

  /**
   * Create a new OCR job
   */
  async createJob(request: OcrJobRequest): Promise<OcrJobResponse> {
    const response = await fetch(`${this.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create OCR job')
    }

    return response.json()
  }

  /**
   * Get OCR job status
   */
  async getJobStatus(jobId: string): Promise<OcrJobStatus> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch job status')
    }

    return response.json()
  }

  /**
   * Get OCR job results
   */
  async getJobResults(jobId: string): Promise<OcrJobResults> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}/result`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch job results')
    }

    return response.json()
  }

  /**
   * List OCR jobs
   */
  async listJobs(params?: {
    matter_id?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<OcrJobList> {
    const queryParams = new URLSearchParams()
    
    if (params?.matter_id) queryParams.append('matter_id', params.matter_id)
    if (params?.status) queryParams.append('status', params.status)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const response = await fetch(`${this.baseUrl}/jobs?${queryParams}`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to list jobs')
    }

    return response.json()
  }

  /**
   * Cancel OCR job
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to cancel job')
    }

    return response.json()
  }

  /**
   * Retry failed OCR job
   */
  async retryJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}/retry`, {
      method: 'POST'
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to retry job')
    }

    return response.json()
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const response = await fetch(`${this.baseUrl}/queue-status`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to fetch queue status')
    }

    return response.json()
  }

  /**
   * Poll job status until complete
   */
  async pollJobStatus(
    jobId: string,
    onProgress?: (status: OcrJobStatus) => void,
    pollIntervalMs: number = 2000,
    maxWaitMs: number = 300000 // 5 minutes
  ): Promise<OcrJobStatus> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getJobStatus(jobId)
          
          if (onProgress) {
            onProgress(status)
          }

          if (status.status === 'completed') {
            resolve(status)
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            reject(new Error(status.error_message || `Job ${status.status}`))
          } else if (Date.now() - startTime > maxWaitMs) {
            reject(new Error('Polling timeout'))
          } else {
            setTimeout(poll, pollIntervalMs)
          }
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }
}

// Export singleton instance
export const ocrApiClient = new OcrApiClient()

// Export types
export type {
  OcrJobRequest,
  OcrJobResponse,
  OcrJobStatus,
  OcrJobResults,
  OcrJobList,
  QueueStatus
}
