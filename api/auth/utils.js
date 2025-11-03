/**
 * utils.js - BrassHelm Security Package Template
 *
 * PURPOSE:
 * Core authentication utilities for JWT operations, password hashing,
 * and permission checking.
 *
 * FUNCTIONS:
 * - createSession(user) - Generate JWT token from user data
 * - verifySession(token) - Verify JWT signature and decode payload
 * - isAuthenticated(req) - Check if request has valid session
 * - hashPassword(password) - Hash password with PBKDF2
 * - verifyPassword(password, hash) - Verify password against hash
 * - isAdmin(user) - Check if user is admin or superuser
 * - isStaffOrAdmin(user) - Check if user is staff, admin, or superuser
 * - canManageUsers(user) - Check if user can manage other users
 * - isSuperuser(user) - Check if user is exclusively superuser
 * - getUserByUsername(username) - Fetch user from database
 *
 * REQUIRED ENV VARS:
 * - SESSION_SECRET: MUST match dashboard (for JWT signing/verification)
 * - DATABASE_URL: For database queries (MUST be pooled connection)
 *
 * SECURITY FEATURES:
 * - JWT signed with HMAC-SHA256
 * - Password hashing with PBKDF2 (100,000 iterations)
 * - Unique salt per password
 * - Constant-time password comparison
 * - Force logout on permission changes
 *
 * USAGE:
 * 1. Copy this file to /api/auth/utils.js in your project
 * 2. Ensure SESSION_SECRET matches dashboard exactly
 * 3. Install dependencies: npm install jose @neondatabase/serverless
 * 4. Deploy
 *
 * DOCUMENTATION:
 * See /security/AUTH_ARCHITECTURE.md for complete implementation guide
 *
 * LAST UPDATED: November 1, 2025
 */

import { SignJWT, jwtVerify } from 'jose';
import { getDB } from '../db/client.js';

/**
 * JWT SECRET CONFIGURATION
 *
 * CRITICAL: This secret MUST match across all BrassHelm services
 *
 * Why it matters:
 * - Token signed on admin.brasshelm.com with secret A
 * - Token verified on tracker.brasshelm.com with secret B
 * - If A ≠ B, verification fails = "Token verification failed"
 *
 * How to ensure it matches:
 * 1. Get value from dashboard Vercel settings
 * 2. Add exact same value to new project: vercel env add SESSION_SECRET
 * 3. Never generate a new secret for new services
 *
 * VALIDATION: Fails loudly if SESSION_SECRET is not properly configured
 */
const SECRET = (() => {
  const secret = process.env.SESSION_SECRET;

  // Check if SESSION_SECRET is set
  if (!secret) {
    throw new Error(
      '🔴 CRITICAL: SESSION_SECRET environment variable not set!\n' +
      '\n' +
      'Required Action:\n' +
      '1. Get SESSION_SECRET from dashboard project:\n' +
      '   Visit: https://vercel.com/brasshelm/dashboard/settings/environment-variables\n' +
      '2. Add to this project:\n' +
      '   vercel env add SESSION_SECRET production\n' +
      '3. Paste EXACT SAME value from dashboard\n' +
      '\n' +
      'IMPORTANT: All BrassHelm subdomains MUST use the SAME SESSION_SECRET\n' +
      'for cross-subdomain authentication to work.'
    );
  }

  // Check if using dangerous fallback value
  if (secret === 'fallback-secret-change-me') {
    throw new Error(
      '🔴 CRITICAL: SESSION_SECRET is using fallback value!\n' +
      '\n' +
      'This is a security risk and will break cross-subdomain auth.\n' +
      'Set actual SESSION_SECRET in Vercel environment variables.'
    );
  }

  // Warn if secret is too short (not blocking, just warning)
  if (secret.length < 32) {
    console.warn(
      '⚠️  WARNING: SESSION_SECRET is too short (' + secret.length + ' characters).\n' +
      'Recommended: At least 32 random characters for security.\n' +
      'Current secret is functional but could be stronger.'
    );
  }

  return new TextEncoder().encode(secret);
})();

/**
 * CREATE SESSION - Generate JWT Token
 *
 * Takes user object from database and creates signed JWT token.
 * Token is valid for 30 days.
 *
 * @param {Object} user - User object from database
 * @param {string} user.username - Username
 * @param {string} user.role - User role (admin, superuser, staff, client)
 * @param {string} user.client_id - Client identifier
 * @param {boolean} user.can_edit_leads - Permission flag
 * @param {boolean} user.can_change_status - Permission flag
 * @returns {Promise<string>} JWT token
 *
 * Example:
 * ```javascript
 * const token = await createSession({
 *   username: 'cameron',
 *   role: 'admin',
 *   client_id: 'brasshelm',
 *   can_edit_leads: true,
 *   can_change_status: true
 * });
 * // Returns: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 */
