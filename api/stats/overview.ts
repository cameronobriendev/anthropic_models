/**
 * GET /api/stats/overview
 *
 * Returns overview statistics for the dashboard:
 * - Total API calls (all time + this week)
 * - Total cost (all time + this week)
 * - Active models count
 * - Average response time
 */

import { getDB } from '../db/client';
import { getCorsHeaders } from '../utils/cors';

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const sql = getDB();

    // Get total stats from anthropic_models table
    const totalStats = await sql`
      SELECT
        SUM(total_api_calls) as total_calls,
        SUM(total_cost_usd) as total_cost,
        COUNT(*) FILTER (WHERE is_current = true AND is_working = true) as active_models,
        COUNT(*) FILTER (WHERE is_working = false) as failing_models
      FROM anthropic_models
    `;

    // Get this week's stats from model_usage
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weekStats = await sql`
      SELECT
        SUM(api_calls) as week_calls,
        SUM(total_cost_usd) as week_cost,
        AVG(avg_response_time_ms) as avg_response_time,
        SUM(error_count) as week_errors
      FROM model_usage
      WHERE hour >= ${oneWeekAgo.toISOString()}
    `;

    // Get previous week's stats for comparison
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const prevWeekStats = await sql`
      SELECT
        SUM(api_calls) as prev_week_calls,
        SUM(total_cost_usd) as prev_week_cost
      FROM model_usage
      WHERE hour >= ${twoWeeksAgo.toISOString()}
        AND hour < ${oneWeekAgo.toISOString()}
    `;

    // Calculate percentage changes
    const currentWeekCalls = parseInt(weekStats[0]?.week_calls || '0');
    const prevWeekCalls = parseInt(prevWeekStats[0]?.prev_week_calls || '0');
    const callsChange = prevWeekCalls > 0
      ? ((currentWeekCalls - prevWeekCalls) / prevWeekCalls * 100).toFixed(1)
      : '0';

    const currentWeekCost = parseFloat(weekStats[0]?.week_cost || '0');
    const prevWeekCost = parseFloat(prevWeekStats[0]?.prev_week_cost || '0');
    const costChange = prevWeekCost > 0
      ? ((currentWeekCost - prevWeekCost) / prevWeekCost * 100).toFixed(1)
      : '0';

    const overview = {
      totalCalls: parseInt(totalStats[0]?.total_calls || '0'),
      totalCost: parseFloat(totalStats[0]?.total_cost || '0').toFixed(2),
      activeModels: parseInt(totalStats[0]?.active_models || '0'),
      failingModels: parseInt(totalStats[0]?.failing_models || '0'),
      weekCalls: currentWeekCalls,
      weekCost: currentWeekCost.toFixed(2),
      avgResponseTime: parseFloat(weekStats[0]?.avg_response_time || '0').toFixed(1),
      weekErrors: parseInt(weekStats[0]?.week_errors || '0'),
      callsChangePercent: callsChange,
      costChangePercent: costChange,
      callsChangePositive: parseFloat(callsChange) >= 0,
      costChangePositive: parseFloat(costChange) <= 0, // Lower cost is better
    };

    return new Response(JSON.stringify(overview), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Error in GET /api/stats/overview:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch overview stats',
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
