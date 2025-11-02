/**
 * utils.ts - BrassHelm Security Package Template (BIBLE)
 *
 * Converted from /Users/camobrien/Documents/GitHub/security/auth-templates/utils.js
 *
 * PURPOSE:
 * Core authentication utilities for JWT operations, password hashing,
 * and permission checking.
 *
 * BIBLE COMPLIANCE: EXACT COPY + Brassy-specific extensions at end
 */

import { SignJWT, jwtVerify } from 'jose';
import type { VercelRequest } from '@vercel/node';
import { getDB } from '../db/client';

/**
 * JWT SECRET CONFIGURATION
 *
 * CRITICAL: This secret MUST match across all BrassHelm services
 *
 * VALIDATION: Fails loudly if SESSION_SECRET is missing or misconfigured.
 * This prevents silent auth failures and makes debugging much easier.
 */
const SECRET = (() => {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      '🔴 CRITICAL: SESSION_SECRET environment variable not set!\n' +
      '\n' +
      'Required Action:\n' +
      '1. Get SESSION_SECRET from dashboard project:\n' +
      '   Visit: https://vercel.com/brasshelm/dashboard/settings/environment-variables\n' +
      '2. Add to this project:\n' +
      '   Visit: https://vercel.com/brasshelm/ai/settings/environment-variables\n' +
      '3. Paste EXACT SAME value from dashboard\n' +
      '\n' +
      'IMPORTANT: All BrassHelm subdomains MUST use the SAME SESSION_SECRET\n' +
      'for cross-subdomain authentication to work.'
    );
  }

  if (secret === 'fallback-secret-change-me') {
    throw new Error(
      '🔴 CRITICAL: SESSION_SECRET is using fallback value!\n' +
      '\n' +
      'This is a security risk and will break cross-subdomain auth.\n' +
      'Set actual SESSION_SECRET in Vercel environment variables.'
    );
  }

  if (secret.length < 32) {
    console.warn(
      '⚠️  WARNING: SESSION_SECRET is too short (' + secret.length + ' characters).\n' +
      'Recommended: At least 32 random characters for security.\n' +
      'Current secret is functional but could be stronger.'
    );
  }

  return new TextEncoder().encode(secret);
})();

// ========================================
// BIBLE FUNCTIONS (DO NOT MODIFY)
// ========================================

/**
 * CREATE SESSION - Generate JWT Token
 *
 * Takes user object from database and creates signed JWT token.
 * Token is valid for 30 days.
 */
export async function createSession(user: any): Promise<string> {
  const token = await new SignJWT({
    username: user.username,
    role: user.role,
    client_id: user.client_id,
    can_edit_leads: user.can_edit_leads,
    can_change_status: user.can_change_status,
    user_id: user.id // Add user_id for Brassy
  })
    .setProtectedHeader({ alg: 'HS256' })  // HMAC SHA-256
    .setIssuedAt()                          // Current timestamp
    .setExpirationTime('30d')               // Expires in 30 days
    .sign(SECRET);

  return token;
}

/**
 * VERIFY SESSION - Verify JWT Token
 *
 * Verifies JWT signature and decodes payload.
 * Returns null if token is invalid or expired.
 */
export async function verifySession(token: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch (error) {
    // Token invalid, expired, or signature mismatch
    return null;
  }
}

/**
 * IS AUTHENTICATED - Check Request Session
 *
 * Complete authentication check with 3 layers:
 * 1. Extract session cookie from request
 * 2. Verify JWT signature
 * 3. Check database for force logout (permissions_updated_at)
 */
export async function isAuthenticated(req: VercelRequest): Promise<any | null> {
  // Extract cookies from request headers
  const cookies = req.headers.cookie || '';

  // Find session cookie (format: "session=TOKEN; other=value")
  const match = cookies.match(/session=([^;]+)/);

  if (!match) return null;

  const token = match[1];

  // Verify JWT signature and decode
  const payload = await verifySession(token);

  if (!payload) return null;

  /**
   * FORCE LOGOUT CHECK
   *
   * Scenario: Admin demotes user from "admin" to "client"
   * Problem: User still has JWT with role="admin" for 30 days
   * Solution: Set permissions_updated_at = NOW() when changing permissions
   */
  const sql = getDB();
  const result = await sql`
    SELECT permissions_updated_at
    FROM admin_users
    WHERE username = ${payload.username}
  `;

  if (result.length === 0) return null;  // User deleted

  // Check if permissions changed after login
  const permissionsUpdatedAt = result[0].permissions_updated_at;
  if (permissionsUpdatedAt) {
    const jwtIssuedAt = new Date((payload.iat as number) * 1000);  // Convert Unix timestamp
    const permissionsUpdated = new Date(permissionsUpdatedAt);

    if (jwtIssuedAt < permissionsUpdated) {
      // JWT is stale - permissions changed after this token was issued
      return null;
    }
  }

  return payload;
}

