-- Add location fields to existing users table
-- This migration adds the missing location columns

-- Add governorate column
ALTER TABLE users ADD COLUMN IF NOT EXISTS governorate VARCHAR(100);

-- Add city column
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Add district column
ALTER TABLE users ADD COLUMN IF NOT EXISTS district VARCHAR(100);

-- Add street column
ALTER TABLE users ADD COLUMN IF NOT EXISTS street VARCHAR(255);

-- Add country_code column
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) DEFAULT 'IQ';

-- Add postcode column
ALTER TABLE users ADD COLUMN IF NOT EXISTS postcode VARCHAR(10);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_governorate ON users(governorate);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);
CREATE INDEX IF NOT EXISTS idx_users_location_search ON users(governorate, city, district);

-- Update existing records to have default values
UPDATE users SET
  country_code = 'IQ'
WHERE country_code IS NULL;
