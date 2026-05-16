-- ============================================================================
-- 028_wayl.sql
-- ----------------------------------------------------------------------------
-- Wayl payment gateway integration: outbound payment links, the audit log of
-- API calls made to Wayl, and the audit log of inbound webhook events.
-- Three related tables together.
--
-- Consolidates from v1:
--   - 037_create_wayl_payment_links_table.sql
--   - 040_create_wayl_payment_events_tables.sql  (link_logs + webhook_events)
--
-- v2 corrections (vs v1):
--   - **FK from wayl_payment_links.teacher_id → users.id changed to
--     ON DELETE RESTRICT** (financial audit preservation —
--     DATABASE_ANALYSIS.md §8 Critical finding #6).
--   - TIMESTAMPTZ throughout.
--   - Per-table trigger function replaced by shared
--     `update_updated_at_column()`.
--   - CHECK on amount > 0 (a payment link must be for a positive amount).
--   - **CHECK on status enumerating allowed values** (v1 had none — created |
--     pending | paid | failed | expired).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- wayl_payment_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wayl_payment_links (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id               UUID          NOT NULL REFERENCES users(id)                 ON DELETE RESTRICT,
    purpose                  VARCHAR(30)   NOT NULL,
    subscription_package_id  UUID          REFERENCES subscription_packages(id)          ON DELETE SET NULL,

    amount                   DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    currency                 VARCHAR(10)   NOT NULL DEFAULT 'iqd',

    reference_id             TEXT          NOT NULL,
    wayl_order_id            TEXT,
    wayl_code                TEXT,
    wayl_url                 TEXT,
    wayl_secret              TEXT          NOT NULL,

    status                   VARCHAR(20)   NOT NULL DEFAULT 'created'
                                 CHECK (status IN ('created','pending','paid','failed','expired')),
    webhook_received_at      TIMESTAMPTZ,

    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN wayl_payment_links.purpose IS
    'What this payment is for. Application enumerates allowed values (e.g. "subscription", "reservation").';
COMMENT ON COLUMN wayl_payment_links.wayl_secret IS
    'Per-link secret used by the webhook HMAC signature check. CRITICAL: stored plaintext today; encrypt at rest in a future track.';
COMMENT ON COLUMN wayl_payment_links.status IS
    'Lifecycle: created → pending (link issued) → paid | failed | expired. Set by the webhook handler.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_wayl_payment_links_reference_id ON wayl_payment_links (reference_id);
CREATE INDEX        IF NOT EXISTS idx_wayl_payment_links_teacher_id  ON wayl_payment_links (teacher_id);
CREATE INDEX        IF NOT EXISTS idx_wayl_payment_links_status      ON wayl_payment_links (status);

-- Hot path: "open links for teacher X"
CREATE INDEX IF NOT EXISTS idx_wayl_payment_links_open
    ON wayl_payment_links (teacher_id, created_at DESC)
    WHERE status IN ('created','pending');

DROP TRIGGER IF EXISTS update_wayl_payment_links_updated_at ON wayl_payment_links;
CREATE TRIGGER update_wayl_payment_links_updated_at
    BEFORE UPDATE ON wayl_payment_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- wayl_payment_link_logs  (outbound: our requests to Wayl)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wayl_payment_link_logs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_link_id UUID         REFERENCES wayl_payment_links(id) ON DELETE CASCADE,
    reference_id    TEXT,
    event_type      VARCHAR(30)  NOT NULL,
    http_status     INTEGER,
    payload         JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN wayl_payment_link_logs.event_type IS 'Typically one of "create_link_request" | "create_link_response".';

CREATE INDEX IF NOT EXISTS idx_wayl_payment_link_logs_payment_link_id ON wayl_payment_link_logs (payment_link_id);
CREATE INDEX IF NOT EXISTS idx_wayl_payment_link_logs_reference_id    ON wayl_payment_link_logs (reference_id);

-- ---------------------------------------------------------------------------
-- wayl_webhook_events  (inbound: Wayl's notifications to us)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wayl_webhook_events (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_link_id    UUID         REFERENCES wayl_payment_links(id) ON DELETE CASCADE,
    reference_id       TEXT,
    signature          TEXT,
    signature_valid    BOOLEAN      NOT NULL DEFAULT FALSE,
    headers            JSONB,
    raw_body           TEXT,
    body               JSONB,
    received_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    processed_at       TIMESTAMPTZ,
    processing_status  VARCHAR(30)  NOT NULL DEFAULT 'received'
                           CHECK (processing_status IN ('received','processed','ignored','failed')),
    processing_message TEXT
);

COMMENT ON TABLE wayl_webhook_events IS
    'Audit log of every webhook delivery received from Wayl. signature_valid records the HMAC verification result. CRITICAL: today the production handler does not yet verify signatures — see DATABASE_ANALYSIS.md §8 Critical finding (Wayl signature).';

CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_payment_link_id    ON wayl_webhook_events (payment_link_id);
CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_reference_id       ON wayl_webhook_events (reference_id);
CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_processing_status  ON wayl_webhook_events (processing_status);
