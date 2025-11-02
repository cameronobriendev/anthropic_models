-- Anthropic Models Manager - Initial Database Schema
-- Created: November 2, 2025
-- Purpose: Single source of truth for Claude model identifiers across all BrassHelm projects

-- ============================================================================
-- Table 1: anthropic_models
-- ============================================================================
-- Primary table storing all known Anthropic Claude models

CREATE TABLE IF NOT EXISTS anthropic_models (
  id SERIAL PRIMARY KEY,

  -- Model identification
  model_id VARCHAR(100) NOT NULL UNIQUE,          -- 'claude-sonnet-4-5-20250929'
  model_type VARCHAR(50) NOT NULL,                -- 'sonnet', 'haiku', 'opus'
  model_alias VARCHAR(50),                        -- 'claude-sonnet-4-5' (auto-updates)
  display_name VARCHAR(100),                      -- Human-readable name

  -- Status tracking
  is_current BOOLEAN DEFAULT false,               -- Latest from Anthropic API
  is_working BOOLEAN DEFAULT false,               -- Last verified working
  is_deprecated BOOLEAN DEFAULT false,            -- Marked deprecated by Anthropic
  deprecation_date TIMESTAMP,                     -- When it was deprecated

  -- Cost tracking (per million tokens)
  cost_per_million_input_tokens DECIMAL(10,4),   -- e.g., 3.0000
  cost_per_million_output_tokens DECIMAL(10,4),  -- e.g., 15.0000

  -- Usage tracking (running totals)
  total_api_calls BIGINT DEFAULT 0,               -- Total calls across all projects
  total_input_tokens BIGINT DEFAULT 0,            -- Total input tokens
  total_output_tokens BIGINT DEFAULT 0,           -- Total output tokens
  total_cost_usd DECIMAL(10,2) DEFAULT 0.00,      -- Running cost total

  -- Verification & health
  last_verified TIMESTAMP,                        -- Last time we confirmed it works
  error_count INT DEFAULT 0,                      -- Consecutive errors (triggers fallback)
  last_error TEXT,                                -- Last error message
  last_error_at TIMESTAMP,                        -- When last error occurred

  -- Metadata
  first_seen TIMESTAMP DEFAULT NOW(),             -- When we first discovered it
  last_used TIMESTAMP,                            -- Last API call using this model
  notes TEXT,                                     -- Admin notes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_models_current ON anthropic_models(model_type, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_models_working ON anthropic_models(model_type, is_working) WHERE is_working = true;
CREATE INDEX IF NOT EXISTS idx_models_deprecated ON anthropic_models(is_deprecated) WHERE is_deprecated = true;
CREATE INDEX IF NOT EXISTS idx_models_type ON anthropic_models(model_type);
CREATE INDEX IF NOT EXISTS idx_models_last_used ON anthropic_models(last_used DESC NULLS LAST);

-- ============================================================================
-- Table 2: model_usage
-- ============================================================================
-- Tracks API usage per project and model (hourly buckets for analytics)

CREATE TABLE IF NOT EXISTS model_usage (
  id SERIAL PRIMARY KEY,

  -- References
  model_id VARCHAR(100) NOT NULL REFERENCES anthropic_models(model_id) ON DELETE CASCADE,
  project_name VARCHAR(50) NOT NULL,              -- 'ai', 'tracker', 'forms', 'dashboard'
  endpoint VARCHAR(200),                          -- '/api/chat', '/api/transcribe/upload'

  -- Usage metrics (aggregated per hour)
  api_calls INT DEFAULT 0,
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  total_cost_usd DECIMAL(10,2) DEFAULT 0.00,

  -- Performance metrics
  avg_response_time_ms INT,                       -- Average response time
  min_response_time_ms INT,                       -- Fastest response
  max_response_time_ms INT,                       -- Slowest response

  -- Error tracking
  error_count INT DEFAULT 0,
  last_error TEXT,

  -- Time bucket (hourly)
  hour TIMESTAMP NOT NULL,                        -- Truncated to hour: 2025-11-02 10:00:00

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Composite unique constraint (one row per project/model/hour)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique ON model_usage(project_name, model_id, hour);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_project ON model_usage(project_name, hour DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model ON model_usage(model_id, hour DESC);
CREATE INDEX IF NOT EXISTS idx_usage_hour ON model_usage(hour DESC);
CREATE INDEX IF NOT EXISTS idx_usage_project_hour ON model_usage(project_name, hour DESC);

-- ============================================================================
-- Table 3: ab_tests
-- ============================================================================
-- A/B testing experiments configuration and results

CREATE TABLE IF NOT EXISTS ab_tests (
  id SERIAL PRIMARY KEY,

  -- Test configuration
  test_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Models being tested
  model_a VARCHAR(100) NOT NULL REFERENCES anthropic_models(model_id),
  model_b VARCHAR(100) NOT NULL REFERENCES anthropic_models(model_id),
  traffic_split_percent INT DEFAULT 50,           -- % traffic to model_a (0-100)

  -- Targeting (NULL = all)
  project_names TEXT[],                           -- ['ai', 'tracker'] or NULL for all
  user_roles TEXT[],                              -- ['admin', 'superuser'] or NULL for all

  -- Status
  status VARCHAR(20) DEFAULT 'draft',             -- 'draft', 'running', 'paused', 'completed'
  started_at TIMESTAMP,
  ended_at TIMESTAMP,

  -- Results (computed from model_usage data)
  model_a_calls INT DEFAULT 0,
  model_b_calls INT DEFAULT 0,
  model_a_avg_response_ms INT,
  model_b_avg_response_ms INT,
  model_a_error_rate DECIMAL(5,2),                -- Percentage (0.00 - 100.00)
  model_b_error_rate DECIMAL(5,2),
  model_a_cost_usd DECIMAL(10,2) DEFAULT 0.00,
  model_b_cost_usd DECIMAL(10,2) DEFAULT 0.00,

  -- Winner determination
  winner VARCHAR(10),                             -- 'model_a', 'model_b', 'tie', NULL
  winner_reason TEXT,                             -- Why this model won

  -- Metadata
  created_by VARCHAR(100),                        -- Username who created test
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_active ON ab_tests(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_ab_tests_created_at ON ab_tests(created_at DESC);

-- ============================================================================
-- Table 4: model_overrides
-- ============================================================================
-- Manual admin overrides for specific projects or scenarios

CREATE TABLE IF NOT EXISTS model_overrides (
  id SERIAL PRIMARY KEY,

  -- Targeting (NULL = global override)
  project_name VARCHAR(50),                       -- 'ai', 'tracker', NULL for global
  model_type VARCHAR(50) NOT NULL,                -- 'sonnet', 'haiku', 'opus'

  -- Override configuration
  override_model_id VARCHAR(100) NOT NULL REFERENCES anthropic_models(model_id),
  reason TEXT NOT NULL,                           -- Why override was set
  expires_at TIMESTAMP,                           -- NULL = never expires

  -- Metadata
  created_by VARCHAR(100) NOT NULL,               -- Username who created override
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overrides_project ON model_overrides(project_name, model_type);
CREATE INDEX IF NOT EXISTS idx_overrides_expires ON model_overrides(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_overrides_active ON model_overrides(expires_at) WHERE expires_at IS NULL OR expires_at > NOW();

-- ============================================================================
-- Table 5: sync_logs
-- ============================================================================
-- Track sync executions from Anthropic API

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,

  -- Sync results
  models_found INT DEFAULT 0,                     -- Total models from API
  models_added INT DEFAULT 0,                     -- New models discovered
  models_updated INT DEFAULT 0,                   -- Existing models updated
  models_deprecated INT DEFAULT 0,                -- Models marked deprecated

  -- Status
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  duration_ms INT,                                -- How long sync took

  -- Changes (JSONB for flexibility)
  changes JSONB,                                  -- Array of change objects

  -- Metadata
  triggered_by VARCHAR(50) DEFAULT 'cron',       -- 'cron', 'manual', 'api'
  triggered_by_user VARCHAR(100),                -- Username if manual
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_success ON sync_logs(success, created_at DESC);

-- ============================================================================
-- Initial Data Seed
-- ============================================================================
-- Insert current known models from Anthropic

INSERT INTO anthropic_models (
  model_id,
  model_type,
  model_alias,
  display_name,
  is_current,
  is_working,
  cost_per_million_input_tokens,
  cost_per_million_output_tokens,
  last_verified
) VALUES
  -- Claude Sonnet 4.5 (current production model)
  (
    'claude-sonnet-4-5-20250929',
    'sonnet',
    'claude-sonnet-4-5',
    'Claude Sonnet 4.5',
    true,
    true,
    3.0000,
    15.0000,
    NOW()
  ),
  -- Claude Haiku 4.5 (fastest, cheapest)
  (
    'claude-haiku-4-5-20251001',
    'haiku',
    'claude-haiku-4-5',
    'Claude Haiku 4.5',
    true,
    true,
    0.8000,
    4.0000,
    NOW()
  ),
  -- Claude Opus 4.1 (most powerful)
  (
    'claude-opus-4-1-20250805',
    'opus',
    'claude-opus-4-1',
    'Claude Opus 4.1',
    true,
    true,
    15.0000,
    75.0000,
    NOW()
  ),
  -- Older Haiku (for reference)
  (
    'claude-3-5-haiku-20241022',
    'haiku',
    NULL,
    'Claude 3.5 Haiku',
    false,
    true,
    0.8000,
    4.0000,
    NOW()
  )
ON CONFLICT (model_id) DO NOTHING;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these to verify the schema was created correctly:

-- 1. Check all tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('anthropic_models', 'model_usage', 'ab_tests', 'model_overrides', 'sync_logs')
-- ORDER BY table_name;

-- 2. Check indexes
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('anthropic_models', 'model_usage', 'ab_tests', 'model_overrides', 'sync_logs')
-- ORDER BY tablename, indexname;

-- 3. Verify seeded data
-- SELECT model_id, model_type, is_current, is_working
-- FROM anthropic_models
-- ORDER BY model_type, created_at;

-- 4. Check row counts
-- SELECT
--   'anthropic_models' as table_name, COUNT(*) as rows FROM anthropic_models
-- UNION ALL SELECT 'model_usage', COUNT(*) FROM model_usage
-- UNION ALL SELECT 'ab_tests', COUNT(*) FROM ab_tests
-- UNION ALL SELECT 'model_overrides', COUNT(*) FROM model_overrides
-- UNION ALL SELECT 'sync_logs', COUNT(*) FROM sync_logs;
