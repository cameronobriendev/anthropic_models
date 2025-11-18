/**
 * Vercel Cron: Daily Model Sync from Anthropic API
 *
 * Runs daily at midnight UTC (configured in vercel.json)
 * Automatically detects new Claude models, marks deprecated ones,
 * and keeps all production apps using the latest models - fully hands-off.
 *
 * Authentication: Vercel cron header + CRON_SECRET
 * Logs: All sync results stored in sync_logs table
 */

import { getDB } from '../db/client';

export const config = {
  runtime: 'edge',
  maxDuration: 60, // Allow up to 60 seconds for sync
};

// Hardcoded pricing map (updated manually when Anthropic changes prices)
const PRICING_MAP: Record<string, { input: number; output: number }> = {
  // Claude Haiku models
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-haiku-3-5': { input: 0.80, output: 4.00 },
  'claude-haiku-3': { input: 0.25, output: 1.25 },

  // Claude Sonnet models
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-sonnet-3-7': { input: 3.00, output: 15.00 },
  'claude-sonnet-3-5': { input: 3.00, output: 15.00 },

  // Claude Opus models
  'claude-opus-4-1': { input: 15.00, output: 75.00 },
  'claude-opus-4': { input: 15.00, output: 75.00 },
};

interface AnthropicModel {
  id: string;
  display_name: string;
  created_at: string;
  type: 'model';
}

interface SyncResult {
  success: boolean;
  modelsFound: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsDeprecated: number;
  changes: Array<{
    type: string;
    model_id: string;
    details?: any;
  }>;
  errorMessage?: string;
  durationMs: number;
}