export async function createSession(user) {
  const token = await new SignJWT({
    username: user.username,
    role: user.role,
    client_id: user.client_id,
    can_edit_leads: user.can_edit_leads,
    can_change_status: user.can_change_status
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
 *
 * @param {string} token - JWT token from cookie
 * @returns {Promise<Object|null>} User payload or null if invalid
 *
 * Example:
 * ```javascript
 * const payload = await verifySession('eyJhbGc...');
 * if (payload) {
 *   console.log('Valid token for:', payload.username);
 * } else {
 *   console.log('Invalid or expired token');
 * }
 * ```
 */
export async function verifySession(token) {
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
 *
 * Force Logout Feature:
 * - If admin changes user permissions, set permissions_updated_at = NOW()
 * - If JWT issued before permissions_updated_at, reject token
 * - Forces user to logout and login again with new permissions
 *
 * @param {Request} req - Fetch API Request object
 * @returns {Promise<Object|null>} User payload or null if not authenticated
 *
 * Example:
 * ```javascript
 * const user = await isAuthenticated(req);
 * if (!user) {
 *   return new Response('Unauthorized', { status: 401 });
 * }
 * console.log('Authenticated as:', user.username, user.role);
 * ```
 */
export async function isAuthenticated(req) {
  // Extract cookies from request headers
  const cookies = req.headers.get('cookie') || '';

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
   *
   * This query checks if permissions were changed after JWT was issued.
   * If yes, reject token (user must logout and login again).
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
    const jwtIssuedAt = new Date(payload.iat * 1000);  // Convert Unix timestamp
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
 * Why PBKDF2:
 * - bcrypt not available in Edge Runtime
 * - PBKDF2 is OWASP-approved for password hashing
 * - 100,000 iterations makes brute force expensive
 *
 * Storage Format: "salt:hash" (colon-separated hex strings)
 *
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Formatted hash "salt:hash"
 *
 * Example:
 * ```javascript
 * const hash = await hashPassword('mypassword123');
 * // Returns: "a1b2c3d4e5f6:9876543210abcdef..."
 * // Store this in database
 * ```
 */
export async function hashPassword(password) {
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
 *
 * @param {string} password - Plain text password from login
 * @param {string} storedHash - Hash from database "salt:hash"
 * @returns {Promise<boolean>} True if password matches
 *
 * Example:
 * ```javascript
 * const user = await getUserByUsername('cameron');
 * const isValid = await verifyPassword('userpassword', user.password_hash);
 * if (isValid) {
 *   console.log('Password correct');
 * }
 * ```
 */
export async function verifyPassword(password, storedHash) {
  const encoder = new TextEncoder();

  // Split stored hash into salt and hash components
  const [saltHex, hashHex] = storedHash.split(':');

  if (!saltHex || !hashHex) return false;

  // Convert hex salt back to Uint8Array
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
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
 *
 * @param {Object} user - User payload from JWT
 * @returns {boolean} True if admin or superuser
 *
 * Example:
 * ```javascript
 * if (!isAdmin(user)) {
 *   return new Response('Forbidden - admin only', { status: 403 });
 * }
 * ```
 */
export function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'superuser');
}

/**
 * IS STAFF OR ADMIN - Check Staff/Admin/Superuser Role
 *
 * Returns true if user is staff, admin, OR superuser.
 *
 * @param {Object} user - User payload from JWT
 * @returns {boolean} True if staff, admin, or superuser
 *
 * Example:
 * ```javascript
 * if (!isStaffOrAdmin(user)) {
 *   return new Response('Forbidden - staff or admin only', { status: 403 });
 * }
 * ```
 */
export function isStaffOrAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'superuser' || user.role === 'staff');
}

/**
 * CAN MANAGE USERS - Check User Management Permissions
 *
 * Returns true if user can create/edit/delete other users.
 * Currently same as isStaffOrAdmin(), but separate function
 * for future granular permissions.
 *
 * @param {Object} user - User payload from JWT
 * @returns {boolean} True if can manage users
 *
 * Example:
 * ```javascript
 * if (!canManageUsers(user)) {
 *   return new Response('Forbidden - cannot manage users', { status: 403 });
 * }
 * ```
 */
export function canManageUsers(user) {
  return user && (user.role === 'admin' || user.role === 'superuser' || user.role === 'staff');
}

/**
 * IS SUPERUSER - Check Exclusive Superuser Role
 *
 * Returns true ONLY if user is superuser (not admin or staff).
 * Use this for superuser-only features (system monitoring, etc).
 *
 * @param {Object} user - User payload from JWT
 * @returns {boolean} True if exclusively superuser
 *
 * Example:
 * ```javascript
 * if (!isSuperuser(user)) {
 *   return new Response('Forbidden - superuser only', { status: 403 });
 * }
 * ```
 */
export function isSuperuser(user) {
  return user && user.role === 'superuser';
}

/**
 * GET USER BY USERNAME - Fetch User from Database
 *
 * Fetches complete user record from database by username.
 * Returns null if user not found.
 *
 * @param {string} username - Username to lookup
 * @returns {Promise<Object|null>} User object or null
 *
 * Example:
 * ```javascript
 * const user = await getUserByUsername('cameron');
 * if (user) {
 *   console.log('Found user:', user.username, user.role);
 * }
 * ```
 */
export async function getUserByUsername(username) {
  const sql = getDB();
  const result = await sql`
    SELECT * FROM admin_users
    WHERE username = ${username}
  `;
  return result[0] || null;
}
