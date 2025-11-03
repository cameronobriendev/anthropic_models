/**
 * client.js - BrassHelm Security Package Template
 *
 * PURPOSE:
 * Database connection helper for Neon PostgreSQL.
 * Creates reusable database client for all SQL queries.
 *
 * CRITICAL CONFIGURATION:
 * - MUST use POOLED connection string (ends with -pooler)
 * - Non-pooled connections = "Too many connections" errors under load
 *
 * REQUIRED ENV VARS:
 * - DATABASE_URL or POSTGRES_URL: Neon pooled connection string
 *
 * POOLED CONNECTION STRING FORMAT:
 * postgresql://user:pass@ep-xxx-pooler.c-2.us-east-1.aws.neon.tech/neondb
 *                                  ^^^^^^^ Must have -pooler
 *
 * WHY POOLED CONNECTIONS:
 * - Edge functions create many concurrent connections
 * - Each request = new connection
 * - PostgreSQL has connection limits (default 100)
 * - Pooling reuses connections across requests
 * - Without pooling = "Error: too many connections"
 *
 * USAGE:
 * 1. Copy this file to /api/db/client.js in your project
 * 2. Add DATABASE_URL env var with POOLED connection string
 * 3. Use in your code:
 *    ```javascript
 *    import { getDB } from '../db/client.js';
 *    const sql = getDB();
 *    const results = await sql`SELECT * FROM users`;
 *    ```
 * 4. Deploy
 *
 * IMPORTANT:
 * - This uses @neondatabase/serverless (NOT pg or node-postgres)
 * - Compatible with Vercel Edge Runtime
 * - Uses tagged template literals for parameterized queries
 * - Automatically prevents SQL injection
 *
 * DOCUMENTATION:
 * See /security/AUTH_ARCHITECTURE.md for complete implementation guide
 *
 * LAST UPDATED: November 1, 2025
 */

import { neon } from '@neondatabase/serverless';

/**
 * GET DATABASE CONNECTION
 *
 * Creates a reusable Neon database client.
 * Uses DATABASE_URL or POSTGRES_URL from environment variables.
 *
 * @returns {Function} SQL tagged template function
 *
 * Example:
 * ```javascript
 * import { getDB } from './db/client.js';
 *
 * const sql = getDB();
 *
 * // Parameterized query (safe - prevents SQL injection)
 * const users = await sql`
 *   SELECT * FROM admin_users
 *   WHERE username = ${username}
 * `;
 *
 * // Multiple parameters
 * const result = await sql`
 *   INSERT INTO leads (first_name, last_name, phone)
 *   VALUES (${firstName}, ${lastName}, ${phone})
 *   RETURNING *
 * `;
 * ```
 *
 * SECURITY:
 * Always use tagged templates (sql`...`), never string concatenation:
 *
 * ✅ CORRECT - Parameterized (safe):
 * const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
 *
 * ❌ WRONG - String concatenation (SQL injection vulnerability):
 * const query = `SELECT * FROM users WHERE id = ${userId}`;
 * const users = await sql(query);
 */
export function getDB() {
  /**
   * ENVIRONMENT VARIABLE FALLBACK
   *
   * Dashboard uses: POSTGRES_URL
   * New services use: DATABASE_URL
   *
   * This fallback supports both naming conventions.
   * Choose one for consistency in your project.
   */
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string not found. ' +
      'Add DATABASE_URL or POSTGRES_URL to Vercel environment variables.'
    );
  }

  /**
   * VERIFY POOLED CONNECTION (Development Safety Check)
   *
   * This warning helps catch configuration errors during development.
   * Pooled connections are critical for edge functions under load.
   *
   * Comment out if this warning is too noisy.
   */
  if (process.env.NODE_ENV !== 'production' && !connectionString.includes('-pooler')) {
    console.warn(
      '⚠️  WARNING: Database URL does not contain "-pooler".\n' +
      '   Non-pooled connections may cause "too many connections" errors.\n' +
      '   Get pooled connection string from Neon dashboard.'
    );
  }

  // Create and return Neon SQL client
  const sql = neon(connectionString);
  return sql;
}
