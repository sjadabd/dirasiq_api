-- Allow multiple active subscriptions per teacher by removing the partial unique index
DROP INDEX IF EXISTS idx_teacher_subscriptions_one_active_per_teacher;

-- Track current number of confirmed students per teacher (decoupled from subscriptions)
CREATE TABLE IF NOT EXISTS teacher_student_capacity (
    teacher_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_students INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_teacher_student_capacity_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_teacher_student_capacity_updated_at ON teacher_student_capacity;
CREATE TRIGGER update_teacher_student_capacity_updated_at
    BEFORE UPDATE ON teacher_student_capacity
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_student_capacity_updated_at_column();

-- Backfill capacity from existing teacher_subscriptions.current_students (best-effort)
INSERT INTO teacher_student_capacity (teacher_id, current_students)
SELECT ts.teacher_id, MAX(ts.current_students) AS current_students
FROM teacher_subscriptions ts
WHERE ts.deleted_at IS NULL
GROUP BY ts.teacher_id
ON CONFLICT (teacher_id) DO UPDATE
SET current_students = GREATEST(teacher_student_capacity.current_students, EXCLUDED.current_students),
    updated_at = CURRENT_TIMESTAMP;
