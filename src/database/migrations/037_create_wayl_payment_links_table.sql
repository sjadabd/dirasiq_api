CREATE TABLE IF NOT EXISTS wayl_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,
    subscription_package_id UUID REFERENCES subscription_packages(id) ON DELETE SET NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'iqd',
    reference_id TEXT NOT NULL,
    wayl_order_id TEXT,
    wayl_code TEXT,
    wayl_url TEXT,
    wayl_secret TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    webhook_received_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_wayl_payment_links_reference_id ON wayl_payment_links(reference_id);
CREATE INDEX IF NOT EXISTS idx_wayl_payment_links_teacher_id ON wayl_payment_links(teacher_id);
CREATE INDEX IF NOT EXISTS idx_wayl_payment_links_status ON wayl_payment_links(status);

CREATE OR REPLACE FUNCTION update_wayl_payment_links_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_wayl_payment_links_updated_at ON wayl_payment_links;
CREATE TRIGGER update_wayl_payment_links_updated_at
    BEFORE UPDATE ON wayl_payment_links
    FOR EACH ROW
    EXECUTE FUNCTION update_wayl_payment_links_updated_at_column();
