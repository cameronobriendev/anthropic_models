/**
 * client.ts - BrassHelm Security Package Template (BIBLE)
 *
 * Converted from /Users/camobrien/Documents/GitHub/security/auth-templates/client.js
 *
 * PURPOSE:
 * Database connection helper for Neon PostgreSQL.
 * Creates reusable database client for all SQL queries.
 *
 * CRITICAL CONFIGURATION:
 * - MUST use POOLED connection string (ends with -pooler)
 * - Non-pooled connections = "Too many connections" errors under load
 *
 * BIBLE COMPLIANCE: EXACT COPY
 */

import { neon } from '@neondatabase/serverless';

/**
 * GET DATABASE CONNECTION
 *
 * Creates a reusable Neon database client.
 * Uses DATABASE_URL or POSTGRES_URL from environment variables.
 *
 * @returns SQL tagged template function
 */
export function getDB() {
  /**
   * ENVIRONMENT VARIABLE FALLBACK
   *
   * Dashboard uses: POSTGRES_URL
   * New services use: DATABASE_URL
   *
   * This fallback supports both naming conventions.
   */
  const rawConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!rawConnectionString) {
    throw new Error(
      'Database connection string not found. ' +
      'Add DATABASE_URL or POSTGRES_URL to Vercel environment variables.'
    );
  }

  /**
   * REMOVE WHITESPACE (Defensive)
   *
   * Environment variables sometimes have accidental whitespace/newlines
   * (especially when copy-pasted from Neon dashboard with line breaks).
   * Remove ALL whitespace to prevent URL parsing errors.
   *
   * PostgreSQL connection strings should not contain spaces in:
   * - usernames, passwords, hostnames, database names, or parameters
   *
   * Example broken string: "postgresql://user@host-   name/db"
   * Fixed string:           "postgresql://user@host-name/db"
   */
  const connectionString = rawConnectionString.replace(/\s+/g, '');

  /**
   * VERIFY POOLED CONNECTION (Development Safety Check)
   *
   * This warning helps catch configuration errors during development.
   * Pooled connections are critical for edge functions under load.
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
