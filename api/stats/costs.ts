/**
 * GET /api/stats/costs
 *
 * Returns cost analysis and projections
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

    // Get today's cost
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCost = await sql`
      SELECT SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${today.toISOString()}
    `;

    // Get yesterday's cost for comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayCost = await sql`
      SELECT SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${yesterday.toISOString()}
        AND hour < ${today.toISOString()}
    `;

    // Get this week's cost
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekCost = await sql`
      SELECT SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${weekStart.toISOString()}
    `;

    // Get this month's cost
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthCost = await sql`
      SELECT SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${monthStart.toISOString()}
    `;

    // Get last month's cost for comparison
    const lastMonthStart = new Date(monthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const lastMonthCost = await sql`
      SELECT SUM(total_cost_usd) as cost
      FROM model_usage
      WHERE hour >= ${lastMonthStart.toISOString()}
        AND hour < ${monthStart.toISOString()}
    `;

    // Calculate daily average for projection
    const daysInMonth = new Date().getDate();
    const currentMonthCost = parseFloat(monthCost[0]?.cost || '0');
    const dailyAverage = daysInMonth > 0 ? currentMonthCost / daysInMonth : 0;
    const daysRemainingInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate() - daysInMonth;
    const projectedMonthly = currentMonthCost + (dailyAverage * daysRemainingInMonth);

    // Get cost breakdown by project
    const projectCosts = await sql`
      SELECT
        project_name,
        SUM(total_cost_usd) as cost,
        SUM(api_calls) as calls
      FROM model_usage
      WHERE hour >= ${monthStart.toISOString()}
      GROUP BY project_name
      ORDER BY cost DESC
    `;

    // Get cost breakdown by model
    const modelCosts = await sql`
      SELECT
        model_id,
        SUM(total_cost_usd) as cost,
        SUM(api_calls) as calls
      FROM model_usage
      WHERE hour >= ${monthStart.toISOString()}
      GROUP BY model_id
      ORDER BY cost DESC
    `;

    // Calculate changes
    const todayCostValue = parseFloat(todayCost[0]?.cost || '0');
    const yesterdayCostValue = parseFloat(yesterdayCost[0]?.cost || '0');
    const todayChange = yesterdayCostValue > 0
      ? ((todayCostValue - yesterdayCostValue) / yesterdayCostValue * 100).toFixed(1)
      : '0';

    const currentMonthCostValue = parseFloat(monthCost[0]?.cost || '0');
    const lastMonthCostValue = parseFloat(lastMonthCost[0]?.cost || '0');
    const monthChange = lastMonthCostValue > 0
      ? ((currentMonthCostValue - lastMonthCostValue) / lastMonthCostValue * 100).toFixed(1)
      : '0';

    const response = {
      today: {
        cost: todayCostValue.toFixed(2),
        change: todayChange,
        positive: parseFloat(todayChange) <= 0
      },
      week: {
        cost: parseFloat(weekCost[0]?.cost || '0').toFixed(2)
      },
      month: {
        cost: currentMonthCostValue.toFixed(2),
        change: monthChange,
        positive: parseFloat(monthChange) <= 0
      },
      projected: {
        monthly: projectedMonthly.toFixed(2),
        dailyAverage: dailyAverage.toFixed(2),
        daysRemaining: daysRemainingInMonth
      },
      byProject: projectCosts.map((row: any) => ({
        project: row.project_name,
        cost: parseFloat(row.cost || '0').toFixed(2),
        calls: parseInt(row.calls || '0')
      })),
      byModel: modelCosts.map((row: any) => ({
        model: row.model_id,
        cost: parseFloat(row.cost || '0').toFixed(2),
        calls: parseInt(row.calls || '0')
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
    console.error('Error in GET /api/stats/costs:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch cost stats',
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
