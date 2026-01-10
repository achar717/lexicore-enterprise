"use client";

// ============================================================================
// LexiCore Enterprise API Client
// Cloudflare Pages compatible - uses relative paths only
// ============================================================================

export interface Job {
  id: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentPage?: number;
  totalPages?: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface JobResult {
  id: string;
  documentId: string;
  text: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    confidence?: number;
  }>;
  confidence?: number;
  wordCount?: number;
}

export interface UploadResponse {
  documentId: string;
  filename: string;
  fileSize: number;
  fileType: string;
  storageKey: string;
}

// ============================================================================
// API Client Class
// ============================================================================

class APIClient {
  private baseUrl: string;

  constructor() {
    // Always use relative paths for Cloudflare Pages
    this.baseUrl = '';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: response.statusText 
      }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Create OCR job
  async createJob(documentId: string): Promise<Job> {
    return this.request<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ documentId }),
    });
  }

  // Get job status
  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/api/job/${jobId}`);
  }

  // Get OCR result
  async getResult(documentId: string): Promise<JobResult> {
    return this.request<JobResult>(`/api/result/${documentId}`);
  }

  // Upload file to R2
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: response.statusText 
      }));
      throw new Error(error.message || `Upload failed: ${response.status}`);
    }

    return response.json();
  }

  // Upload and create OCR job in one call
  async uploadAndProcess(file: File): Promise<{ job: Job; upload: UploadResponse }> {
    const upload = await this.uploadFile(file);
    const job = await this.createJob(upload.documentId);
    return { upload, job };
  }
}

// Export singleton instance
export const api = new APIClient();

// ============================================================================
// Polling Helper
// ============================================================================

export async function pollJobUntilComplete(
  jobId: string,
  onProgress?: (job: Job) => void,
  maxAttempts = 60, // 5 minutes at 5s intervals
  interval = 5000
): Promise<Job> {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await api.getJob(jobId);
    
    if (onProgress) {
      onProgress(job);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Job timeout: exceeded maximum polling attempts');
}
