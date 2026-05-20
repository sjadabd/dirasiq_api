// Zod schemas for /api/teacher/*.
//
// Organised by domain. Field-level error messages are Arabic-first.
// Reusable primitives come from `common.schemas.ts`; anything teacher-specific
// (course shape, booking workflow, invoice composition, notification recipient
// modes, etc.) lives here.

import { z } from 'zod';

import {
  hhmmTimeSchema,
  isoDateSchema,
  moneySchema,
  optionalBooleanQuery,
  optionalString,
  optionalStudyYear,
  optionalUuid,
  paginationQuerySchema,
  positiveMoneySchema,
  studyYearSchema,
  uuidSchema,
  weekdaySchema,
} from './common.schemas';

// =============================================================================
// Expense
// =============================================================================

export const expenseCategoryEnum = z.enum([
  'salaries', 'rent', 'utilities', 'maintenance', 'stationery', 'other',
]);
export const expensePaymentMethodEnum = z.enum([
  'cash', 'bank_transfer', 'card',
]);

export const expenseCreateSchema = z.object({
  amount: moneySchema,
  note: z.string().nullable().optional(),
  expense_date: isoDateSchema.nullable().optional(),
  category: expenseCategoryEnum.optional(),
  paymentMethod: expensePaymentMethodEnum.optional(),
});

export const expenseUpdateSchema = z.object({
  amount: moneySchema.optional(),
  note: z.string().nullable().optional(),
  expense_date: isoDateSchema.nullable().optional(),
  category: expenseCategoryEnum.optional(),
  paymentMethod: expensePaymentMethodEnum.optional(),
});

export const expenseListQuerySchema = paginationQuerySchema.extend({
  from: optionalString,
  to: optionalString,
  studyYear: optionalStudyYear,
  category: expenseCategoryEnum.optional(),
  paymentMethod: expensePaymentMethodEnum.optional(),
  search: optionalString,
  deleted: optionalBooleanQuery,
});

// =============================================================================
// Wallet
// =============================================================================

export const walletTxQuerySchema = paginationQuerySchema;

// =============================================================================
// Report
// =============================================================================

export const financialReportQuerySchema = z.object({
  from: optionalString,
  to: optionalString,
  studyYear: optionalStudyYear,
});

// =============================================================================
// Subject
// =============================================================================

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1, 'اسم المادة مطلوب'),
  description: z.string().nullable().optional(),
});

export const subjectUpdateSchema = z.object({
  name: z.string().trim().min(1, 'اسم المادة مطلوب').optional(),
  description: z.string().nullable().optional(),
});

export const subjectListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
  is_deleted: optionalBooleanQuery,
});

// =============================================================================
// Course
// =============================================================================

export const courseCreateSchema = z
  .object({
    study_year: studyYearSchema,
    grade_id: uuidSchema,
    subject_id: uuidSchema,
    course_name: z.string().trim().min(1, 'اسم الدورة مطلوب'),
    description: z.string().nullable().optional(),
    start_date: isoDateSchema,
    end_date: isoDateSchema,
    price: moneySchema,
    seats_count: z.coerce.number().int().min(1, 'عدد المقاعد غير صحيح'),
    course_images: z.array(z.string()).optional(),
    has_reservation: z.coerce.boolean().optional(),
    reservation_amount: positiveMoneySchema.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.has_reservation && (val.reservation_amount == null || val.reservation_amount <= 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'مبلغ العربون مطلوب وأكبر من صفر عند تفعيل العربون',
        path: ['reservation_amount'],
      });
    }
  });

export const courseUpdateSchema = z.object({
  study_year: studyYearSchema.optional(),
  grade_id: uuidSchema.optional(),
  subject_id: uuidSchema.optional(),
  course_name: z.string().trim().min(1, 'اسم الدورة مطلوب').optional(),
  description: z.string().nullable().optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  price: moneySchema.optional(),
  seats_count: z.coerce.number().int().min(1, 'عدد المقاعد غير صحيح').optional(),
  course_images: z.array(z.string()).optional(),
  has_reservation: z.coerce.boolean().optional(),
  reservation_amount: positiveMoneySchema.nullable().optional(),
});

export const courseListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
  study_year: optionalStudyYear,
  grade_id: optionalUuid,
  subject_id: optionalUuid,
  deleted: optionalBooleanQuery,
});

// =============================================================================
// Course booking (teacher side)
// =============================================================================

export const teacherBookingsListQuerySchema = paginationQuerySchema.extend({
  studyYear: studyYearSchema,
  status: optionalString,
});

export const bookingStatsQuerySchema = z.object({ studyYear: studyYearSchema });

export const bookingPreApproveBodySchema = z.object({
  teacherResponse: z.string().optional(),
});

