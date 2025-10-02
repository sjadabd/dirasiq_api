-- Enable UUID extension (if not already)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) assignments: تعريف الواجب
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, -- واجب لجلسة محددة (اختياري)
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,

  -- 2) مواعيد وتسليم
  assigned_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  submission_type VARCHAR(20) NOT NULL DEFAULT 'mixed' CHECK (submission_type IN ('text','file','link','mixed')),

  -- 3) الملفات والمرفقات
  attachments JSONB NOT NULL DEFAULT '{}'::jsonb, -- مسارات/روابط صور/ملفات
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,    -- روابط مراجع أو فيديو

  -- 4) الإعدادات
  max_score INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  visibility VARCHAR(32) NOT NULL DEFAULT 'all_students'
    CHECK (visibility IN ('all_students','group','specific_students')),

  -- 5) بيانات الدراسة
  study_year VARCHAR(20), -- مثال: 2025-2026
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,

  -- 6) بيانات النظام
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- جمهور الواجب (عند specific_students)
CREATE TABLE IF NOT EXISTS assignment_recipients (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, student_id)
);

-- تسليمات الطلاب
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  submitted_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','late','graded','returned')),

  -- محتوى التسليم بحسب نوع التسليم
  content_text TEXT,
  link_url TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- الدرجة والتقييم
  score INTEGER,
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

-- الفهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_visibility ON assignments(visibility);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status ON assignment_submissions(status);

-- دالة التحديث التلقائي لحقل updated_at (معاد استخدامها في النظام)
CREATE OR REPLACE FUNCTION update_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- مشغلات التحديث التلقائي
DROP TRIGGER IF EXISTS trigger_update_assignments_updated_at ON assignments;
CREATE TRIGGER trigger_update_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_assignments_updated_at();

DROP TRIGGER IF EXISTS trigger_update_assignment_submissions_updated_at ON assignment_submissions;
CREATE TRIGGER trigger_update_assignment_submissions_updated_at
  BEFORE UPDATE ON assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_assignments_updated_at();

-- ملاحظات:
-- - visibility = 'all_students' يعني كل طلاب الدورة.
-- - visibility = 'specific_students' استخدم جدول assignment_recipients لتحديد الطلاب.
-- - visibility = 'group' يمكن مستقبلاً إضافة جدول مجموعات وربطه هنا.
-- - يمكن إرسال إشعار عند إدراج سجل في assignments أو submissions عبر منطق التطبيق (services/controllers).
