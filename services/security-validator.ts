/**
 * LexiCore™ IP Practice Module - Phase 6: Security Validation Service
 * 
 * Purpose: Comprehensive input validation, sanitization, and security checks
 * Features:
 * - Input sanitization and validation
 * - SQL injection prevention
 * - XSS prevention
 * - Path traversal prevention
 * - File type validation
 * - Size limit enforcement
 * - Data encryption/decryption utilities
 * - Security logging
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sanitized?: any
}

export class SecurityValidator {
  // Maximum allowed lengths
  private static readonly MAX_STRING_LENGTH = 10000
  private static readonly MAX_TEXT_LENGTH = 100000
  private static readonly MAX_FILENAME_LENGTH = 255
  private static readonly MAX_EMAIL_LENGTH = 320
  private static readonly MAX_URL_LENGTH = 2048

  // Allowed file extensions for IP documents
  private static readonly ALLOWED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.txt', '.rtf',
    '.jpg', '.jpeg', '.png', '.gif', '.tiff',
    '.xls', '.xlsx', '.csv'
  ]

  // Dangerous patterns
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
    /(--|\/\*|\*\/|;)/,
    /(\bOR\b\s+\d+\s*=\s*\d+|\bAND\b\s+\d+\s*=\s*\d+)/i
  ]

  private static readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick, onload, etc.
    /<embed[^>]*>/gi,
    /<object[^>]*>/gi
  ]

  private static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\./,
    /\.\.\//, 
    /\.\.\\/, 
    /%2e%2e/i,
    /%252e/i
  ]

  /**
   * Validate and sanitize IP practice mode configuration
   */
  static validatePracticeMode(data: any): ValidationResult {
    const errors: string[] = []

    // Validate mode name
    if (!data.mode_name || typeof data.mode_name !== 'string') {
      errors.push('Practice mode name is required and must be a string')
    } else if (data.mode_name.length > 100) {
      errors.push('Practice mode name must not exceed 100 characters')
    }

    // Validate mode type
    const validTypes = ['patent', 'trademark', 'copyright', 'trade_secret', 'ip_licensing', 'ip_litigation']
    if (!data.mode_type || !validTypes.includes(data.mode_type)) {
      errors.push(`Mode type must be one of: ${validTypes.join(', ')}`)
    }

    // Validate description
    if (data.description && data.description.length > this.MAX_TEXT_LENGTH) {
      errors.push(`Description must not exceed ${this.MAX_TEXT_LENGTH} characters`)
    }

    // Sanitize strings
    const sanitized = {
      mode_name: this.sanitizeString(data.mode_name),
      mode_type: data.mode_type,
      description: data.description ? this.sanitizeString(data.description) : null,
      is_active: Boolean(data.is_active)
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate extraction job input
   */
  static validateExtractionJob(data: any): ValidationResult {
    const errors: string[] = []

    // Validate required fields
    if (!data.practice_mode_id || typeof data.practice_mode_id !== 'string') {
      errors.push('Practice mode ID is required')
    }

    if (!data.document_id || typeof data.document_id !== 'string') {
      errors.push('Document ID is required')
    }

    if (!data.prompt_template_id || typeof data.prompt_template_id !== 'string') {
      errors.push('Prompt template ID is required')
    }

    // Validate LLM parameters
    if (data.llm_temperature !== undefined) {
      const temp = parseFloat(data.llm_temperature)
      if (isNaN(temp) || temp < 0 || temp > 1) {
        errors.push('LLM temperature must be between 0 and 1')
      }
    }

    if (data.llm_max_tokens !== undefined) {
      const tokens = parseInt(data.llm_max_tokens)
      if (isNaN(tokens) || tokens < 1 || tokens > 100000) {
        errors.push('LLM max tokens must be between 1 and 100000')
      }
    }

    // Sanitize
    const sanitized = {
      practice_mode_id: this.sanitizeString(data.practice_mode_id),
      document_id: this.sanitizeString(data.document_id),
      prompt_template_id: this.sanitizeString(data.prompt_template_id),
      llm_model: data.llm_model ? this.sanitizeString(data.llm_model) : '@cf/meta/llama-3.1-70b-instruct',
      llm_temperature: data.llm_temperature ? parseFloat(data.llm_temperature) : 0.1,
      llm_max_tokens: data.llm_max_tokens ? parseInt(data.llm_max_tokens) : 4000
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate extracted fact data
   */
  static validateExtractedFact(data: any): ValidationResult {
    const errors: string[] = []

    // Validate required fields
    if (!data.fact_type || typeof data.fact_type !== 'string') {
      errors.push('Fact type is required')
    }

    if (!data.fact_text || typeof data.fact_text !== 'string') {
      errors.push('Fact text is required')
    } else if (data.fact_text.length > this.MAX_TEXT_LENGTH) {
      errors.push(`Fact text must not exceed ${this.MAX_TEXT_LENGTH} characters`)
    }

    if (!data.source_location || typeof data.source_location !== 'string') {
      errors.push('Source location is required')
    }

    // Validate confidence score
    if (data.confidence_score !== undefined) {
      const score = parseFloat(data.confidence_score)
      if (isNaN(score) || score < 0 || score > 1) {
        errors.push('Confidence score must be between 0 and 1')
      }
    }

    // Sanitize
    const sanitized = {
      fact_type: this.sanitizeString(data.fact_type),
      fact_text: this.sanitizeString(data.fact_text),
      source_location: this.sanitizeString(data.source_location),
      source_page: data.source_page ? parseInt(data.source_page) : null,
      confidence_score: data.confidence_score ? parseFloat(data.confidence_score) : 0.5
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate evidence package generation request
   */
  static validateEvidencePackage(data: any): ValidationResult {
    const errors: string[] = []

    // Validate required fields
    if (!data.matterId || typeof data.matterId !== 'string') {
      errors.push('Matter ID is required')
    }

    if (!data.extractionJobId || typeof data.extractionJobId !== 'string') {
      errors.push('Extraction job ID is required')
    }

    if (!data.title || typeof data.title !== 'string') {
      errors.push('Package title is required')
    } else if (data.title.length > 500) {
      errors.push('Package title must not exceed 500 characters')
    }

    // Validate package type
    const validTypes = ['full_evidence', 'audit_only', 'facts_only', 'court_ready']
    if (!data.packageType || !validTypes.includes(data.packageType)) {
      errors.push(`Package type must be one of: ${validTypes.join(', ')}`)
    }

    // Validate export format
    const validFormats = ['pdf', 'docx', 'json', 'csv', 'zip']
    if (!data.exportFormat || !validFormats.includes(data.exportFormat)) {
      errors.push(`Export format must be one of: ${validFormats.join(', ')}`)
    }

    // Validate filter options
    if (data.filterOptions?.confidenceThreshold !== undefined) {
      const threshold = parseFloat(data.filterOptions.confidenceThreshold)
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        errors.push('Confidence threshold must be between 0 and 1')
      }
    }

    // Sanitize
    const sanitized = {
      matterId: this.sanitizeString(data.matterId),
      extractionJobId: this.sanitizeString(data.extractionJobId),
      packageType: data.packageType,
      title: this.sanitizeString(data.title),
      description: data.description ? this.sanitizeString(data.description) : null,
      exportFormat: data.exportFormat,
      includeOptions: data.includeOptions || {},
      filterOptions: data.filterOptions || {}
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate audit export request
   */
  static validateAuditExport(data: any): ValidationResult {
    const errors: string[] = []

    // Validate export type
    const validTypes = ['full_audit', 'matter_audit', 'document_audit', 'extraction_audit', 'review_audit']
    if (!data.exportType || !validTypes.includes(data.exportType)) {
      errors.push(`Export type must be one of: ${validTypes.join(', ')}`)
    }

    // Validate format
    const validFormats = ['csv', 'json', 'xlsx', 'pdf']
    if (!data.format || !validFormats.includes(data.format)) {
      errors.push(`Format must be one of: ${validFormats.join(', ')}`)
    }

    // Validate date range
    if (data.dateRangeStart && !this.isValidISODate(data.dateRangeStart)) {
      errors.push('Invalid start date format (use ISO 8601)')
    }

    if (data.dateRangeEnd && !this.isValidISODate(data.dateRangeEnd)) {
      errors.push('Invalid end date format (use ISO 8601)')
    }

    // Sanitize
    const sanitized = {
      exportType: data.exportType,
      format: data.format,
      matterId: data.matterId ? this.sanitizeString(data.matterId) : null,
      documentId: data.documentId ? this.sanitizeString(data.documentId) : null,
      extractionJobId: data.extractionJobId ? this.sanitizeString(data.extractionJobId) : null,
      dateRangeStart: data.dateRangeStart || null,
      dateRangeEnd: data.dateRangeEnd || null,
      filterCriteria: data.filterCriteria || {}
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate filename for security
   */
  static validateFilename(filename: string): ValidationResult {
    const errors: string[] = []

    // Check length
    if (filename.length > this.MAX_FILENAME_LENGTH) {
      errors.push(`Filename must not exceed ${this.MAX_FILENAME_LENGTH} characters`)
    }

    // Check for path traversal
    if (this.containsPathTraversal(filename)) {
      errors.push('Filename contains invalid characters (path traversal detected)')
    }

    // Check file extension
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`File extension ${ext} is not allowed. Allowed: ${this.ALLOWED_EXTENSIONS.join(', ')}`)
    }

    // Sanitize
    const sanitized = this.sanitizeFilename(filename)

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    }
  }

  /**
   * Validate email address
   */
  static validateEmail(email: string): ValidationResult {
    const errors: string[] = []

    if (!email || typeof email !== 'string') {
      errors.push('Email is required')
    } else {
      if (email.length > this.MAX_EMAIL_LENGTH) {
        errors.push(`Email must not exceed ${this.MAX_EMAIL_LENGTH} characters`)
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        errors.push('Invalid email format')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? email.toLowerCase().trim() : undefined
    }
  }

  /**
   * Validate URL
   */
  static validateURL(url: string): ValidationResult {
    const errors: string[] = []

    if (!url || typeof url !== 'string') {
      errors.push('URL is required')
    } else {
      if (url.length > this.MAX_URL_LENGTH) {
        errors.push(`URL must not exceed ${this.MAX_URL_LENGTH} characters`)
      }

      try {
        const urlObj = new URL(url)
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          errors.push('URL must use HTTP or HTTPS protocol')
        }
      } catch (e) {
        errors.push('Invalid URL format')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? url : undefined
    }
  }

  /**
   * Sanitize string (remove dangerous characters)
   */
  private static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return ''
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, '')

    // Remove XSS patterns
    for (const pattern of this.XSS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '')
    }

    // Trim whitespace
    sanitized = sanitized.trim()

    return sanitized
  }

  /**
   * Sanitize filename
   */
  private static sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters
    let sanitized = filename.replace(/[\/\\]/g, '_')
    sanitized = sanitized.replace(/\.\./g, '_')
    sanitized = sanitized.replace(/[<>:"|?*\x00-\x1F]/g, '_')
    return sanitized
  }

  /**
   * Check for SQL injection patterns
   */
  static containsSQLInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false
    }

    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return true
      }
    }

    return false
  }

  /**
   * Check for XSS patterns
   */
  static containsXSS(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false
    }

    for (const pattern of this.XSS_PATTERNS) {
      if (pattern.test(input)) {
        return true
      }
    }

    return false
  }

  /**
   * Check for path traversal patterns
   */
  static containsPathTraversal(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false
    }

    for (const pattern of this.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) {
        return true
      }
    }

    return false
  }

  /**
   * Validate ISO date format
   */
  private static isValidISODate(dateString: string): boolean {
    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime())
  }

  /**
   * Encrypt sensitive data (for storage)
   */
  static async encryptData(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const keyBuffer = encoder.encode(key)

    // Generate encryption key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', keyBuffer),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    )

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      dataBuffer
    )

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encryptedBuffer), iv.length)

    // Convert to base64
    return btoa(String.fromCharCode(...combined))
  }

  /**
   * Decrypt sensitive data
   */
  static async decryptData(encryptedData: string, key: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyBuffer = encoder.encode(key)

    // Generate decryption key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', keyBuffer),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    // Decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12)
    const encryptedBuffer = combined.slice(12)

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encryptedBuffer
    )

    // Convert to string
    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  }

  /**
   * Validate and sanitize JSON input
   */
  static validateJSON(input: string, maxSize: number = 1024 * 1024): ValidationResult {
    const errors: string[] = []

    if (!input || typeof input !== 'string') {
      errors.push('JSON input is required')
      return { valid: false, errors }
    }

    if (input.length > maxSize) {
      errors.push(`JSON input must not exceed ${maxSize} bytes`)
      return { valid: false, errors }
    }

    try {
      const parsed = JSON.parse(input)
      return {
        valid: true,
        errors: [],
        sanitized: parsed
      }
    } catch (e) {
      errors.push('Invalid JSON format')
      return { valid: false, errors }
    }
  }

  /**
   * Rate limit check (simple implementation)
   */
  static checkRateLimit(identifier: string, limit: number, windowMs: number, store: Map<string, any>): boolean {
    const now = Date.now()
    const key = `ratelimit:${identifier}`
    const record = store.get(key)

    if (!record) {
      store.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }

    if (now > record.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }

    if (record.count >= limit) {
      return false
    }

    record.count++
    store.set(key, record)
    return true
  }
}
