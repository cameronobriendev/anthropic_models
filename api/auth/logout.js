/**
 * logout.js - BrassHelm Security Package Template
 *
 * PURPOSE:
 * Destroys the user's session by clearing the session cookie.
 * Works across all *.brasshelm.com subdomains simultaneously.
 *
 * CRITICAL CONFIGURATION:
 * - Cookie Domain: .brasshelm.com (MUST match login.js)
 * - Max-Age=0: Tells browser to delete cookie immediately
 * - SameSite=Lax: MUST match login.js for consistency
 *
 * USAGE:
 * 1. Copy this file to /api/auth/logout.js in your project
 * 2. No environment variables needed (stateless operation)
 * 3. Deploy
 *
 * FRONTEND USAGE:
 * ```javascript
 * async function logout() {
 *   await fetch('/api/auth/logout', { method: 'POST' });
 *   window.location.href = '/login.html';
 * }
 * ```
 *
 * DOCUMENTATION:
 * See /security/AUTH_ARCHITECTURE.md for complete implementation guide
 *
 * LAST UPDATED: November 1, 2025
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Only accept POST requests (prevents accidental logout via GET)
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  /**
   * CRITICAL: Cookie Configuration
   *
   * Domain=.brasshelm.com
   *   - MUST match the Domain from login.js
   *   - Without matching domain, cookie won't be deleted properly
   *   - Clears cookie across all *.brasshelm.com subdomains
   *
   * Max-Age=0
   *   - Tells browser to delete cookie immediately
   *   - Alternative: use Expires=Thu, 01 Jan 1970 00:00:00 GMT
   *
   * SameSite=Lax
   *   - MUST match login.js for consistency
   *   - Some browsers require matching SameSite for deletion
   *
   * Secure (production only)
   *   - MUST match login.js for proper cookie deletion
   *   - Without matching Secure flag, browser may not delete cookie
   *
   * Why we don't use session=; only:
   *   - Browser needs explicit Max-Age=0 to delete
   *   - Domain must match for deletion to work across subdomains
   *   - All attributes (including Secure) must match login.js
   */
  const cookie = `session=; Domain=.brasshelm.com; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
    process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
  }`;

  return new Response(
    JSON.stringify({ ok: true, message: 'Logged out' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie
      }
    }
  );
}