export const bookingConfirmBodySchema = z.object({
  teacherResponse: z.string().optional(),
  reservationPaid: z.boolean().optional(),
});

export const bookingRejectBodySchema = z.object({
  rejectionReason: z.string().trim().min(1, 'سبب الرفض مطلوب'),
  teacherResponse: z.string().optional(),
});

export const bookingTeacherResponseBodySchema = z.object({
  teacherResponse: z.string().trim().min(1, 'رد المعلم مطلوب'),
});

export const bookingReactivateBodySchema = z.object({
  teacherResponse: z.string().optional(),
});

// =============================================================================
// Session (sessions, attendees, attendance)
// =============================================================================

const sessionBaseFields = z.object({
  course_id: uuidSchema,
  teacher_id: uuidSchema,
  title: z.string().optional(),
  start_time: hhmmTimeSchema,
  end_time: hhmmTimeSchema,
  recurrence: z.coerce.boolean().optional(),
  flex_type: z.string().optional(),
  flex_minutes: z.coerce.number().int().optional(),
  flex_alternates: z.unknown().optional(),
  hard_constraints: z.unknown().optional(),
  soft_constraints: z.unknown().optional(),
  state: z.string().optional(),
  studentIds: z.array(z.string()).optional(),
});

const checkTimeOrder = (
  startTime: string | undefined,
  endTime: string | undefined,
  ctx: z.RefinementCtx
): void => {
  if (!startTime || !endTime) return;
  const toSec = (s: string) => {
    const [h, m, sec] = s.split(':').map((x) => parseInt(x || '0', 10));
    return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
  };
  if (toSec(startTime) >= toSec(endTime)) {
    ctx.addIssue({
      code: 'custom',
      message: 'وقت البداية يجب أن يكون قبل وقت النهاية',
      path: ['end_time'],
    });
  }
};

export const sessionCreateSchema = sessionBaseFields
  .extend({
    weekday: weekdaySchema.optional(),
    weekdays: z.array(weekdaySchema).optional(),
  })
  .superRefine((val, ctx) => {
    checkTimeOrder(val.start_time, val.end_time, ctx);
    const hasArray = Array.isArray(val.weekdays) && val.weekdays.length > 0;
    if (!hasArray && val.weekday == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'weekday مطلوب عند عدم إرسال weekdays[]',
        path: ['weekday'],
      });
    }
  });

export const sessionUpdateSchema = z
  .object({
    title: z.string().nullable().optional(),
    weekday: weekdaySchema.optional(),
    start_time: hhmmTimeSchema.optional(),
    end_time: hhmmTimeSchema.optional(),
    recurrence: z.coerce.boolean().optional(),
    flex_type: z.string().optional(),
    flex_minutes: z.coerce.number().int().optional(),
    flex_alternates: z.unknown().optional(),
    hard_constraints: z.unknown().optional(),
    soft_constraints: z.unknown().optional(),
    state: z.string().optional(),
  })
  .superRefine((val, ctx) => checkTimeOrder(val.start_time, val.end_time, ctx));

export const sessionListQuerySchema = paginationQuerySchema.extend({
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  courseId: optionalUuid,
  search: optionalString,
});

export const sessionAttendeesBodySchema = z.object({
  studentIds: z.array(uuidSchema).min(1, 'قائمة الطلاب مطلوبة'),
});

export const sessionAttendanceQuerySchema = z.object({
  date: isoDateSchema.optional(),
});

export const sessionBulkAttendanceBodySchema = z.object({
  date: isoDateSchema,
  items: z
    .array(
      z.object({
        studentId: uuidSchema,
        status: z.enum(['present', 'absent', 'leave']),
      })
    )
    .min(1, 'items مطلوبة'),
});

// =============================================================================
// Assignment
// =============================================================================

const assignmentVisibilitySchema = z.enum(['all_students', 'specific_students']);
const submissionTypeSchema = z.enum(['text', 'file', 'link', 'mixed', 'paper']);

export const assignmentCreateSchema = z.object({
  course_id: uuidSchema,
  subject_id: uuidSchema.optional(),
  session_id: uuidSchema.optional(),
  title: z.string().trim().min(1, 'العنوان مطلوب'),
  description: z.string().optional(),
  assigned_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  submission_type: submissionTypeSchema.optional(),
  delivery_mode: z.enum(['paper', 'electronic', 'mixed']).optional(),
  attachments: z.unknown().optional(),
  resources: z.unknown().optional(),
  max_score: z.coerce.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
  visibility: assignmentVisibilitySchema.optional(),
  study_year: studyYearSchema.optional(),
  grade_id: uuidSchema.optional(),
  recipients: z
    .object({ studentIds: z.array(uuidSchema).optional() })
    .optional(),
});

