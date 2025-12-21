-- Store full Wayl create-link request/response payloads
CREATE TABLE IF NOT EXISTS wayl_payment_link_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_link_id UUID REFERENCES wayl_payment_links(id) ON DELETE CASCADE,
    reference_id TEXT,
    event_type VARCHAR(30) NOT NULL, -- create_link_request | create_link_response
    http_status INTEGER,
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wayl_payment_link_logs_payment_link_id ON wayl_payment_link_logs(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_wayl_payment_link_logs_reference_id ON wayl_payment_link_logs(reference_id);

-- Store each webhook event with headers/body and verification result
CREATE TABLE IF NOT EXISTS wayl_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_link_id UUID REFERENCES wayl_payment_links(id) ON DELETE CASCADE,
    reference_id TEXT,
    signature TEXT,
    signature_valid BOOLEAN NOT NULL DEFAULT false,
    headers JSONB,
    raw_body TEXT,
    body JSONB,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'received', -- received | processed | ignored | failed
    processing_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_payment_link_id ON wayl_webhook_events(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_reference_id ON wayl_webhook_events(reference_id);
CREATE INDEX IF NOT EXISTS idx_wayl_webhook_events_processing_status ON wayl_webhook_events(processing_status);
