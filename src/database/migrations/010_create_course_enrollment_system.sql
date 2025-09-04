-- =====================================================
-- نظام إدارة الكورسات والطلاب - الهجرة الكاملة
-- =====================================================

-- 1. جدول طلبات التسجيل في الكورسات
CREATE TABLE IF NOT EXISTS course_enrollment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بالطالب
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالمعلم
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالكورس
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- السنة الدراسية
    study_year VARCHAR(9) NOT NULL CHECK (study_year ~ '^\d{4}-\d{4}$'),

    -- حالة الطلب
    request_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (request_status IN ('pending', 'approved', 'rejected', 'expired')),

    -- رسالة الطالب (اختيارية)
    student_message TEXT,

    -- رد المعلم (اختيارية)
    teacher_response TEXT,

    -- تاريخ الطلب
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- تاريخ الرد
    responded_at TIMESTAMP WITH TIME ZONE,

    -- تاريخ انتهاء صلاحية الطلب (7 أيام)
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),

    -- التواريخ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- تأكيد عدم تكرار الطلب لنفس الطالب في نفس الكورس
    CONSTRAINT unique_enrollment_request UNIQUE (student_id, course_id, study_year),

    -- تأكيد أن تاريخ انتهاء الصلاحية بعد تاريخ الطلب
    CONSTRAINT check_expiry_date CHECK (expires_at > requested_at)
);

-- 2. جدول تسجيل الطلاب المقبولين في الكورسات
CREATE TABLE IF NOT EXISTS student_course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بطلب التسجيل الأصلي
    enrollment_request_id UUID NOT NULL REFERENCES course_enrollment_requests(id) ON DELETE CASCADE,

    -- ربط بالطالب
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالمعلم
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالكورس
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- ربط بالاشتراك النشط للمعلم
    teacher_subscription_id UUID NOT NULL REFERENCES teacher_subscriptions(id) ON DELETE CASCADE,

    -- السنة الدراسية
    study_year VARCHAR(9) NOT NULL CHECK (study_year ~ '^\d{4}-\d{4}$'),

    -- حالة التسجيل
    enrollment_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (enrollment_status IN ('active', 'completed', 'cancelled', 'expired', 'suspended')),

    -- تاريخ بداية التسجيل
    enrollment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- تاريخ بداية الكورس
    course_start_date DATE NOT NULL,

    -- تاريخ انتهاء الكورس
    course_end_date DATE NOT NULL,

    -- المبلغ الإجمالي للكورس
    total_course_amount DECIMAL(10,2) NOT NULL CHECK (total_course_amount > 0),

    -- مبلغ الحجز الأولي (غير قابل للاسترجاع)
    reservation_amount DECIMAL(10,2) DEFAULT 0.00 CHECK (reservation_amount >= 0),

    -- المبلغ المتبقي بعد الحجز
    remaining_amount DECIMAL(10,2) GENERATED ALWAYS AS (total_course_amount - reservation_amount) STORED,

    -- التواريخ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- تأكيد عدم تكرار التسجيل لنفس الطالب في نفس الكورس
    CONSTRAINT unique_student_course_enrollment UNIQUE (student_id, course_id, study_year),

    -- تأكيد أن تاريخ انتهاء الكورس بعد تاريخ البداية
    CONSTRAINT check_course_dates CHECK (course_end_date > course_start_date),

    -- تأكيد أن مبلغ الحجز لا يتجاوز المبلغ الإجمالي
    CONSTRAINT check_reservation_amount CHECK (reservation_amount <= total_course_amount)
);

-- 3. جدول الفواتير
CREATE TABLE IF NOT EXISTS course_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بالتسجيل
    enrollment_id UUID NOT NULL REFERENCES student_course_enrollments(id) ON DELETE CASCADE,

    -- ربط بالطالب
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالمعلم
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالكورس
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- رقم الفاتورة
    invoice_number VARCHAR(50) UNIQUE NOT NULL,

    -- نوع الفاتورة
    invoice_type VARCHAR(20) NOT NULL DEFAULT 'course'
        CHECK (invoice_type IN ('reservation', 'course', 'installment', 'penalty')),

    -- المبلغ المطلوب
    amount_due DECIMAL(10,2) NOT NULL CHECK (amount_due > 0),

    -- المبلغ المدفوع
    amount_paid DECIMAL(10,2) DEFAULT 0.00 CHECK (amount_paid >= 0),

    -- المبلغ المتبقي
    amount_remaining DECIMAL(10,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,

    -- حالة الفاتورة
    invoice_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (invoice_status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),

    -- تاريخ إنشاء الفاتورة
    invoice_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- تاريخ استحقاق الدفع
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,

    -- تاريخ الدفع الكامل
    paid_date TIMESTAMP WITH TIME ZONE,

    -- ملاحظات
    notes TEXT,

    -- التواريخ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- تأكيد أن تاريخ الاستحقاق بعد تاريخ الإنشاء
    CONSTRAINT check_due_date CHECK (due_date > invoice_date),

    -- تأكيد أن المبلغ المدفوع لا يتجاوز المبلغ المطلوب
    CONSTRAINT check_amount_paid CHECK (amount_paid <= amount_due)
);

