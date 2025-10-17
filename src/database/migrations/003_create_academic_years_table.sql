-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create academic_years table
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year VARCHAR(9) NOT NULL UNIQUE CHECK (year ~ '^\d{4}-\d{4}$'),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on year field for faster lookups
CREATE INDEX IF NOT EXISTS idx_academic_years_year ON academic_years(year);

-- Create index on is_active field for faster filtering
CREATE INDEX IF NOT EXISTS idx_academic_years_is_active ON academic_years(is_active);

-- Create trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_academic_years_updated_at ON academic_years;
CREATE TRIGGER update_academic_years_updated_at
    BEFORE UPDATE ON academic_years
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to ensure only one active academic year
CREATE OR REPLACE FUNCTION ensure_single_active_academic_year()
RETURNS TRIGGER AS $$
BEGIN
    -- If we're setting this year to active, deactivate all others
    IF NEW.is_active = true THEN
        UPDATE academic_years
        SET is_active = false
        WHERE id != NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure only one active academic year
DROP TRIGGER IF EXISTS trigger_ensure_single_active_academic_year ON academic_years;
CREATE TRIGGER trigger_ensure_single_active_academic_year
    BEFORE UPDATE ON academic_years
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_active_academic_year();
