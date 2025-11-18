/**
 * Manual Trigger for Model Sync
 *
 * Admin-only endpoint to manually trigger the sync cron for testing.
 * Don't wait for midnight - test the sync logic immediately.
 *
 * Usage:
 *   curl -X POST https://anthropic.cameronobrien.dev/api/admin/trigger-sync \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 *
 * Authentication: Requires CRON_SECRET in Authorization header
 */

export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

export default async function handler(req: Request) {
  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed - use POST' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid CRON_SECRET' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Manual sync triggered by admin');

    // Call the cron endpoint with Vercel cron header
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/cron/sync-models`, {
      method: 'POST',
      headers: {
        'x-vercel-cron': '1', // Simulate Vercel cron
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    return new Response(JSON.stringify({
      message: 'Sync triggered successfully',
      result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Failed to trigger sync:', error);

    return new Response(JSON.stringify({
      error: 'Failed to trigger sync',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
