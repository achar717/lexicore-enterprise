/**
 * LexiCore™ Email Service
 * Resend API integration for notification delivery
 */

export interface EmailTemplate {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export interface UserApprovalEmailData {
  partnerName: string
  firstName: string
  lastName: string
  email: string
  role: string
  requestedBy: string
  requestId: string
  siteUrl: string
}

export interface ContractEmailData {
  userName: string
  contractName: string
  matterTitle: string
  uploadedBy: string
  contractId: string
  siteUrl: string
}

export interface ExtractionCompleteData {
  userName: string
  contractName: string
  extractionId: string
  itemsExtracted: number
  siteUrl: string
}

export interface AmbiguousItemsData {
  userName: string
  contractName: string
  extractionId: string
  ambiguousCount: number
  siteUrl: string
}

/**
 * EmailService - Handles email delivery via Resend API
 */
export class EmailService {
  private fromAddress: string
  private fromName: string
  private siteUrl: string

  constructor(
    private resendApiKey: string,
    config?: {
      fromAddress?: string
      fromName?: string
      siteUrl?: string
    }
  ) {
    this.fromAddress = config?.fromAddress || 'notifications@apexailexicolegal.com'
    this.fromName = config?.fromName || 'LexiCore'
    this.siteUrl = config?.siteUrl || 'https://www.apexailexicolegal.com'
  }

  /**
   * Send email using Resend API
   */
  async send(template: EmailTemplate): Promise<boolean> {
    try {
      if (!this.resendApiKey) {
        console.warn('⚠️ Resend API key not configured, skipping email')
        return false
      }

      const recipients = Array.isArray(template.to) ? template.to : [template.to]

      // Resend API payload
      const payload = {
        from: `${this.fromName} <${this.fromAddress}>`,
        to: recipients,
        subject: template.subject,
        html: template.html,
        text: template.text || this.stripHtml(template.html)
      }

      // Call Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ Resend API error:', error)
        return false
      }

      const result = await response.json()
      console.log('✅ Email sent successfully:', template.subject, 'to', recipients.join(', '), '- ID:', result.id)
      return true
    } catch (error) {
      console.error('❌ Email send failed:', error)
      return false
    }
  }

  /**
   * Strip HTML tags for plain text fallback
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Send user approval request email to partner
   */
  async sendUserApprovalRequest(partnerEmail: string, data: UserApprovalEmailData): Promise<boolean> {
    const approvalUrl = `${data.siteUrl}/user-approval?id=${data.requestId}`

    const html = this.renderUserApprovalTemplate(data, approvalUrl)

    return await this.send({
      to: partnerEmail,
      subject: `New User Approval Request: ${data.firstName} ${data.lastName}`,
      html
    })
  }

