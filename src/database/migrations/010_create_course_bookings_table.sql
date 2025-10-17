-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create course_bookings table if not exists
CREATE TABLE IF NOT EXISTS course_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_year VARCHAR(9) NOT NULL,

    -- Status and control
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'pre_approved', 'confirmed', 'approved', 'rejected', 'cancelled')),
    cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('student', 'teacher')),
    rejected_by VARCHAR(20) CHECK (rejected_by IN ('teacher', 'student')), -- 🆕 العمود الجديد
    reactivated_at TIMESTAMP WITH TIME ZONE,

    -- Dates
    booking_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Reasons and messages
    rejection_reason TEXT,
    cancellation_reason TEXT,
    student_message TEXT,
    teacher_response TEXT,

    -- Deletion and audit
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Drop and recreate CHECK constraint on status to allow new values
ALTER TABLE course_bookings DROP CONSTRAINT IF EXISTS course_bookings_status_check;

ALTER TABLE course_bookings
    ADD CONSTRAINT course_bookings_status_check
    CHECK (
        status IN ('pending', 'pre_approved', 'confirmed', 'approved', 'rejected', 'cancelled')
    );

-- Comments for status field
COMMENT ON COLUMN course_bookings.status IS
'الحالات الممكنة:
- pending: قيد الانتظار
- pre_approved: موافقة أولية من المدرس
- confirmed: تم تأكيد الحجز
- approved: موافق عليه نهائياً
- rejected: مرفوض
- cancelled: ملغي';

-- Comments for other fields
COMMENT ON COLUMN course_bookings.study_year IS 'Academic year for the course (format: YYYY-YYYY)';
COMMENT ON COLUMN course_bookings.cancelled_by IS 'Indicates who cancelled the booking: student or teacher';
COMMENT ON COLUMN course_bookings.rejected_by IS 'Indicates who rejected the booking: teacher or student'; -- 🆕 التعليق
COMMENT ON COLUMN course_bookings.reactivated_at IS 'Timestamp when a cancelled booking was reactivated by student';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_bookings_student_id ON course_bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_course_id ON course_bookings(course_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_teacher_id ON course_bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_study_year ON course_bookings(study_year);
CREATE INDEX IF NOT EXISTS idx_course_bookings_status ON course_bookings(status);
CREATE INDEX IF NOT EXISTS idx_course_bookings_booking_date ON course_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_course_bookings_is_deleted ON course_bookings(is_deleted);
CREATE INDEX IF NOT EXISTS idx_course_bookings_cancelled_by ON course_bookings(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_course_bookings_rejected_by ON course_bookings(rejected_by); -- 🆕 اندكس جديد
CREATE INDEX IF NOT EXISTS idx_course_bookings_reactivated_at ON course_bookings(reactivated_at);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_course_bookings_updated_at ON course_bookings;
CREATE TRIGGER update_course_bookings_updated_at
    BEFORE UPDATE ON course_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Unique constraint to prevent duplicate bookings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_student_course_booking'
    ) THEN
        ALTER TABLE course_bookings ADD CONSTRAINT unique_student_course_booking
        UNIQUE (student_id, course_id);
    END IF;
END $$;

-- Comments
COMMENT ON CONSTRAINT unique_student_course_booking ON course_bookings IS
'Ensures unique bookings per student and course. Prevents duplicate booking requests.';

COMMENT ON TABLE course_bookings IS
'Stores course booking requests from students to teachers. Tracks the status and communication between student and teacher. Includes study year for academic organization.';