-- 4. جدول نظام الدفع والاقساط
CREATE TABLE IF NOT EXISTS payment_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بالفاتورة
    invoice_id UUID NOT NULL REFERENCES course_invoices(id) ON DELETE CASCADE,

    -- رقم القسط
    installment_number INTEGER NOT NULL,

    -- المبلغ المطلوب للقسط
    installment_amount DECIMAL(10,2) NOT NULL CHECK (installment_amount > 0),

    -- المبلغ المدفوع للقسط
    amount_paid DECIMAL(10,2) DEFAULT 0.00 CHECK (amount_paid >= 0),

    -- تاريخ استحقاق القسط
    due_date DATE NOT NULL,

    -- تاريخ دفع القسط
    paid_date DATE,

    -- حالة القسط
    installment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (installment_status IN ('pending', 'partial', 'paid', 'overdue')),

    -- طريقة الدفع
    payment_method VARCHAR(20)
        CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'mobile_payment')),

    -- ملاحظات الدفع
    payment_notes TEXT,

    -- التواريخ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- تأكيد عدم تكرار رقم القسط في نفس الفاتورة
    CONSTRAINT unique_installment_per_invoice UNIQUE (invoice_id, installment_number),

    -- تأكيد أن المبلغ المدفوع لا يتجاوز مبلغ القسط
    CONSTRAINT check_installment_amount CHECK (amount_paid <= installment_amount)
);

-- =====================================================
-- إنشاء الفهارس لتحسين الأداء
-- =====================================================

-- فهارس طلبات التسجيل
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_student_id ON course_enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_teacher_id ON course_enrollment_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_course_id ON course_enrollment_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON course_enrollment_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_expires ON course_enrollment_requests(expires_at);

