/**
 * GET /api/stats/usage
 *
 * Returns usage statistics by project and model
 * Query params:
 * - period: 24h, 7d, 30d, all (default: 7d)
 */

import { getDB } from '../db/client';
import { getCorsHeaders } from '../utils/cors';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || '7d';

    const sql = getDB();

    // Calculate date threshold based on period
    let dateThreshold = new Date();
    switch (period) {
      case '24h':
        dateThreshold.setHours(dateThreshold.getHours() - 24);
        break;
      case '7d':
        dateThreshold.setDate(dateThreshold.getDate() - 7);
        break;
      case '30d':
        dateThreshold.setDate(dateThreshold.getDate() - 30);
        break;
      case 'all':
        dateThreshold = new Date('2000-01-01'); // Far in the past
        break;
      default:
        dateThreshold.setDate(dateThreshold.getDate() - 7);
    }

    // Get usage by project
    const projectUsage = await sql`
      SELECT
        project_name,
        SUM(api_calls) as total_calls,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_cost_usd) as total_cost,
        AVG(avg_response_time_ms) as avg_response_time,
        SUM(error_count) as total_errors
      FROM model_usage
      WHERE hour >= ${dateThreshold.toISOString()}
      GROUP BY project_name
      ORDER BY total_calls DESC
    `;

    // Get usage by model
    const modelUsage = await sql`
      SELECT
        model_id,
        SUM(api_calls) as total_calls,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_cost_usd) as total_cost
      FROM model_usage
      WHERE hour >= ${dateThreshold.toISOString()}
      GROUP BY model_id
      ORDER BY total_calls DESC
    `;

    // Get usage by project AND model (detailed breakdown)
    const detailedUsage = await sql`
      SELECT
        project_name,
        model_id,
        SUM(api_calls) as calls,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${dateThreshold.toISOString()}
      GROUP BY project_name, model_id
      ORDER BY calls DESC
      LIMIT 50
    `;

    const response = {
      period,
      byProject: projectUsage.map((row: any) => ({
        project: row.project_name,
        calls: parseInt(row.total_calls || '0'),
        inputTokens: parseInt(row.total_input_tokens || '0'),
        outputTokens: parseInt(row.total_output_tokens || '0'),
        cost: parseFloat(row.total_cost || '0').toFixed(2),
        avgResponseTime: parseFloat(row.avg_response_time || '0').toFixed(1),
        errors: parseInt(row.total_errors || '0')
      })),
      byModel: modelUsage.map((row: any) => ({
        model: row.model_id,
        calls: parseInt(row.total_calls || '0'),
        inputTokens: parseInt(row.total_input_tokens || '0'),
        outputTokens: parseInt(row.total_output_tokens || '0'),
        cost: parseFloat(row.total_cost || '0').toFixed(2)
      })),
      detailed: detailedUsage.map((row: any) => ({
        project: row.project_name,
        model: row.model_id,
        calls: parseInt(row.calls || '0'),
        inputTokens: parseInt(row.input_tokens || '0'),
        outputTokens: parseInt(row.output_tokens || '0'),
        cost: parseFloat(row.cost || '0').toFixed(2)
      }))
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Error in GET /api/stats/usage:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch usage stats',
        details: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
}
