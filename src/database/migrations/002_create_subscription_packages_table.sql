-- Create subscription packages table for teachers
CREATE TABLE IF NOT EXISTS subscription_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    max_students INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_days INTEGER NOT NULL,
    is_free BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- Add unique constraints to prevent duplicates
    CONSTRAINT unique_package_name UNIQUE (name),
    CONSTRAINT unique_package_combination UNIQUE (max_students, price, duration_days, is_free)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscription_packages_name ON subscription_packages(name);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_is_active ON subscription_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_price ON subscription_packages(price);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_duration_days ON subscription_packages(duration_days);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_packages_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_subscription_packages_updated_at ON subscription_packages;
CREATE TRIGGER update_subscription_packages_updated_at
    BEFORE UPDATE ON subscription_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_packages_updated_at_column();

-- Insert default free package (only if it doesn't exist)
INSERT INTO subscription_packages (name, description, max_students, price, duration_days, is_free, is_active)
SELECT 'الباقة المجانية', 'باقة مجانية للمعلمين الجدد - حد أقصى 5 طلاب', 5, 0.00, 30, TRUE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_packages WHERE name = 'الباقة المجانية'
);

-- Insert some sample paid packages (only if they don't exist)
INSERT INTO subscription_packages (name, description, max_students, price, duration_days, is_free, is_active)
SELECT 'الباقة الأساسية', 'باقة أساسية للمعلمين - حد أقصى 20 طالب', 20, 25.00, 30, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_packages WHERE name = 'الباقة الأساسية'
);

INSERT INTO subscription_packages (name, description, max_students, price, duration_days, is_free, is_active)
SELECT 'الباقة المتقدمة', 'باقة متقدمة للمعلمين - حد أقصى 50 طالب', 50, 45.00, 30, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_packages WHERE name = 'الباقة المتقدمة'
);

INSERT INTO subscription_packages (name, description, max_students, price, duration_days, is_free, is_active)
SELECT 'الباقة الاحترافية', 'باقة احترافية للمعلمين - حد أقصى 100 طالب', 100, 80.00, 30, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_packages WHERE name = 'الباقة الاحترافية'
);

INSERT INTO subscription_packages (name, description, max_students, price, duration_days, is_free, is_active)
SELECT 'الباقة السنوية', 'باقة سنوية بخصم 20% - حد أقصى 100 طالب', 100, 768.00, 365, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_packages WHERE name = 'الباقة السنوية'
);
