// Anthropic Models Manager - Demo API
// Bot-protected endpoint to fetch current Claude model
// Uses same User-Agent validation as main_site/api/show-phone.js

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // Simple User-Agent validation (same as main_site show-phone button)
  const ua = req.headers.get('user-agent') || '';
  if (!/(Chrome|Safari|Firefox|Edg|OPR|Mobile|Android|iPhone)/i.test(ua)) {
    return new Response(JSON.stringify({ error: 'suspicious_user_agent' }), {
      status: 403,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    });
  }

  // Return current Claude model
  // In production, this would query Neon database for actual current model
  // For demo, hardcode the model that's actually being used
  const currentModel = 'claude-sonnet-4-5-20250929';
  const timestamp = new Date().toISOString();

  return new Response(JSON.stringify({
    model: currentModel,
    timestamp: timestamp,
    description: 'Current production Claude model across all BrassHelm apps'
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store'
    }
  });
}
