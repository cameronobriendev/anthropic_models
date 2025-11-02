/**
 * POST /api/usage/track
 *
 * Tracks Anthropic API usage from projects for analytics and cost tracking.
 * Called after each Anthropic API request.
 *
 * Request Body:
 * {
 *   projectName: string,
 *   endpoint: string,
 *   modelId: string,
 *   inputTokens: number,
 *   outputTokens: number,
 *   responseTimeMs: number,
 *   success: boolean,
 *   error?: string,
 *   testId?: number,      // If from A/B test
 *   testVariant?: string  // 'model_a' or 'model_b'
 * }
 */

import { getDB } from '../db/client';
import { handleCors } from '../utils/cors';

export default async function handler(req: Request) {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.MODELS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid API key' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: any = await req.json();
    const {
      projectName,
      endpoint,
      modelId,
      inputTokens,
      outputTokens,
      responseTimeMs,
      success,
      error,
      testId,
      testVariant
    }: {
      projectName: string;
      endpoint?: string;
      modelId: string;
      inputTokens: number;
      outputTokens: number;
      responseTimeMs?: number;
      success: boolean;
      error?: string;
      testId?: number;
      testVariant?: string;
    } = body;

    // Validate required fields
    if (!projectName || !modelId || inputTokens === undefined || outputTokens === undefined) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['projectName', 'modelId', 'inputTokens', 'outputTokens']
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sql = getDB();

    // Get model pricing for cost calculation
    const modelInfo = await sql`
      SELECT
        cost_per_million_input_tokens,
        cost_per_million_output_tokens
      FROM anthropic_models
      WHERE model_id = ${modelId}
      LIMIT 1
    `;

    if (modelInfo.length === 0) {
      console.warn(`⚠️ Unknown model: ${modelId} - cannot track cost`);
      return new Response(
        JSON.stringify({
          ok: true,
          warning: 'Model not found in database - usage tracked without cost'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = modelInfo[0];

    // Calculate cost
    const inputCost = (inputTokens / 1_000_000) * parseFloat(model.cost_per_million_input_tokens);
    const outputCost = (outputTokens / 1_000_000) * parseFloat(model.cost_per_million_output_tokens);
    const totalCost = inputCost + outputCost;

    // Get current hour bucket (truncate to hour)
    const hourBucket = new Date();
    hourBucket.setMinutes(0, 0, 0);

    // Upsert into model_usage (hourly aggregation)
    await sql`
      INSERT INTO model_usage (
        model_id,
        project_name,
        endpoint,
        api_calls,
        input_tokens,
        output_tokens,
        total_cost_usd,
        avg_response_time_ms,
        min_response_time_ms,
        max_response_time_ms,
        error_count,
        last_error,
        hour,
        created_at,
        updated_at
      ) VALUES (
        ${modelId},
        ${projectName},
        ${endpoint || null},
        1,
        ${inputTokens},
        ${outputTokens},
        ${totalCost.toFixed(4)},
        ${responseTimeMs || null},
        ${responseTimeMs || null},
        ${responseTimeMs || null},
        ${success ? 0 : 1},
        ${error || null},
        ${hourBucket.toISOString()},
        NOW(),
        NOW()
      )
      ON CONFLICT (project_name, model_id, hour)
      DO UPDATE SET
        api_calls = model_usage.api_calls + 1,
        input_tokens = model_usage.input_tokens + ${inputTokens},
        output_tokens = model_usage.output_tokens + ${outputTokens},
        total_cost_usd = model_usage.total_cost_usd + ${totalCost.toFixed(4)},
        avg_response_time_ms = CASE
          WHEN ${responseTimeMs} IS NOT NULL THEN
            ((model_usage.avg_response_time_ms * model_usage.api_calls) + ${responseTimeMs}) / (model_usage.api_calls + 1)
          ELSE model_usage.avg_response_time_ms
        END,
        min_response_time_ms = CASE
          WHEN ${responseTimeMs} IS NOT NULL THEN
            LEAST(COALESCE(model_usage.min_response_time_ms, ${responseTimeMs}), ${responseTimeMs})
          ELSE model_usage.min_response_time_ms
        END,
        max_response_time_ms = CASE
          WHEN ${responseTimeMs} IS NOT NULL THEN
            GREATEST(COALESCE(model_usage.max_response_time_ms, ${responseTimeMs}), ${responseTimeMs})
          ELSE model_usage.max_response_time_ms
        END,
        error_count = model_usage.error_count + ${success ? 0 : 1},
        last_error = CASE
          WHEN ${error} IS NOT NULL THEN ${error}
          ELSE model_usage.last_error
        END,
        updated_at = NOW()
    `;

    // Update totals in anthropic_models table
    if (success) {
      await sql`
        UPDATE anthropic_models
        SET
          total_api_calls = total_api_calls + 1,
          total_input_tokens = total_input_tokens + ${inputTokens},
          total_output_tokens = total_output_tokens + ${outputTokens},
          total_cost_usd = total_cost_usd + ${totalCost.toFixed(4)},
          last_used = NOW(),
          error_count = 0,
          is_working = true,
          updated_at = NOW()
        WHERE model_id = ${modelId}
      `;
    } else {
      // Increment error count
      await sql`
        UPDATE anthropic_models
        SET
          error_count = error_count + 1,
          last_error = ${error || 'Unknown error'},
          last_error_at = NOW(),
          is_working = CASE
            WHEN error_count + 1 > 10 THEN false
            ELSE is_working
          END,
          updated_at = NOW()
        WHERE model_id = ${modelId}
      `;

      // Check if model should be marked as not working
      const updated = await sql`
        SELECT error_count, is_working
        FROM anthropic_models
        WHERE model_id = ${modelId}
      `;

      if (updated.length > 0 && !updated[0].is_working) {
        console.error(`🔴 Model ${modelId} marked as NOT WORKING after ${updated[0].error_count} consecutive errors`);
        // TODO: Send Slack alert here
      }
    }

    // If this was from an A/B test, update test statistics
    if (testId && testVariant) {
      const variantColumn = testVariant === 'model_a' ? 'model_a_calls' : 'model_b_calls';
      const costColumn = testVariant === 'model_a' ? 'model_a_cost_usd' : 'model_b_cost_usd';
      const responseColumn = testVariant === 'model_a' ? 'model_a_avg_response_ms' : 'model_b_avg_response_ms';

      await sql`
        UPDATE ab_tests
        SET
          ${sql(variantColumn)} = ${sql(variantColumn)} + 1,
          ${sql(costColumn)} = ${sql(costColumn)} + ${totalCost.toFixed(4)},
          ${sql(responseColumn)} = CASE
            WHEN ${responseTimeMs} IS NOT NULL THEN
              ((COALESCE(${sql(responseColumn)}, 0) * ${sql(variantColumn)}) + ${responseTimeMs}) / (${sql(variantColumn)} + 1)
            ELSE ${sql(responseColumn)}
          END,
          updated_at = NOW()
        WHERE id = ${testId}
      `;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tracked: {
          project: projectName,
          model: modelId,
          cost: `$${totalCost.toFixed(4)}`,
          tokens: inputTokens + outputTokens
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in POST /api/usage/track:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to track usage',
        details: error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
