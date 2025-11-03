/**
 * me.js - BrassHelm Security Package Template
 *
 * PURPOSE:
 * Checks if the current request has a valid session cookie.
 * Returns user data if authenticated, or {authenticated: false} if not.
 * Used by frontend pages to check authentication status on page load.
 *
 * INCLUDES CORS:
 * - Allows cross-subdomain API calls (tracker.brasshelm.com → admin.brasshelm.com)
 * - Required when one subdomain's frontend needs to call another subdomain's API
 * - If you only call same-subdomain APIs, CORS not needed (remove corsHeaders)
 *
 * REQUIRED ENV VARS:
 * - SESSION_SECRET: For JWT verification (must match dashboard)
 * - DATABASE_URL: For permissions checking (must be pooled connection)
 *
 * USAGE:
 * 1. Copy this file to /api/auth/me.js in your project
 * 2. Ensure SESSION_SECRET and DATABASE_URL are set
 * 3. Deploy
 *
 * FRONTEND USAGE:
 * ```javascript
 * // Check auth on page load
 * const response = await fetch('/api/auth/me');
 * const data = await response.json();
 *
 * if (!data.authenticated) {
 *   window.location.href = '/login.html';
 * } else {
 *   console.log('Logged in as:', data.username, data.role);
 * }
 * ```
 *
 * DOCUMENTATION:
 * See /security/AUTH_ARCHITECTURE.md for complete implementation guide
 *
 * LAST UPDATED: November 1, 2025
 */

export const config = { runtime: 'edge' };

import { isAuthenticated } from './utils.js';

export default async function handler(req) {
  /**
   * CORS CONFIGURATION (Optional - only needed for cross-subdomain API calls)
   *
   * Scenario: tracker.brasshelm.com frontend calls admin.brasshelm.com/api/auth/me
   *
   * Without CORS:
   *   - Browser blocks request with "CORS policy error"
   *   - Even though cookie would be sent (Domain=.brasshelm.com)
   *
   * With CORS:
   *   - Browser allows request
   *   - Cookies sent if Access-Control-Allow-Credentials: true
   *
   * If you only call same-subdomain APIs:
   *   - Remove all corsHeaders code
   *   - Just return JSON without CORS headers
   */

  // Get origin from request (which subdomain is calling us)
  const origin = req.headers.get('origin');

  // List all allowed BrassHelm subdomains
  const allowedOrigins = [
    'https://admin.brasshelm.com',
    'https://kanban.brasshelm.com',
    'https://forms.brasshelm.com',
    'https://tracker.brasshelm.com',
    'https://monitor.brasshelm.com'
  ];

  // Allow origin if it's in our list or ends with .brasshelm.com
  const corsOrigin = (origin && (allowedOrigins.includes(origin) || origin.endsWith('.brasshelm.com')))
    ? origin
    : 'https://admin.brasshelm.com';

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',  // Required for cookies
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle OPTIONS preflight request (browser sends before actual GET)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  /**
   * AUTHENTICATION CHECK
   *
   * isAuthenticated() does 3 things:
   * 1. Extracts session cookie from request
   * 2. Verifies JWT signature (using SESSION_SECRET)
   * 3. Checks database for permissions_updated_at (force logout)
   *
   * Returns user payload if valid, null if not authenticated
   */
  const user = await isAuthenticated(req);

  // Not authenticated - return false
  if (!user) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }

  // Authenticated - return user data
  return new Response(
    JSON.stringify({
      authenticated: true,
      username: user.username,
      role: user.role,
      client_id: user.client_id,
      can_edit_leads: user.can_edit_leads,
      can_change_status: user.can_change_status
    }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
  );
}