/**
 * HASH PASSWORD - PBKDF2 with SHA-256
 *
 * Hashes password with PBKDF2 (100,000 iterations) and random salt.
 * Uses Web Crypto API (compatible with Vercel Edge Runtime).
 *
 * Storage Format: "salt:hash" (colon-separated hex strings)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random 16-byte salt (unique per password)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import password as cryptographic key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 256-bit hash using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,  // OWASP recommendation (min 100k)
      hash: 'SHA-256'
    },
    keyMaterial,
    256  // Output length in bits
  );

  // Convert to hex strings
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  // Return in format: "salt:hash"
  return `${saltHex}:${hashHex}`;
}

/**
 * VERIFY PASSWORD - Constant-Time Comparison
 *
 * Verifies password against stored hash using PBKDF2.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();

  // Split stored hash into salt and hash components
  const [saltHex, hashHex] = storedHash.split(':');

  if (!saltHex || !hashHex) return false;

  // Convert hex salt back to Uint8Array
  const salt = new Uint8Array(
    (saltHex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16))
  );

  // Import password as cryptographic key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive hash with same parameters as original
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,  // MUST match hashPassword()
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  // Convert to hex
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const computedHashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison (prevents timing attacks)
  return computedHashHex === hashHex;
}

/**
 * IS ADMIN - Check Admin or Superuser Role
 *
 * Returns true if user is admin OR superuser.
 * Superuser inherits all admin permissions.
 */
export function isAdmin(user: any): boolean {
  return user && (user.role === 'admin' || user.role === 'superuser');
}

/**
 * IS STAFF OR ADMIN - Check Staff/Admin/Superuser Role
 *
 * Returns true if user is staff, admin, OR superuser.
 */
export function isStaffOrAdmin(user: any): boolean {
  return user && (user.role === 'admin' || user.role === 'superuser' || user.role === 'staff');
}

/**
 * CAN MANAGE USERS - Check User Management Permissions
 *
 * Returns true if user can create/edit/delete other users.
 */
export function canManageUsers(user: any): boolean {
  return user && (user.role === 'admin' || user.role === 'superuser' || user.role === 'staff');
}

/**
 * IS SUPERUSER - Check Exclusive Superuser Role
 *
 * Returns true ONLY if user is superuser (not admin or staff).
 */
export function isSuperuser(user: any): boolean {
  return user && user.role === 'superuser';
}

/**
 * GET USER BY USERNAME - Fetch User from Database
 *
 * Fetches complete user record from database by username.
 * Returns null if user not found.
 */
export async function getUserByUsername(username: string): Promise<any | null> {
  const sql = getDB();
  const result = await sql`
    SELECT * FROM admin_users
    WHERE username = ${username}
  `;
  return result[0] || null;
}

// ========================================
// BRASSY-SPECIFIC EXTENSIONS (ADD BELOW)
// ========================================

/**
 * CHECK BRASSY ACCESS
 *
 * Brassy-specific: Checks if user has access in brassy_user_access table
 */
export async function checkBrassyAccess(userId: number): Promise<boolean> {
  const sql = getDB();

  try {
    const result = await sql`
      SELECT access_enabled
      FROM brassy_user_access
      WHERE user_id = ${userId}
    `;

    if (result.length === 0) {
      // User not in access table - deny access
      return false;
    }

    return result[0].access_enabled === true;
  } catch (error) {
    console.error('[Brassy] Access check failed:', error);
    return false;
  }
}

/**
 * IS AUTHENTICATED WITH BRASSY ACCESS
 *
 * Enhanced isAuthenticated with Brassy access check
 * Wraps BIBLE isAuthenticated() with Brassy-specific access validation
 */
export async function isAuthenticatedWithBrassyAccess(req: VercelRequest): Promise<any | null> {
  // Step 1: BIBLE authentication
  const user = await isAuthenticated(req);
  if (!user) return null;

  // Step 2: Brassy-specific access check
  const hasAccess = await checkBrassyAccess(user.user_id || user.id);
  if (!hasAccess) return null;

  return user;
}