  /**
   * Send approval confirmation email to admin
   */
  async sendUserApprovedEmail(adminEmail: string, data: { firstName: string, lastName: string, approvedBy: string, siteUrl: string }): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('✅ User Approved')}
          <div class="content">
            <p>Hello,</p>
            <p>The user approval request has been <strong>approved</strong>.</p>
            <div class="details">
              <p><strong>User:</strong> ${data.firstName} ${data.lastName}</p>
              <p><strong>Approved By:</strong> ${data.approvedBy}</p>
            </div>
            <p>The user account has been created and activated.</p>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `

    return await this.send({
      to: adminEmail,
      subject: `User Approved: ${data.firstName} ${data.lastName}`,
      html
    })
  }

  /**
   * Send welcome email to newly approved user
   */
  async sendWelcomeEmail(userEmail: string, data: { firstName: string, lastName: string, siteUrl: string }): Promise<boolean> {
    const loginUrl = `${data.siteUrl}/auth`

    const html = `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('🎉 Welcome to LexiCore')}
          <div class="content">
            <p>Hello ${data.firstName},</p>
            <p>Your LexiCore account has been approved and activated!</p>
            <div class="details">
              <p><strong>Email:</strong> ${userEmail}</p>
              <p><strong>Status:</strong> <span class="badge badge-success">Active</span></p>
            </div>
            <p>You can now access the LexiCore platform:</p>
            <a href="${loginUrl}" class="button">Login to LexiCore →</a>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              If you have any questions, please contact your system administrator.
            </p>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `

    return await this.send({
      to: userEmail,
      subject: 'Welcome to LexiCore - Your Account is Active',
      html
    })
  }

  /**
   * Send contract uploaded notification
   */
  async sendContractUploadedEmail(userEmail: string, data: ContractEmailData): Promise<boolean> {
    const contractUrl = `${data.siteUrl}/transactional/contract/${data.contractId}`

    const html = `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('📄 Contract Uploaded')}
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>A new contract has been uploaded to <strong>${data.matterTitle}</strong>:</p>
            <div class="details">
              <p><strong>Contract:</strong> ${data.contractName}</p>
              <p><strong>Uploaded By:</strong> ${data.uploadedBy}</p>
              <p><span class="badge badge-pending">Pending Review</span></p>
            </div>
            <a href="${contractUrl}" class="button">View Contract →</a>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `

    return await this.send({
      to: userEmail,
      subject: `Contract Uploaded: ${data.contractName}`,
      html
    })
  }

  /**
   * Send extraction complete notification
   */
  async sendExtractionCompleteEmail(userEmail: string, data: ExtractionCompleteData): Promise<boolean> {
    const extractionUrl = `${data.siteUrl}/transactional/extraction/${data.extractionId}`

    const html = `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('✨ AI Extraction Complete')}
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>AI has completed extracting key terms from <strong>${data.contractName}</strong>.</p>
            <div class="details">
              <p><strong>Items Extracted:</strong> ${data.itemsExtracted}</p>
              <p><strong>Status:</strong> <span class="badge badge-success">Ready for Review</span></p>
            </div>
            <p>Please review the extracted terms and confirm their accuracy:</p>
            <a href="${extractionUrl}" class="button">Review Extraction →</a>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `

    return await this.send({
      to: userEmail,
      subject: `Extraction Complete: ${data.contractName}`,
      html
    })
  }

  /**
   * Send ambiguous items detected notification (PRIORITY)
   */
  async sendAmbiguousItemsEmail(userEmail: string, data: AmbiguousItemsData): Promise<boolean> {
    const extractionUrl = `${data.siteUrl}/transactional/extraction/${data.extractionId}`

    const html = `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('⚠️ Attention Required')}
          <div class="content">
            <div class="alert alert-warning">
              <p><strong>Ambiguous Terms Detected</strong></p>
              <p>AI has identified items requiring clarification in ${data.contractName}.</p>
            </div>
            <p>Hello ${data.userName},</p>
            <p>The AI extraction system has detected <strong>${data.ambiguousCount} ambiguous items</strong> that require your immediate attention.</p>
            <div class="details">
              <p><strong>Contract:</strong> ${data.contractName}</p>
              <p><strong>Ambiguous Items:</strong> ${data.ambiguousCount}</p>
              <p><span class="badge badge-warning">⚠️ Requires Review</span></p>
            </div>
            <p>Please review these items to ensure accurate contract interpretation:</p>
            <a href="${extractionUrl}" class="button button-warning">Review Now →</a>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `

    return await this.send({
      to: userEmail,
      subject: `⚠️ Ambiguous Items Detected: ${data.contractName}`,
      html
    })
  }

  /**
   * Render user approval email template
   */
  private renderUserApprovalTemplate(data: UserApprovalEmailData, approvalUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      ${this.renderEmailHead()}
      <body>
        <div class="container">
          ${this.renderEmailHeader('⚖️ New User Approval Request')}
          <div class="content">
            <p>Hello ${data.partnerName},</p>
            <p>A new user approval request requires your attention.</p>
            <div class="details">
              <h3>User Details</h3>
              <p><strong>Name:</strong> ${data.firstName} ${data.lastName}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              <p><strong>Role:</strong> <span class="badge">${this.formatRole(data.role)}</span></p>
              <p><strong>Requested By:</strong> ${data.requestedBy}</p>
            </div>
            <p>Please review and approve or reject this request:</p>
            <a href="${approvalUrl}" class="button">Review Request →</a>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This is an automated notification from LexiCore™ User Management System.
            </p>
          </div>
          ${this.renderEmailFooter()}
        </div>
      </body>
      </html>
    `
  }

  /**
   * Render email head with styles
   */
  private renderEmailHead(): string {
    return `
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f3f4f6;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #1a2332 0%, #2d3e50 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
            font-weight: 700;
          }
          .header p {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
          }
          .content {
            padding: 30px;
          }
          .content p {
            margin: 0 0 15px 0;
          }
          .details {
            background: #f9fafb;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #b8860b;
            margin: 20px 0;
          }
          .details h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #1a2332;
          }
          .details p {
            margin: 8px 0;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background: #b8860b;
            color: white !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
          }
          .button-warning {
            background: #f59e0b;
          }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: capitalize;
          }
          .badge-success {
            background: #10b981;
            color: white;
          }
          .badge-pending {
            background: #f59e0b;
            color: white;
          }
          .badge-warning {
            background: #ef4444;
            color: white;
          }
          .alert {
            padding: 16px;
            border-radius: 6px;
            margin: 20px 0;
          }
          .alert-warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            color: #92400e;
          }
          .footer {
            text-align: center;
            padding: 20px;
            background: #f9fafb;
            color: #6b7280;
            font-size: 14px;
            border-top: 1px solid #e5e7eb;
          }
          .footer p {
            margin: 5px 0;
          }
        </style>
      </head>
    `
  }

  /**
   * Render email header
   */
  private renderEmailHeader(title: string): string {
    return `
      <div class="header">
        <h1>${title}</h1>
        <p>LexiCore™ Enterprise Legal Platform</p>
      </div>
    `
  }

  /**
   * Render email footer
   */
  private renderEmailFooter(): string {
    return `
      <div class="footer">
        <p>© 2025 LexiCore™ - Enterprise Legal Platform</p>
        <p>Powered by AI-driven legal intelligence</p>
      </div>
    `
  }

  /**
   * Format role for display
   */
  private formatRole(role: string): string {
    const roleMap: Record<string, string> = {
      'admin': 'Admin',
      'partner': 'Partner',
      'associate': 'Associate',
      'paralegal': 'Paralegal',
      'litigation_support': 'Litigation Support',
      'compliance': 'Compliance',
      'read_only': 'Read-Only'
    }
    return roleMap[role] || role
  }
}
