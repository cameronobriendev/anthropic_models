/**
 * CORS Utility - BIBLE Compliant
 * Dynamic CORS headers for *.brasshelm.com subdomains
 *
 * BIBLE COMPLIANCE: Matches pattern from me.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * List all allowed BrassHelm subdomains (BIBLE pattern)
 */
const ALLOWED_ORIGINS = [
  'https://admin.brasshelm.com',
  'https://ai.brasshelm.com',
  'https://kanban.brasshelm.com',
  'https://forms.brasshelm.com',
  'https://tracker.brasshelm.com',
  'https://monitor.brasshelm.com'
];

/**
 * Check if origin is allowed (explicit list + *.brasshelm.com pattern)
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  // Check explicit list first (BIBLE pattern)
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
 * Set CORS headers dynamically based on request origin (BIBLE pattern)
 */
export function setCorsHeaders(
  req: VercelRequest,
  res: VercelResponse
): void {
  const origin = req.headers.origin;

  // Allow origin if it's in our list or matches *.brasshelm.com
  const corsOrigin = (origin && isAllowedOrigin(origin))
    ? origin
    : 'https://ai.brasshelm.com';  // Default fallback

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCorsPreflight(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}
