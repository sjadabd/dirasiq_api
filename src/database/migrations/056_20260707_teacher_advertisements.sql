-- Migration: teacher advertisement platform (ads, clicks, settings, ad wallet audit)
-- Created: 2026-07-07

BEGIN;

-- ---------------------------------------------------------------------------
-- advertisement_settings — singleton configuration row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisement_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_per_click              DECIMAL(14,2) NOT NULL DEFAULT 100
                                    CHECK (cost_per_click > 0),
    min_budget                  DECIMAL(14,2) NOT NULL DEFAULT 5000
                                    CHECK (min_budget > 0),
    max_budget                  DECIMAL(14,2) NOT NULL DEFAULT 500000
                                    CHECK (max_budget >= min_budget),
    max_duration_days           INT NOT NULL DEFAULT 30 CHECK (max_duration_days > 0),
    auto_end_duration_days      INT NOT NULL DEFAULT 30 CHECK (auto_end_duration_days > 0),
    allow_public                BOOLEAN NOT NULL DEFAULT TRUE,
    allow_governorate           BOOLEAN NOT NULL DEFAULT TRUE,
    require_approval            BOOLEAN NOT NULL DEFAULT TRUE,
    max_active_per_teacher      INT NOT NULL DEFAULT 3 CHECK (max_active_per_teacher > 0),
    image_size_limit_bytes      INT NOT NULL DEFAULT 5242880 CHECK (image_size_limit_bytes > 0),
    max_title_length            INT NOT NULL DEFAULT 120 CHECK (max_title_length > 0),
    max_description_length      INT NOT NULL DEFAULT 2000 CHECK (max_description_length > 0),
    refund_unused_budget        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO advertisement_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM advertisement_settings);

-- ---------------------------------------------------------------------------
-- advertisements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title                   VARCHAR(255) NOT NULL,
    description             TEXT NOT NULL,
    cover_image_url         TEXT,
    visibility              VARCHAR(20) NOT NULL DEFAULT 'public'
                                CHECK (visibility IN ('public', 'governorate_only')),
    teacher_governorate     VARCHAR(100),
    status                  VARCHAR(30) NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                    'draft',
                                    'pending_review',
                                    'approved',
                                    'rejected',
                                    'running',
                                    'finished',
                                    'budget_exhausted'
                                )),
    budget_total            DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (budget_total >= 0),
    budget_remaining        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (budget_remaining >= 0),
    reserved_from_balance   DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (reserved_from_balance >= 0),
    reserved_from_pending   DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (reserved_from_pending >= 0),
    cost_per_click          DECIMAL(14,2),
    unique_clicks           INT NOT NULL DEFAULT 0 CHECK (unique_clicks >= 0),
    rejection_reason        TEXT,
    admin_notes             TEXT,
    start_date              TIMESTAMPTZ,
    end_date                TIMESTAMPTZ,
    submitted_at            TIMESTAMPTZ,
    approved_at             TIMESTAMPTZ,
    rejected_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_advertisements_teacher_status
    ON advertisements (teacher_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_advertisements_status_dates
    ON advertisements (status, start_date, end_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_advertisements_running_feed
    ON advertisements (start_date DESC, created_at DESC)
    WHERE deleted_at IS NULL AND status = 'running';

DROP TRIGGER IF EXISTS update_advertisements_updated_at ON advertisements;
CREATE TRIGGER update_advertisements_updated_at
    BEFORE UPDATE ON advertisements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- advertisement_clicks — one paid click per student per ad
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisement_clicks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertisement_id    UUID NOT NULL REFERENCES advertisements(id) ON DELETE RESTRICT,
    student_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_charged      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (amount_charged >= 0),
    clicked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_advertisement_clicks_ad_student UNIQUE (advertisement_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_advertisement_clicks_ad
    ON advertisement_clicks (advertisement_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_advertisement_clicks_student
    ON advertisement_clicks (student_id, clicked_at DESC);

-- ---------------------------------------------------------------------------
-- advertisement_wallet_transactions — ad-level budget audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisement_wallet_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertisement_id    UUID NOT NULL REFERENCES advertisements(id) ON DELETE RESTRICT,
    teacher_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    txn_type            VARCHAR(30) NOT NULL
                            CHECK (txn_type IN ('reserve', 'refund_full', 'refund_unused', 'click_charge')),
    amount              DECIMAL(14,2) NOT NULL CHECK (amount <> 0),
    budget_before       DECIMAL(14,2) NOT NULL CHECK (budget_before >= 0),
    budget_after        DECIMAL(14,2) NOT NULL CHECK (budget_after >= 0),
    reference_id        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_wallet_txn_ad
    ON advertisement_wallet_transactions (advertisement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_wallet_txn_teacher
    ON advertisement_wallet_transactions (teacher_id, created_at DESC);

COMMIT;