-- فهارس التسجيلات
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON student_course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_teacher_id ON student_course_enrollments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON student_course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_subscription_id ON student_course_enrollments(teacher_subscription_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON student_course_enrollments(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_enrollments_dates ON student_course_enrollments(course_start_date, course_end_date);

-- فهارس الفواتير
CREATE INDEX IF NOT EXISTS idx_invoices_enrollment_id ON course_invoices(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON course_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_teacher_id ON course_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON course_invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON course_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON course_invoices(invoice_number);

-- فهارس الأقساط
CREATE INDEX IF NOT EXISTS idx_installments_invoice_id ON payment_installments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON payment_installments(installment_status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON payment_installments(due_date);

-- =====================================================
-- التريجرات والدوال المساعدة
-- =====================================================

-- تريجر لتحديث وقت التعديل
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق التريجر على جميع الجداول
CREATE TRIGGER update_enrollment_requests_updated_at
    BEFORE UPDATE ON course_enrollment_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at
    BEFORE UPDATE ON student_course_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON course_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installments_updated_at
    BEFORE UPDATE ON payment_installments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- دالة للتحقق من عدد الطلاب المسموح به للمعلم
CREATE OR REPLACE FUNCTION check_teacher_student_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_student_count INTEGER;
    max_students_allowed INTEGER;
    teacher_subscription_record RECORD;
BEGIN
    -- الحصول على معلومات الاشتراك النشط للمعلم
    SELECT ts.*, sp.max_students
    INTO teacher_subscription_record
    FROM teacher_subscriptions ts
    JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
    WHERE ts.teacher_id = NEW.teacher_id
    AND ts.is_active = TRUE
    AND CURRENT_TIMESTAMP BETWEEN ts.start_date AND ts.end_date;

    -- إذا لم يكن هناك اشتراك نشط، رفض التسجيل
    IF teacher_subscription_record.id IS NULL THEN
        RAISE EXCEPTION 'المعلم ليس لديه اشتراك نشط';
    END IF;

    -- حساب عدد الطلاب الحاليين
    SELECT COUNT(*)
    INTO current_student_count
    FROM student_course_enrollments
    WHERE teacher_id = NEW.teacher_id
    AND enrollment_status IN ('active', 'completed')
    AND deleted_at IS NULL;

    -- التحقق من الحد الأقصى
    IF current_student_count >= teacher_subscription_record.max_students THEN
        RAISE EXCEPTION 'تم الوصول للحد الأقصى من الطلاب المسموح به (%s). يرجى الترقية لباقة أعلى',
                       teacher_subscription_record.max_students;
    END IF;

    -- تحديث معرف الاشتراك في التسجيل
    NEW.teacher_subscription_id = teacher_subscription_record.id;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق التريجر على التسجيلات الجديدة
CREATE TRIGGER check_student_limit_trigger
    BEFORE INSERT ON student_course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION check_teacher_student_limit();

-- دالة لحساب عدد الطلاب الحاليين لكل معلم
CREATE OR REPLACE FUNCTION get_teacher_current_students(teacher_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    student_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO student_count
    FROM student_course_enrollments
    WHERE teacher_id = teacher_uuid
    AND enrollment_status IN ('active', 'completed')
    AND deleted_at IS NULL;

    RETURN COALESCE(student_count, 0);
END;
$$ language 'plpgsql';

-- دالة للتحقق من إمكانية إضافة طالب جديد
CREATE OR REPLACE FUNCTION can_teacher_add_student(teacher_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    SELECT get_teacher_current_students(teacher_uuid), sp.max_students
    INTO current_count, max_allowed
    FROM teacher_subscriptions ts
    JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
    WHERE ts.teacher_id = teacher_uuid
    AND ts.is_active = TRUE
    AND CURRENT_TIMESTAMP BETWEEN ts.start_date AND ts.end_date;

    RETURN current_count < max_allowed;
END;
$$ language 'plpgsql';

-- دالة لتحديث حالة الفاتورة تلقائياً
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
    -- تحديث حالة الفاتورة بناءً على المبلغ المدفوع
    IF NEW.amount_paid >= NEW.amount_due THEN
        NEW.invoice_status := 'paid';
        NEW.paid_date := CURRENT_TIMESTAMP;
    ELSIF NEW.amount_paid > 0 THEN
        NEW.invoice_status := 'partial';
    ELSE
        NEW.invoice_status := 'pending';
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق التريجر لتحديث حالة الفاتورة
CREATE TRIGGER update_invoice_status_trigger
    BEFORE UPDATE ON course_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_status();

-- دالة لتحديث حالة القسط تلقائياً
CREATE OR REPLACE FUNCTION update_installment_status()
RETURNS TRIGGER AS $$
BEGIN
    -- تحديث حالة القسط بناءً على المبلغ المدفوع
    IF NEW.amount_paid >= NEW.installment_amount THEN
        NEW.installment_status := 'paid';
        NEW.paid_date := CURRENT_DATE;
    ELSIF NEW.amount_paid > 0 THEN
        NEW.installment_status := 'partial';
    ELSE
        NEW.installment_status := 'pending';
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق التريجر لتحديث حالة القسط
CREATE TRIGGER update_installment_status_trigger
    BEFORE UPDATE ON payment_installments
    FOR EACH ROW
    EXECUTE FUNCTION update_installment_status();

-- =====================================================
-- إضافة تعليقات توضيحية
-- =====================================================

COMMENT ON TABLE course_enrollment_requests IS 'جدول طلبات التسجيل في الكورسات - المرحلة الأولى';
COMMENT ON TABLE student_course_enrollments IS 'جدول تسجيل الطلاب المقبولين في الكورسات - المرحلة الثانية';
COMMENT ON TABLE course_invoices IS 'جدول الفواتير للكورسات والمدفوعات';
COMMENT ON TABLE payment_installments IS 'جدول نظام الدفع بالاقساط';

COMMENT ON COLUMN course_enrollment_requests.request_status IS 'حالة الطلب: pending, approved, rejected, expired';
COMMENT ON COLUMN student_course_enrollments.enrollment_status IS 'حالة التسجيل: active, completed, cancelled, expired, suspended';
COMMENT ON COLUMN course_invoices.invoice_status IS 'حالة الفاتورة: pending, partial, paid, overdue, cancelled';
COMMENT ON COLUMN payment_installments.installment_status IS 'حالة القسط: pending, partial, paid, overdue';
