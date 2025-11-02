/**
 * GET /api/health
 *
 * Health check endpoint to verify API is running and database is accessible.
 */

import { getDB } from './db/client';

export default async function handler(req: Request) {
  try {
    const sql = getDB();

    // Test database connection
    const result = await sql`SELECT COUNT(*) as count FROM anthropic_models`;

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'healthy',
        database: 'connected',
        models_count: parseInt(result[0].count),
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
