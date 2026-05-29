-- ============================================================================
-- 051_20260529_video_course_purchases.sql
-- ----------------------------------------------------------------------------
-- Ledger of student → video course purchases.
--
-- One row is created at "buy" time with status='pending'. The Wayl webhook
-- flips it to 'paid' (or 'failed') based on the gateway callback. On
-- 'paid' a wallet_ledger entry is also written by the same webhook
-- transaction crediting the teacher.
--
-- Pricing snapshot:
--   We freeze amount_iqd, platform_commission_percent,
--   platform_commission_iqd, and teacher_net_iqd at purchase time. If the
--   teacher later edits video_courses.price OR the super-admin changes
--   the commission tiers, the in-flight purchase still honours the
--   numbers the student saw and agreed to. This isolates downstream
--   reconciliation from upstream pricing changes.
--
-- Idempotency:
--   - UNIQUE (video_course_id, student_id) WHERE status IN ('pending','paid')
--     stops the obvious double-spend: a student cannot have two active
--     purchase rows for the same video at once.
--   - UNIQUE wayl_payment_link_id stops linking the same Wayl link to
--     two purchase rows.
--   - Refunded rows are excluded from the unique guard so the same
--     student can re-buy the same video after a refund.
--
-- ON DELETE policy (RESTRICT on user / video / teacher / wayl_link):
--   This table is a financial audit trail. Deleting a user / teacher /
--   video / payment-link mid-flight would corrupt revenue reports and
--   commission calculations. The "delete" path for any of those four
--   entities must go through a soft-delete-aware service that either
--   refuses to delete with active rows, OR cascades to a refund flow.
--   See migration-policy.md ON DELETE matrix.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_course_purchases (
    id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    video_course_id             UUID         NOT NULL REFERENCES video_courses(id) ON DELETE RESTRICT,
    student_id                  UUID         NOT NULL REFERENCES users(id)         ON DELETE RESTRICT,
    teacher_id                  UUID         NOT NULL REFERENCES users(id)         ON DELETE RESTRICT,

    -- Snapshot of pricing at purchase creation time. Honours what the
    -- student saw + agreed to; later price/tier changes do not affect
    -- in-flight rows.
    amount_iqd                  DECIMAL(14,2) NOT NULL CHECK (amount_iqd >= 0),
    platform_commission_percent DECIMAL(5,2)  NOT NULL
                                  CHECK (platform_commission_percent >= 0 AND platform_commission_percent <= 100),
    platform_commission_iqd     DECIMAL(14,2) NOT NULL CHECK (platform_commission_iqd >= 0),
    teacher_net_iqd             DECIMAL(14,2) NOT NULL CHECK (teacher_net_iqd >= 0),

    -- Payment link. UNIQUE so a single link maps to at most one purchase.
    -- ON DELETE SET NULL — keeping the row's financial trail even if the
    -- ops team manually purges a stale link record.
    wayl_payment_link_id        UUID                  REFERENCES wayl_payment_links(id) ON DELETE SET NULL,

    status                      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','paid','failed','refunded')),

    paid_at                     TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    refund_reason               TEXT,

    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_vcp_wayl_link
    ON video_course_purchases (wayl_payment_link_id)
    WHERE wayl_payment_link_id IS NOT NULL;

-- Active-per-student guard. Refunded rows are excluded so the student
-- can re-buy the same video after a refund.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vcp_active_per_student
    ON video_course_purchases (video_course_id, student_id)
    WHERE status IN ('pending','paid');

-- Hot path: student "my library" = "what have I paid for?"
CREATE INDEX IF NOT EXISTS idx_vcp_student_paid
    ON video_course_purchases (student_id)
    WHERE status = 'paid';

-- Hot path: teacher sales report.
CREATE INDEX IF NOT EXISTS idx_vcp_teacher_paid
    ON video_course_purchases (teacher_id, paid_at DESC)
    WHERE status = 'paid';

-- Hot path: per-video sales report + Trending materialised view source.
CREATE INDEX IF NOT EXISTS idx_vcp_video_course_paid
    ON video_course_purchases (video_course_id, paid_at DESC)
    WHERE status = 'paid';

DROP TRIGGER IF EXISTS update_video_course_purchases_updated_at ON video_course_purchases;
CREATE TRIGGER update_video_course_purchases_updated_at
    BEFORE UPDATE ON video_course_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE video_course_purchases IS
    'Append-only audit of every student → video_course purchase. status lifecycle: pending → paid | failed → refunded. Pricing fields snapshot the teacher and tier at purchase time so reconciliation is stable against later changes.';
