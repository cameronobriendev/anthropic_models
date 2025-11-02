/**
 * GET /api/model/:type
 *
 * Returns the current best Anthropic model for specified type.
 * Supports A/B testing, manual overrides, and automatic fallback.
 *
 * Query Parameters:
 * - type (required): 'sonnet', 'haiku', 'opus'
 * - project (optional): Project name for A/B testing
 * - user_role (optional): User role for targeted experiments
 *
 * Headers:
 * - x-api-key (required): API key for authentication
 */

import { getDB } from '../db/client';
import { handleCors } from '../utils/cors';

export default async function handler(req: Request) {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Only allow GET
    if (req.method !== 'GET') {
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

    // Extract parameters from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const type = pathParts[pathParts.length - 1]; // Last part of path
    const project = url.searchParams.get('project');
    const userRole = url.searchParams.get('user_role');

    // Validate type
    if (!['sonnet', 'haiku', 'opus'].includes(type)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid model type',
          valid_types: ['sonnet', 'haiku', 'opus']
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sql = getDB();

    // PRIORITY 1: Check for project-specific override
    if (project) {
      const projectOverride = await sql`
        SELECT override_model_id
        FROM model_overrides
        WHERE project_name = ${project}
        AND model_type = ${type}
        AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (projectOverride.length > 0) {
        return new Response(
          JSON.stringify({
            model_id: projectOverride[0].override_model_id,
            model_type: type,
            source: 'project_override',
            project,
            is_ab_test: false
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // PRIORITY 2: Check for global override
    const globalOverride = await sql`
      SELECT override_model_id
      FROM model_overrides
      WHERE project_name IS NULL
      AND model_type = ${type}
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (globalOverride.length > 0) {
      return new Response(
        JSON.stringify({
          model_id: globalOverride[0].override_model_id,
          model_type: type,
          source: 'global_override',
          is_ab_test: false
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 3: Check for active A/B test
    if (project) {
      const activeTest = await sql`
        SELECT id, test_name, model_a, model_b, traffic_split_percent
        FROM ab_tests
        WHERE status = 'running'
        AND (project_names IS NULL OR ${project} = ANY(project_names))
        AND (user_roles IS NULL OR ${userRole || 'guest'} = ANY(user_roles))
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (activeTest.length > 0) {
        const test = activeTest[0];

        // Determine model variant based on traffic split
        const random = Math.random() * 100;
        const useModelA = random < test.traffic_split_percent;
        const selectedModel = useModelA ? test.model_a : test.model_b;
        const variant = useModelA ? 'model_a' : 'model_b';

        return new Response(
          JSON.stringify({
            model_id: selectedModel,
            model_type: type,
            source: 'ab_test',
            is_ab_test: true,
            test_id: test.id,
            test_name: test.test_name,
            test_variant: variant
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // PRIORITY 4: Get current model (is_current = true)
    const currentModel = await sql`
      SELECT model_id, last_verified
      FROM anthropic_models
      WHERE model_type = ${type}
      AND is_current = true
      AND is_deprecated = false
      ORDER BY last_verified DESC NULLS LAST
      LIMIT 1
    `;

    if (currentModel.length > 0) {
      // Also get fallback for response
      const fallback = await sql`
        SELECT model_id
        FROM anthropic_models
        WHERE model_type = ${type}
        AND is_working = true
        AND is_deprecated = false
        ORDER BY last_verified DESC NULLS LAST
        LIMIT 1
      `;

      return new Response(
        JSON.stringify({
          model_id: currentModel[0].model_id,
          model_type: type,
          source: 'current',
          is_ab_test: false,
          fallback_model: fallback.length > 0 ? fallback[0].model_id : null,
          last_verified: currentModel[0].last_verified
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 5: Fallback to working model
    const workingModel = await sql`
      SELECT model_id, last_verified
      FROM anthropic_models
      WHERE model_type = ${type}
      AND is_working = true
      AND is_deprecated = false
      ORDER BY last_verified DESC NULLS LAST
      LIMIT 1
    `;

    if (workingModel.length > 0) {
      return new Response(
        JSON.stringify({
          model_id: workingModel[0].model_id,
          model_type: type,
          source: 'fallback',
          is_ab_test: false,
          warning: 'Using fallback model - current model unavailable',
          last_verified: workingModel[0].last_verified
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // PRIORITY 6: Emergency hard-coded fallback
    const emergencyFallback = {
      sonnet: 'claude-sonnet-4-5',
      haiku: 'claude-haiku-4-5',
      opus: 'claude-opus-4-1'
    };

    console.error(`⚠️ NO MODEL FOUND IN DATABASE - Using emergency fallback for ${type}`);

    return new Response(
      JSON.stringify({
        model_id: emergencyFallback[type as keyof typeof emergencyFallback],
        model_type: type,
        source: 'emergency',
        is_ab_test: false,
        warning: 'Emergency fallback - no models found in database'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in GET /api/model/:type:', error);

    // Emergency fallback on error
    const emergencyFallback = {
      sonnet: 'claude-sonnet-4-5',
      haiku: 'claude-haiku-4-5',
      opus: 'claude-opus-4-1'
    };

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const type = pathParts[pathParts.length - 1];

    return new Response(
      JSON.stringify({
        model_id: emergencyFallback[type as keyof typeof emergencyFallback] || 'claude-sonnet-4-5',
        model_type: type,
        source: 'emergency',
        is_ab_test: false,
        error: error.message,
        warning: 'Emergency fallback due to error'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
