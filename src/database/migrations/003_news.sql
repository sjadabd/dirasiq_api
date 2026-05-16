-- ============================================================================
-- 003_news.sql
-- ----------------------------------------------------------------------------
-- CMS table for platform announcements / news. Supports targeting by platform
-- (web / mobile / both) and soft delete.
--
-- Consolidates from v1:
--   - 001_create_news_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ for every timestamp column.
--   - The `update_news_updated_at_column()` trigger function from v1 is
--     REMOVED. The shared `update_updated_at_column()` defined in 001 is
--     used instead.
--   - Adds partial index on (id) WHERE deleted_at IS NULL to support the
--     common "active news" listing query.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS news (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(255) NOT NULL,
    image_url    TEXT,
    details      TEXT         NOT NULL,
    category     VARCHAR(100),
    news_type    VARCHAR(50)  NOT NULL DEFAULT 'web_and_mobile',
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,

    CONSTRAINT unique_news_title UNIQUE (title)
);

COMMENT ON COLUMN news.news_type IS 'Platform targeting: typically one of web | mobile | web_and_mobile.';

CREATE INDEX IF NOT EXISTS idx_news_is_active     ON news (is_active);
CREATE INDEX IF NOT EXISTS idx_news_published_at  ON news (published_at);
CREATE INDEX IF NOT EXISTS idx_news_news_type     ON news (news_type);

-- Partial index for the most common public read path:
--   SELECT … FROM news WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY published_at DESC
CREATE INDEX IF NOT EXISTS idx_news_active_published
    ON news (published_at DESC)
    WHERE deleted_at IS NULL AND is_active = TRUE;

DROP TRIGGER IF EXISTS update_news_updated_at ON news;
CREATE TRIGGER update_news_updated_at
    BEFORE UPDATE ON news
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
