-- Previous schema used UNIQUE (teacher_id, is_active) which prevents multiple inactive rows.

ALTER TABLE teacher_subscriptions
  DROP CONSTRAINT IF EXISTS unique_active_subscription_per_teacher;

-- Ensure data consistency before adding the new constraint:
-- keep only the latest active subscription per teacher.
UPDATE teacher_subscriptions ts
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE ts.is_active = true
  AND ts.deleted_at IS NULL
  AND ts.id NOT IN (
    SELECT DISTINCT ON (teacher_id) id
    FROM teacher_subscriptions
    WHERE is_active = true AND deleted_at IS NULL
    ORDER BY teacher_id, created_at DESC
  );

-- Enforce: at most one active subscription per teacher
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_subscriptions_one_active_per_teacher
  ON teacher_subscriptions (teacher_id)
  WHERE is_active = true AND deleted_at IS NULL;
