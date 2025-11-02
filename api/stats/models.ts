/**
 * GET /api/stats/models
 *
 * Returns all models with their usage statistics
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
    const sql = getDB();

    // Get all models with their stats
    const models = await sql`
      SELECT
        model_id,
        model_type,
        model_alias,
        is_current,
        is_working,
        is_deprecated,
        cost_per_million_input_tokens,
        cost_per_million_output_tokens,
        total_api_calls,
        total_input_tokens,
        total_output_tokens,
        total_cost_usd,
        error_count,
        last_error,
        last_error_at,
        last_used,
        last_verified,
        created_at
      FROM anthropic_models
      ORDER BY
        is_current DESC,
        is_working DESC,
        total_api_calls DESC
    `;

    // Format the response
    const formattedModels = models.map((model: any) => ({
      modelId: model.model_id,
      modelType: model.model_type,
      modelAlias: model.model_alias,
      isCurrent: model.is_current,
      isWorking: model.is_working,
      isDeprecated: model.is_deprecated,
      pricing: {
        inputPerMillion: parseFloat(model.cost_per_million_input_tokens || '0'),
        outputPerMillion: parseFloat(model.cost_per_million_output_tokens || '0')
      },
      usage: {
        totalCalls: parseInt(model.total_api_calls || '0'),
        totalInputTokens: parseInt(model.total_input_tokens || '0'),
        totalOutputTokens: parseInt(model.total_output_tokens || '0'),
        totalCost: parseFloat(model.total_cost_usd || '0').toFixed(2)
      },
      errors: {
        count: parseInt(model.error_count || '0'),
        lastError: model.last_error,
        lastErrorAt: model.last_error_at
      },
      timestamps: {
        lastUsed: model.last_used,
        lastVerified: model.last_verified,
        createdAt: model.created_at
      }
    }));

    return new Response(JSON.stringify({ models: formattedModels }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Error in GET /api/stats/models:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch models',
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
