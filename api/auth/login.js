/**
 * login.js - BrassHelm Security Package Template
 *
 * PURPOSE:
 * Handles user authentication via username/password.
 * Creates a JWT session token and sets a cookie that works across all *.brasshelm.com subdomains.
 *
 * CRITICAL CONFIGURATION:
 * - Cookie Domain: .brasshelm.com (REQUIRED for cross-subdomain auth)
 * - SameSite: Lax (REQUIRED for subdomain navigation, NOT Strict)
 * - SESSION_SECRET: MUST match dashboard project (for JWT verification)
 *
 * REQUIRED ENV VARS:
 * - SESSION_SECRET: Copy exact value from dashboard Vercel settings
 * - DATABASE_URL: Neon pooled connection string (ends with -pooler)
 *
 * USAGE:
 * 1. Copy this file to /api/auth/login.js in your project
 * 2. Ensure SESSION_SECRET matches dashboard (vercel env add SESSION_SECRET)
 * 3. Ensure DATABASE_URL is set (vercel env add DATABASE_URL)
 * 4. Deploy
 *
 * DOCUMENTATION:
 * See /security/AUTH_ARCHITECTURE.md for complete implementation guide
 *
 * LAST UPDATED: November 1, 2025
 */

export const config = { runtime: 'edge' };

import { createSession, verifyPassword } from './utils.js';
import { getDB } from '../db/client.js';

export default async function handler(req) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    // Parse request body
    const { username, password } = await req.json();

    // Validate required fields
    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username and password required' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Get database connection
    const sql = getDB();

    // Find user (case-insensitive username lookup)
    const users = await sql`
      SELECT * FROM admin_users
      WHERE LOWER(username) = LOWER(${username})
    `;

    // User not found
    if (users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const user = users[0];

    // Verify password using PBKDF2
    const validPassword = await verifyPassword(password, user.password_hash);

    if (!validPassword) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    // Update last_login timestamp and clear force-logout flag
    await sql`
      UPDATE admin_users
      SET last_login = NOW(),
          permissions_updated_at = NULL
      WHERE username = ${user.username}
    `;

    // Create JWT session token (signed with SESSION_SECRET)
    const token = await createSession(user);

    /**
     * CRITICAL: Cookie Configuration
     *
     * Domain=.brasshelm.com
     *   - Leading dot is REQUIRED for cross-subdomain cookies
     *   - Without this, cookie only works on current subdomain
     *   - Makes cookie available to all *.brasshelm.com subdomains
     *
     * SameSite=Lax
     *   - REQUIRED for cross-subdomain navigation
     *   - SameSite=Strict would block cookies on subdomain links
     *   - Still protects against CSRF (cookies not sent on POST from external sites)
     *
     * HttpOnly
     *   - Prevents JavaScript access to cookie
     *   - Protects against XSS attacks stealing tokens
     *
     * Secure (production only)
     *   - Cookie only sent over HTTPS
     *   - Protects against man-in-the-middle attacks
     *
     * Max-Age=2592000 (30 days in seconds)
     *   - JWT expires after 30 days
     *   - User must login again after expiration
     */
    const cookie = `session=${token}; Domain=.brasshelm.com; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Lax${
      process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
    }`;

    // Return success with user data
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Logged in successfully',
        user: {
          username: user.username,
          role: user.role,
          client_id: user.client_id
        }
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': cookie
        }
      }
    );

  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        error: 'Login failed',
        details: error.message
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
