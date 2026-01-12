// LexiCore™ Authentication Service
// Business logic for user authentication and session management

import type { Bindings, User, UserPublic, JWTPayload } from '../types'
import { hashPassword, verifyPassword, createJWT, verifyJWT, generateUUID, generateRandomString, sha256Hash } from '../utils/crypto'

export class AuthService {
  constructor(private db: D1Database, private kv: KVNamespace, private jwtSecret: string) {}

  /**
   * Register a new user (admin only in production)
   */
  async registerUser(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    bar_number?: string;
    role: string;
    is_attorney: boolean;
    created_by: string;
  }): Promise<UserPublic> {
    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    if (!this.isStrongPassword(data.password)) {
      throw new Error('Password must be at least 12 characters with uppercase, lowercase, number, and special character');
    }

    // Check if user already exists
    const existing = await this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(data.email)
      .first();

    if (existing) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const password_hash = await hashPassword(data.password);

    // Generate user ID
    const user_id = generateUUID();

    // Insert user
    await this.db
      .prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, bar_number, role, is_attorney, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        user_id,
        data.email.toLowerCase(),
        password_hash,
        data.first_name,
        data.last_name,
        data.bar_number || null,
        data.role,
        data.is_attorney ? 1 : 0,
        data.created_by
      )
      .run();

    // Return public user data
    return {
      id: user_id,
      email: data.email.toLowerCase(),
      first_name: data.first_name,
      last_name: data.last_name,
      bar_number: data.bar_number || null,
      role: data.role as any,
      is_attorney: data.is_attorney
    };
  }

  /**
   * Login user with email and password
   */
  async login(email: string, password: string, ip_address?: string, user_agent?: string): Promise<{
    user: UserPublic;
    access_token: string;
    refresh_token: string;
  }> {
    // Find user
    const user = await this.db
      .prepare('SELECT * FROM users WHERE email = ? AND status = ?')
      .bind(email.toLowerCase(), 'active')
      .first() as User | null;

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // ASYNC: Update last login in background (fire and forget for speed)
    this.db
      .prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?')
      .bind(user.id)
      .run()
      .catch(err => console.error('Failed to update last_login_at:', err));

    // Create JWT payload
    const jwtPayload: JWTPayload = {
      user_id: user.id,
      email: user.email,
      role: user.role,
      is_attorney: user.is_attorney,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 28800 // 8 hours
    };

    // Generate tokens
    const access_token = await createJWT(jwtPayload, this.jwtSecret, '8h');
    const refresh_token = generateRandomString(64);
    const refresh_token_hash = await sha256Hash(refresh_token);

    // Prepare session data
    const session_id = generateUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const sessionData = JSON.stringify({
      session_id,
      user_id: user.id,
      expires_at
    });

    // CRITICAL OPTIMIZATION: Only store in KV (fast), skip DB for speed
    // KV is sufficient for session validation and automatically expires
    await this.kv.put(`session:${refresh_token_hash}`, sessionData, {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days
    });

    // ASYNC: Store in DB for audit trail (fire-and-forget)
    this.db
      .prepare(`
        INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(session_id, user.id, refresh_token_hash, expires_at, ip_address || null, user_agent || null)
      .run()
      .catch(err => console.error('Failed to store session in DB:', err));

    return {
      user: this.toPublicUser(user),
      access_token,
      refresh_token
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refresh_token: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const refresh_token_hash = await sha256Hash(refresh_token);

    // Check KV first (fast lookup)
    const sessionDataStr = await this.kv.get(`session:${refresh_token_hash}`);
    if (!sessionDataStr) {
      throw new Error('Invalid or expired refresh token');
    }

    const sessionData = JSON.parse(sessionDataStr);

    // Verify session in database
    const session = await this.db
      .prepare(`
        SELECT s.*, u.* 
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.refresh_token_hash = ? AND s.is_revoked = 0 AND s.expires_at > datetime('now')
      `)
      .bind(refresh_token_hash)
      .first() as any;

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }

    // Update last used
    await this.db
      .prepare('UPDATE sessions SET last_used_at = datetime("now") WHERE id = ?')
      .bind(sessionData.session_id)
      .run();

    // Generate new tokens
    const jwtPayload: JWTPayload = {
      user_id: session.user_id,
      email: session.email,
      role: session.role,
      is_attorney: session.is_attorney,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 28800 // 8 hours
    };

    const new_access_token = await createJWT(jwtPayload, this.jwtSecret, '8h');
    const new_refresh_token = generateRandomString(64);
    const new_refresh_token_hash = await sha256Hash(new_refresh_token);

    // Revoke old session
    await this.db
      .prepare('UPDATE sessions SET is_revoked = 1, revoked_at = datetime("now") WHERE id = ?')
      .bind(sessionData.session_id)
      .run();

    await this.kv.delete(`session:${refresh_token_hash}`);

    // Create new session
    const new_session_id = generateUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .prepare(`
        INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(new_session_id, session.user_id, new_refresh_token_hash, expires_at, session.ip_address, session.user_agent)
      .run();

    await this.kv.put(`session:${new_refresh_token_hash}`, JSON.stringify({
      session_id: new_session_id,
      user_id: session.user_id,
      expires_at
    }), {
      expirationTtl: 7 * 24 * 60 * 60
    });

    return {
      access_token: new_access_token,
      refresh_token: new_refresh_token
    };
  }

  /**
   * Logout user (revoke session)
   */
  async logout(refresh_token: string): Promise<void> {
    const refresh_token_hash = await sha256Hash(refresh_token);

    // Revoke session in database
    await this.db
      .prepare('UPDATE sessions SET is_revoked = 1, revoked_at = datetime("now") WHERE refresh_token_hash = ?')
      .bind(refresh_token_hash)
      .run();

    // Remove from KV
    await this.kv.delete(`session:${refresh_token_hash}`);
  }

  /**
   * Verify JWT and return user
   */
  async verifyToken(token: string): Promise<UserPublic> {
    try {
      const payload = await verifyJWT(token, this.jwtSecret);

      // Get fresh user data
      const user = await this.db
        .prepare('SELECT * FROM users WHERE id = ? AND status = ?')
        .bind(payload.user_id, 'active')
        .first() as User | null;

      if (!user) {
        throw new Error('User not found or inactive');
      }

      return this.toPublicUser(user);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Check if user has access to a matter
   */
  async hasAccessToMatter(user_id: string, matter_id: string, required_level: 'read' | 'review' | 'edit' | 'admin' = 'read'): Promise<boolean> {
    const access = await this.db
      .prepare(`
        SELECT access_level FROM matter_access
        WHERE matter_id = ? AND user_id = ? AND is_active = 1
      `)
      .bind(matter_id, user_id)
      .first() as any;

    if (!access) {
      return false;
    }

    // Check access level hierarchy
    const levels = ['read', 'review', 'edit', 'admin'];
    const userLevel = levels.indexOf(access.access_level);
    const requiredLevelIndex = levels.indexOf(required_level);

    return userLevel >= requiredLevelIndex;
  }

  /**
   * Get all matters user has access to
   */
  async getUserMatters(user_id: string): Promise<any[]> {
    const matters = await this.db
      .prepare(`
        SELECT m.*, ma.access_level
        FROM matters m
        JOIN matter_access ma ON m.id = ma.matter_id
        WHERE ma.user_id = ? AND ma.is_active = 1
        ORDER BY m.created_at DESC
      `)
      .bind(user_id)
      .all();

    return matters.results || [];
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength (legal-grade security)
   */
  private isStrongPassword(password: string): boolean {
    // Minimum 12 characters, at least one uppercase, one lowercase, one number, one special character
    if (password.length < 12) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;
    return true;
  }

  /**
   * Verify access token and return payload
   */
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    return await verifyJWT(token, this.jwtSecret);
  }

  /**
   * Get session by refresh token
   */
  async getSessionByRefreshToken(refresh_token: string): Promise<{ user_id: string; session_id: string } | null> {
    const refresh_token_hash = await sha256Hash(refresh_token);
    const sessionDataStr = await this.kv.get(`session:${refresh_token_hash}`);
    if (!sessionDataStr) {
      return null;
    }
    return JSON.parse(sessionDataStr);
  }

  /**
   * Convert User to UserPublic (remove sensitive data)
   */
  private toPublicUser(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      bar_number: user.bar_number,
      role: user.role,
      is_attorney: user.is_attorney
    };
  }
}