export default async function handler(req: Request) {
  const startTime = Date.now();

  try {
    // ============================================
    // 1. AUTHENTICATION
    // ============================================

    // Verify Vercel cron header
    const cronHeader = req.headers.get('x-vercel-cron');
    if (cronHeader !== '1') {
      // Also check for CRON_SECRET as backup authentication
      const authHeader = req.headers.get('authorization');
      const expectedSecret = process.env.CRON_SECRET;

      if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - invalid cron authentication' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 2. FETCH MODELS FROM ANTHROPIC API
    // ============================================

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }

    console.log('🔄 Fetching models from Anthropic API...');

    // Fetch all models (handle pagination)
    const allModels: AnthropicModel[] = [];
    let hasMore = true;
    let afterId: string | undefined;

    while (hasMore) {
      // Build query params
      const params = new URLSearchParams({
        limit: '100',
      });
      if (afterId) {
        params.append('after_id', afterId);
      }

      // Direct HTTP call to Anthropic /v1/models
      const response = await fetch(`https://api.anthropic.com/v1/models?${params}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        data: AnthropicModel[];
        has_more: boolean;
        last_id: string;
      };

      allModels.push(...data.data);
      hasMore = data.has_more;
      afterId = data.last_id;
    }

    console.log(`✅ Fetched ${allModels.length} models from Anthropic`);

    // ============================================
    // 3. FETCH CURRENT DATABASE STATE
    // ============================================

    const sql = getDB();

    const dbModels = await sql`
      SELECT
        model_id,
        model_type,
        is_current,
        is_deprecated,
        created_at
      FROM anthropic_models
      ORDER BY model_id
    `;

    const dbModelIds = new Set(dbModels.map(m => m.model_id));
    const apiModelIds = new Set(allModels.map(m => m.id));

    // ============================================
    // 4. DETECT CHANGES
    // ============================================

    const changes: Array<{ type: string; model_id: string; details?: any }> = [];
    let modelsAdded = 0;
    let modelsUpdated = 0;
    let modelsDeprecated = 0;

    // Find new models (in API but not in DB)
    const newModels = allModels.filter(m => !dbModelIds.has(m.id));

    // Find deprecated models (in DB but not in API)
    const deprecatedModels = dbModels.filter(m => !apiModelIds.has(m.model_id) && !m.is_deprecated);

    // ============================================
    // 5. PARSE MODEL METADATA
    // ============================================

    function parseModelType(modelId: string): string | null {
      const lower = modelId.toLowerCase();
      if (lower.includes('haiku')) return 'haiku';
      if (lower.includes('sonnet')) return 'sonnet';
      if (lower.includes('opus')) return 'opus';
      return null;
    }

    function getPricing(modelId: string): { input: number; output: number } {
      // Try exact match first
      if (PRICING_MAP[modelId]) {
        return PRICING_MAP[modelId];
      }

      // Try fuzzy match (e.g., "claude-sonnet-4-20250514" → "claude-sonnet-4")
      for (const [key, value] of Object.entries(PRICING_MAP)) {
        if (modelId.startsWith(key)) {
          return value;
        }
      }

      // Default fallback (Sonnet pricing)
      return { input: 3.00, output: 15.00 };
    }

    // ============================================
    // 6. UPDATE DATABASE
    // ============================================

    // INSERT new models
    for (const model of newModels) {
      const modelType = parseModelType(model.id);
      if (!modelType) {
        console.warn(`⚠️ Could not parse type for model: ${model.id}`);
        continue;
      }

      const pricing = getPricing(model.id);

      await sql`
        INSERT INTO anthropic_models (
          model_id,
          model_type,
          display_name,
          is_current,
          is_working,
          cost_per_million_input_tokens,
          cost_per_million_output_tokens,
          first_seen,
          last_verified
        ) VALUES (
          ${model.id},
          ${modelType},
          ${model.display_name},
          false,
          true,
          ${pricing.input},
          ${pricing.output},
          ${model.created_at},
          NOW()
        )
      `;

      modelsAdded++;
      changes.push({
        type: 'model_added',
        model_id: model.id,
        details: { display_name: model.display_name, model_type: modelType }
      });

      console.log(`➕ Added new model: ${model.id} (${modelType})`);
    }

    // MARK deprecated models
    for (const model of deprecatedModels) {
      await sql`
        UPDATE anthropic_models
        SET
          is_deprecated = true,
          deprecation_date = NOW(),
          is_current = false
        WHERE model_id = ${model.model_id}
      `;

      modelsDeprecated++;
      changes.push({
        type: 'model_deprecated',
        model_id: model.model_id,
      });

      console.log(`🗑️ Deprecated model: ${model.model_id}`);
    }

    // UPDATE is_current flags (set newest model per type as current)
    // First, get the newest model per type from API
    const newestByType: Record<string, { id: string; created_at: string }> = {};

    for (const model of allModels) {
      const modelType = parseModelType(model.id);
      if (!modelType) continue;

      if (!newestByType[modelType] ||
          new Date(model.created_at) > new Date(newestByType[modelType].created_at)) {
        newestByType[modelType] = { id: model.id, created_at: model.created_at };
      }
    }

    // Update is_current flags in database
    for (const [modelType, newest] of Object.entries(newestByType)) {
      // Check if this is different from current
      const currentModel = dbModels.find(m => m.model_type === modelType && m.is_current);

      if (!currentModel || currentModel.model_id !== newest.id) {
        // Unset current flag on all models of this type
        await sql`
          UPDATE anthropic_models
          SET is_current = false
          WHERE model_type = ${modelType}
        `;

        // Set current flag on newest model
        await sql`
          UPDATE anthropic_models
          SET is_current = true, last_verified = NOW()
          WHERE model_id = ${newest.id}
        `;

        modelsUpdated++;
        changes.push({
          type: 'current_model_changed',
          model_id: newest.id,
          details: {
            model_type: modelType,
            previous: currentModel?.model_id || null
          }
        });

        console.log(`⭐ Set current model for ${modelType}: ${newest.id}`);
      }
    }

    // ============================================
    // 7. LOG RESULTS
    // ============================================

    const durationMs = Date.now() - startTime;

    await sql`
      INSERT INTO sync_logs (
        models_found,
        models_added,
        models_updated,
        models_deprecated,
        success,
        duration_ms,
        changes,
        triggered_by
      ) VALUES (
        ${allModels.length},
        ${modelsAdded},
        ${modelsUpdated},
        ${modelsDeprecated},
        true,
        ${durationMs},
        ${JSON.stringify(changes)},
        'cron'
      )
    `;

    const result: SyncResult = {
      success: true,
      modelsFound: allModels.length,
      modelsAdded,
      modelsUpdated,
      modelsDeprecated,
      changes,
      durationMs
    };

    console.log('✅ Sync completed successfully:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    console.error('❌ Sync failed:', error);

    // Log error to database
    try {
      const sql = getDB();
      await sql`
        INSERT INTO sync_logs (
          models_found,
          models_added,
          models_updated,
          models_deprecated,
          success,
          error_message,
          duration_ms,
          triggered_by
        ) VALUES (
          0, 0, 0, 0, false,
          ${error.message},
          ${durationMs},
          'cron'
        )
      `;
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    const result: SyncResult = {
      success: false,
      modelsFound: 0,
      modelsAdded: 0,
      modelsUpdated: 0,
      modelsDeprecated: 0,
      changes: [],
      errorMessage: error.message,
      durationMs
    };

    // Return 200 even on error (cron shouldn't retry)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
