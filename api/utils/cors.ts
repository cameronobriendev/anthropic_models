/**
 * CORS Utility - Edge Functions Pattern
 * Dynamic CORS headers for *.brasshelm.com subdomains
 */

/**
 * List all allowed BrassHelm subdomains
 */
const ALLOWED_ORIGINS = [
  'https://admin.brasshelm.com',
  'https://ai.brasshelm.com',
  'https://kanban.brasshelm.com',
  'https://forms.brasshelm.com',
  'https://tracker.brasshelm.com',
  'https://monitor.brasshelm.com',
  'https://models.brasshelm.com'
];

/**
 * Check if origin is allowed (explicit list + *.brasshelm.com pattern)
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  // Check explicit list first
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Fallback: pattern matching for *.brasshelm.com
  if (origin.endsWith('.brasshelm.com')) {
    return true;
  }

  // Local development
  if (origin.match(/^http:\/\/localhost:\d+$/)) {
    return true;
  }

  return false;
}

/**
 * Get CORS headers for response
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');

  // Allow origin if it's in our list or matches *.brasshelm.com
  const corsOrigin = (origin && isAllowedOrigin(origin))
    ? origin
    : 'https://models.brasshelm.com';  // Default fallback

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
  };
}

/**
 * Handle CORS preflight (OPTIONS) request
 * Returns Response if it's a preflight, null otherwise
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req)
    });
  }
  return null;
}
