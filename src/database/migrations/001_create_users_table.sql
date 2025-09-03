-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('super_admin', 'teacher', 'student')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),

    -- Teacher specific fields
    phone VARCHAR(20),
    address TEXT,
    bio TEXT,
    experience_years INTEGER,
    visitor_id VARCHAR(255),
    device_info TEXT,

    -- Student specific fields
    student_phone VARCHAR(20),
    parent_phone VARCHAR(20),
    school_name VARCHAR(255),
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
    birth_date DATE,

    -- Location fields (for both teachers and students)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Verification fields
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_code_expires TIMESTAMP,

    -- Password reset fields
    password_reset_code VARCHAR(6),
    password_reset_expires TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_student_phone ON users(student_phone);
CREATE INDEX IF NOT EXISTS idx_users_parent_phone ON users(parent_phone);
CREATE INDEX IF NOT EXISTS idx_users_birth_date ON users(birth_date);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