export const assignmentUpdateSchema = z.object({
  course_id: uuidSchema.optional(),
  subject_id: uuidSchema.optional(),
  session_id: uuidSchema.optional(),
  title: z.string().trim().min(1, 'العنوان مطلوب').optional(),
  description: z.string().optional(),
  assigned_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  submission_type: submissionTypeSchema.optional(),
  delivery_mode: z.enum(['paper', 'electronic', 'mixed']).optional(),
  attachments: z.unknown().optional(),
  resources: z.unknown().optional(),
  max_score: z.coerce.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
  visibility: assignmentVisibilitySchema.optional(),
  grade_id: uuidSchema.optional(),
});

export const assignmentListQuerySchema = paginationQuerySchema;

export const assignmentRecipientsBodySchema = z.object({
  studentIds: z.array(uuidSchema),
});

export const assignmentGradeBodySchema = z.object({
  score: z.coerce.number(),
  feedback: z.string().optional(),
});

// =============================================================================
// Exam
// =============================================================================

const examTypeSchema = z.enum(['daily', 'monthly']);

export const examCreateSchema = z.object({
  course_id: uuidSchema,
  subject_id: uuidSchema,
  sessionIds: z.array(uuidSchema).optional(),
  exam_date: isoDateSchema,
  exam_type: examTypeSchema,
  max_score: z.coerce.number().positive('الدرجة القصوى يجب أن تكون أكبر من صفر'),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const examUpdateSchema = z.object({
  course_id: uuidSchema.optional(),
  subject_id: uuidSchema.optional(),
  exam_date: isoDateSchema.optional(),
  exam_type: examTypeSchema.optional(),
  max_score: z.coerce.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const examListQuerySchema = paginationQuerySchema.extend({
  type: examTypeSchema.optional(),
});

export const examStudentsQuerySchema = z.object({
  sessionId: optionalUuid,
});

export const examGradeBodySchema = z.object({
  score: z.coerce.number(),
});

// =============================================================================
// Student evaluation
// =============================================================================

// Enum strings match the DB CHECK constraint on student_evaluations
// (migration 023). NEVER change this without a DB migration.
const evaluationLevelSchema = z.enum(['excellent', 'very_good', 'good', 'fair', 'weak']);

const evaluationItemSchema = z.object({
  student_id: uuidSchema,
  scientific_level: evaluationLevelSchema.optional(),
  behavioral_level: evaluationLevelSchema.optional(),
  attendance_level: evaluationLevelSchema.optional(),
  homework_preparation: evaluationLevelSchema.optional(),
  participation_level: evaluationLevelSchema.optional(),
  instruction_following: evaluationLevelSchema.optional(),
  guidance: z.string().optional(),
  notes: z.string().optional(),
});

export const evaluationBulkUpsertSchema = z.object({
  eval_date: isoDateSchema,
  items: z.array(evaluationItemSchema).min(1, 'items مطلوبة'),
});

export const evaluationUpdateSchema = z.object({
  scientific_level: evaluationLevelSchema.optional(),
  behavioral_level: evaluationLevelSchema.optional(),
  attendance_level: evaluationLevelSchema.optional(),
  homework_preparation: evaluationLevelSchema.optional(),
  participation_level: evaluationLevelSchema.optional(),
  instruction_following: evaluationLevelSchema.optional(),
  guidance: z.string().optional(),
  notes: z.string().optional(),
});

export const evaluationListQuerySchema = paginationQuerySchema.extend({
  studentId: optionalUuid,
  from: optionalString,
  to: optionalString,
});

export const evaluationStudentsWithEvalQuerySchema = paginationQuerySchema
  .extend({
    date: isoDateSchema,
    courseId: optionalUuid,
    sessionId: optionalUuid,
  })
  .superRefine((val, ctx) => {
    if (!val.courseId && !val.sessionId) {
      ctx.addIssue({
        code: 'custom',
        message: 'الفلترة مطلوبة عبر courseId أو sessionId',
        path: ['courseId'],
      });
    }
  });

// =============================================================================
// Notification (teacher inbox + create)
// =============================================================================

const notificationRecipientModeSchema = z.enum([
  'specific_students',
  'students_of_course',
  'students_of_session',
  'all_students_of_teacher',
]);

export const teacherNotificationListQuerySchema = paginationQuerySchema.extend({
  q: optionalString,
  type: optionalString,
  courseId: optionalUuid,
  subType: optionalString,
});

export const teacherNotificationCreateSchema = z.object({
  type: z.string().trim().min(1, 'type مطلوب'),
  subType: z.string().optional(),
  title: z.string().trim().min(1, 'العنوان مطلوب'),
  message: z.string().trim().min(1, 'الرسالة مطلوبة'),
  courseId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  link: z.string().url().optional().or(z.literal('')),
  recipients: z.object({
    mode: notificationRecipientModeSchema,
    studentIds: z.array(uuidSchema).optional(),
  }),
  attachments: z
    .object({
      pdfBase64: z.string().optional(),
      imagesBase64: z.array(z.string()).optional(),
    })
    .optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

// =============================================================================
// Roster
// =============================================================================

export const rosterListQuerySchema = paginationQuerySchema.extend({
  q: optionalString,
});

export const rosterSessionNamesQuerySchema = z.object({
  courseId: optionalUuid,
});

// =============================================================================
// Invoice (simplified 2026-05-17)
//
// Backwards-compat note: the legacy `invoiceType` enum had 4 values
// (reservation / course / installment / penalty). In practice only `course`
// (tuition) was used and route logic treated them identically. Reservation
// deposits live in `reservation_payments` (different table + endpoint).
// We keep the column tolerant of any 20-char string at the DB layer; the
// service forces 'course' for everything created via this teacher surface.
// =============================================================================

const paymentModeSchema = z.enum(['cash', 'installments']);
const paymentMethodSchema = z.enum(['cash', 'bank_transfer', 'credit_card', 'mobile_payment']);
const invoiceStatusSchema = z.enum(['pending', 'partial', 'paid', 'overdue', 'cancelled']);

// Manual installment row (advanced path — most teachers will use auto-split).
const installmentManualSchema = z.object({
  plannedAmount: positiveMoneySchema,
  dueDate: isoDateSchema,
  notes: z.string().optional(),
});

export const invoiceCreateSchema = z
  .object({
    studentId: uuidSchema,
    courseId: uuidSchema,
    studyYear: studyYearSchema,
    paymentMode: paymentModeSchema,
    amountDue: positiveMoneySchema,

    // Optional metadata
    invoiceDate: isoDateSchema.optional(),
    dueDate: isoDateSchema.optional(),
    discountAmount: moneySchema.optional(),
    notes: z.string().optional(),

    // === INSTALLMENT PLAN — two ways ===
    // (A) Auto-split: server divides amountDue across N evenly-spaced installments.
    installmentsCount: z.coerce.number().int().min(2).max(36).optional(),
    installmentIntervalDays: z.coerce.number().int().min(1).max(365).default(30).optional(),
    installmentFirstDueDate: isoDateSchema.optional(),
    // (B) Manual: caller provides each row (uncommon — for irregular plans).
    installments: z.array(installmentManualSchema).optional(),
  })
  .refine(
    (d) =>
      d.paymentMode !== 'installments'
      || (Array.isArray(d.installments) && d.installments.length >= 2)
      || (typeof d.installmentsCount === 'number' && d.installmentsCount >= 2),
    {
      message: 'لخطة الأقساط: أعطِ installmentsCount (>= 2) أو installments[]',
      path: ['installmentsCount'],
    },
  );

// Targeted update — meta only (dates + notes). No mode/amount/installments changes.
// To change those, soft-delete and recreate.
export const invoiceUpdateMetaSchema = z
  .object({
    invoiceDate: isoDateSchema.nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'لا يوجد حقول للتحديث' });

// Set the discount to an exact amount (replaces the previous additive POST /discounts).
export const invoiceUpdateDiscountSchema = z.object({
  discountAmount: moneySchema,
});

// Add a payment — supports PARTIAL payments (used to be full-only).
export const invoicePaymentBodySchema = z.object({
  amount: positiveMoneySchema,
  paymentMethod: paymentMethodSchema,
  installmentId: uuidSchema.nullable().optional(),
  paidAt: z.string().optional(),
  notes: z.string().nullable().optional(),
});

// List + filters. Extras: studentId / courseId / paymentMode for faster queries.
export const invoiceListQuerySchema = paginationQuerySchema.extend({
  studyYear: studyYearSchema,
  status: invoiceStatusSchema.optional(),
  studentId: optionalUuid,
  courseId: optionalUuid,
  paymentMode: paymentModeSchema.optional(),
  deleted: z.enum(['true', 'false', 'all']).optional(),
  search: optionalString,
});

export const invoiceSummaryQuerySchema = z.object({
  studyYear: studyYearSchema,
  status: invoiceStatusSchema.optional(),
  deleted: z.enum(['true', 'false', 'all']).optional(),
});

// =============================================================================
// Payment (reservation payments + Wayl links)
// =============================================================================

export const reservationListQuerySchema = paginationQuerySchema.extend({
  studyYear: studyYearSchema,
});

export const reservationReportQuerySchema = z.object({
  studyYear: studyYearSchema,
});

export const waylSubscriptionLinkSchema = z.object({
  packageId: uuidSchema,
});

export const waylWalletTopupLinkSchema = z.object({
  amount: positiveMoneySchema.min(1000, 'الحد الأدنى للدفع عبر Wayl هو 1000 دينار'),
});
