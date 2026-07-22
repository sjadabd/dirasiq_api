import { CourseModel } from '../../models/course.model';
import { GradeModel } from '../../models/grade.model';
import {
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../../models/notification.model';
import { SubjectModel } from '../../models/subject.model';
import { UserModel } from '../../models/user.model';
import { NotificationService } from '../../services/notification.service';
import type { Course, CreateCourseRequest, UpdateCourseRequest } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ImageService } from '../../utils/image.service';
import { logger } from '../../utils/logger';
import { AcademicYearService } from '../super_admin/academic-year.service';

const YEAR_PATTERN = /^\d{4}-\d{4}$/;

const requireTeacher = async (teacherId: string) => {
  const teacher = await UserModel.findById(teacherId);
  if (!teacher || teacher.userType !== 'teacher') {
    throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
  }
  return teacher;
};

const notificationService = new NotificationService({
  appId: process.env['ONESIGNAL_APP_ID'] || '',
  restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
});

export class CourseService {
  static async create(
    teacherId: string,
    data: CreateCourseRequest
  ): Promise<{ course: Course }> {
    const teacher = await requireTeacher(teacherId);

    if (!YEAR_PATTERN.test(data.study_year)) {
      throw new ApiError(400, 'السنة الدراسية غير صحيحة', ErrorCodes.VALIDATION_ERROR);
    }

    const grade = await GradeModel.findById(data.grade_id);
    if (!grade) {
      throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
    }

    const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
    if (!subject) {
      throw new ApiError(404, 'المادة لا تنتمي للمعلم', ErrorCodes.NOT_FOUND);
    }

    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    const currentDate = new Date();
    if (endDate <= startDate) {
      throw new ApiError(
        400,
        'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (endDate <= currentDate) {
      throw new ApiError(
        400,
        'تاريخ الانتهاء يجب أن يكون في المستقبل',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (data.price < 0) {
      throw new ApiError(400, 'السعر غير صحيح', ErrorCodes.VALIDATION_ERROR);
    }

    const hasReservation = data.has_reservation === true;
    const reservationAmount = data.reservation_amount ?? null;
    if (hasReservation) {
      if (reservationAmount === null || reservationAmount === undefined) {
        throw new ApiError(
          400,
          'يجب تحديد مبلغ العربون عند تفعيل خاصية الحجز',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (reservationAmount <= 0) {
        throw new ApiError(
          400,
          'مبلغ العربون يجب أن يكون أكبر من صفر',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (reservationAmount > data.price) {
        throw new ApiError(
          400,
          'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }

    if (data.seats_count <= 0) {
      throw new ApiError(400, 'عدد المقاعد غير صحيح', ErrorCodes.VALIDATION_ERROR);
    }

    if (
      await CourseModel.courseExistsForTeacher(
        teacherId,
        data.study_year,
        data.course_name,
        data.grade_id,
        data.subject_id
      )
    ) {
      throw new ApiError(409, 'الدورة موجودة بالفعل', ErrorCodes.ALREADY_EXISTS);
    }

    let processedImages: string[] = [];
    if (data.course_images && data.course_images.length > 0) {
      try {
        processedImages = await ImageService.processCourseImages(data.course_images);
      } catch {
        throw new ApiError(
          400,
          'خطأ في معالجة الصورة',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }

    let course: Course;
    try {
      course = await CourseModel.create(teacherId, {
        ...data,
        course_images: processedImages,
        has_reservation: hasReservation,
        reservation_amount: hasReservation ? reservationAmount : null,
      });
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (
        pgError?.code === '23505' &&
        pgError?.constraint === 'unique_course_per_teacher_year_grade_subject'
      ) {
        throw new ApiError(
          409,
          'لا يمكن إنشاء الدورة لأن دورة بنفس الاسم والصف والمادة والسنة موجودة بالفعل لهذا المعلم',
          ErrorCodes.ALREADY_EXISTS
        );
      }
      throw error;
    }

    // Best-effort notification to students of the same grade + study year.
    try {
      await notificationService.createAndSendNotification({
        title: '📢 دورة جديدة متاحة',
        message: `تمت إضافة دورة جديدة: ${course.course_name}`,
        type: NotificationType.NEW_COURSE_AVAILABLE,
        priority: NotificationPriority.HIGH,
        recipientType: RecipientType.STUDENTS,
        data: {
          courseId: course.id,
          gradeId: course.grade_id,
          studyYear: course.study_year,
          teacherLocation: {
            state: (teacher as any).state,
            city: (teacher as any).city,
            suburb: (teacher as any).suburb,
          },
          course: {
            id: course.id,
            study_year: course.study_year,
            grade_id: course.grade_id,
            grade_name: grade.name,
            subject_id: course.subject_id,
            subject_name: subject.name,
            course_name: course.course_name,
            course_images: course.course_images,
            description: course.description,
            start_date: course.start_date,
            end_date: course.end_date,
            price: course.price,
            seats_count: course.seats_count,
            has_reservation: course.has_reservation,
            reservation_amount: course.reservation_amount,
            teacher: { id: teacherId, name: teacher.name },
          },
        },
        createdBy: teacherId,
      });
    } catch (notifyErr) {
      logger.warn({ err: notifyErr }, 'course creation notification failed');
    }

    return { course };
  }

  static async listNamesForActiveYear(
    teacherId: string
  ): Promise<Array<{ id: string; name: string }>> {
    await requireTeacher(teacherId);
    const studyYear = (await AcademicYearService.getActive())?.academicYear?.year;
    if (!studyYear) {
      throw new ApiError(404, 'لا توجد سنة دراسية مفعلة', ErrorCodes.NOT_FOUND);
    }
    const rows = await CourseModel.findNamesByTeacherAndYear(teacherId, studyYear);
    return rows.map((r) => ({ id: r.id, name: r.course_name }));
  }

  static async getAllByTeacher(
    teacherId: string,
    page = 1,
    limit = 10,
    search?: string,
    studyYear?: string,
    gradeId?: string,
    subjectId?: string,
    deleted?: boolean
  ): Promise<{ items: Course[]; total: number }> {
    await requireTeacher(teacherId);
    const result = await CourseModel.findAllByTeacher(
      teacherId,
      page,
      limit,
      search,
      studyYear,
      gradeId,
      subjectId,
      deleted
    );
    return { items: result.courses, total: result.total };
  }

  static async getById(id: string, teacherId: string): Promise<{ course: any }> {
    const course = await CourseModel.findByIdWithRelations(id, teacherId);
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return {
      course: {
        ...course,
        grade: { id: course.grade_id, name: (course as any).grade_name },
        subject: { id: course.subject_id, name: (course as any).subject_name },
      },
    };
  }

  static async update(
    id: string,
    teacherId: string,
    data: UpdateCourseRequest
  ): Promise<{ course: Course }> {
    const existingCourse = await CourseModel.findByIdAndTeacher(id, teacherId);
    if (!existingCourse) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    if (data.study_year !== undefined && !YEAR_PATTERN.test(data.study_year)) {
      throw new ApiError(400, 'السنة الدراسية غير صحيحة', ErrorCodes.VALIDATION_ERROR);
    }
    if (data.grade_id) {
      if (!(await GradeModel.findById(data.grade_id))) {
        throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
      }
    }
    if (data.subject_id) {
      const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
      if (!subject) {
        throw new ApiError(404, 'المادة لا تنتمي للمعلم', ErrorCodes.NOT_FOUND);
      }
    }

    const currentDate = new Date();
    if (data.start_date && data.end_date) {
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      if (endDate <= startDate) {
        throw new ApiError(
          400,
          'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (endDate <= currentDate) {
        throw new ApiError(
          400,
          'تاريخ الانتهاء يجب أن يكون في المستقبل',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    } else if (data.end_date) {
      const endDate = new Date(data.end_date);
      const existingStartDate = new Date(existingCourse.start_date);
      if (endDate <= existingStartDate) {
        throw new ApiError(
          400,
          'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (endDate <= currentDate) {
        throw new ApiError(
          400,
          'تاريخ الانتهاء يجب أن يكون في المستقبل',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    } else if (data.start_date) {
      const startDate = new Date(data.start_date);
      const existingEndDate = new Date(existingCourse.end_date);
      if (existingEndDate <= startDate) {
        throw new ApiError(
          400,
          'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }

    if (data.price !== undefined && data.price < 0) {
      throw new ApiError(400, 'السعر غير صحيح', ErrorCodes.VALIDATION_ERROR);
    }

    const effectivePrice = data.price !== undefined ? data.price : existingCourse.price;
    if (data.has_reservation === true) {
      const resAmount =
        data.reservation_amount !== undefined
          ? data.reservation_amount
          : existingCourse.reservation_amount;
      if (resAmount === null || resAmount === undefined) {
        throw new ApiError(
          400,
          'يجب تحديد مبلغ العربون عند تفعيل خاصية الحجز',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (resAmount <= 0) {
        throw new ApiError(
          400,
          'مبلغ العربون يجب أن يكون أكبر من صفر',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (resAmount > effectivePrice) {
        throw new ApiError(
          400,
          'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }
    if (data.reservation_amount !== undefined && data.reservation_amount !== null) {
      if (data.reservation_amount <= 0) {
        throw new ApiError(
          400,
          'مبلغ العربون يجب أن يكون أكبر من صفر',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (data.reservation_amount > effectivePrice) {
        throw new ApiError(
          400,
          'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }

    if (data.seats_count !== undefined && data.seats_count <= 0) {
      throw new ApiError(400, 'عدد المقاعد غير صحيح', ErrorCodes.VALIDATION_ERROR);
    }

    if (data.course_name && data.course_name !== existingCourse.course_name) {
      const studyYear = data.study_year || existingCourse.study_year;
      const gradeId = data.grade_id || existingCourse.grade_id;
      const subjectId = data.subject_id || existingCourse.subject_id;
      if (
        await CourseModel.courseExistsForTeacher(
          teacherId,
          studyYear,
          data.course_name,
          gradeId,
          subjectId,
          id
        )
      ) {
        throw new ApiError(409, 'الدورة موجودة بالفعل', ErrorCodes.ALREADY_EXISTS);
      }
    }

    let processedImages: string[] = existingCourse.course_images;
    if (data.course_images) {
      try {
        processedImages = await ImageService.updateCourseImages(
          data.course_images,
          existingCourse.course_images
        );
      } catch {
        throw new ApiError(
          400,
          'خطأ في معالجة الصورة',
          ErrorCodes.VALIDATION_ERROR
        );
      }
    }

    const updateData = {
      ...data,
      course_images: processedImages,
      ...(data.has_reservation === false ? { reservation_amount: null } : {}),
    } as UpdateCourseRequest;
    const course = await CourseModel.update(id, teacherId, updateData);
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { course };
  }

  static async delete(id: string, teacherId: string): Promise<void> {
    const existingCourse = await CourseModel.findByIdAndTeacher(id, teacherId);
    if (!existingCourse) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    // Finished courses stay in archive — they are not soft-deleted.
    if (CourseModel.isEnded(existingCourse)) {
      throw new ApiError(
        400,
        'لا يمكن حذف كورس منتهٍ — يظهر في الأرشيف (المنتهية) للأستاذ والطلاب المسجلين',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const data = await CourseModel.hasBlockingData(id);
    if (data.students > 0) {
      throw new ApiError(
        400,
        'لا يمكن حذف الكورس لأنه يحتوي على طلاب مسجلين أو طلبات حجز نشطة',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.invoices > 0) {
      throw new ApiError(
        400,
        'لا يمكن حذف الكورس لأنه يحتوي على فواتير أو بيانات مالية مرتبطة',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const deleted = await CourseModel.softDelete(id, teacherId);
    if (!deleted) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async setRegistrationOpen(
    id: string,
    teacherId: string,
    registrationOpen: boolean
  ): Promise<{ course: Course }> {
    const course = await CourseModel.setRegistrationOpen(
      id,
      teacherId,
      registrationOpen
    );
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { course };
  }

  static async getDeletedNotExpired(
    teacherId: string,
    page = 1,
    limit = 10
  ): Promise<{ items: Course[]; total: number }> {
    await requireTeacher(teacherId);
    const result = await CourseModel.findDeletedNotExpiredByTeacher(teacherId, page, limit);
    return { items: result.courses, total: result.total };
  }

  static async restore(id: string, teacherId: string): Promise<{ course: Course }> {
    await requireTeacher(teacherId);

    const deleted = await CourseModel.findDeletedByIdAndTeacher(id, teacherId);
    if (!deleted) {
      throw new ApiError(404, 'الدورة المحذوفة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (CourseModel.isEnded(deleted)) {
      throw new ApiError(
        400,
        'لا يمكن استرجاع كورس منتهٍ — يبقى في الأرشيف ضمن المنتهية',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    try {
      const restoredCourse = await CourseModel.restore(id, teacherId);
      if (!restoredCourse) {
        throw new ApiError(
          400,
          'تعذّر استرجاع الدورة — تأكد أنها محذوفة ولم ينتهِ تاريخها',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      return { course: restoredCourse };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      // Unique (teacher, year, name, grade, subject) collision after recreate
      if (err?.code === '23505') {
        throw new ApiError(
          409,
          'لا يمكن الاسترجاع لوجود كورس آخر بنفس الاسم والمرحلة والمادة لنفس السنة',
          ErrorCodes.CONFLICT
        );
      }
      throw err;
    }
  }

  /**
   * Unpaid student invoices + pending reservation deposits, grouped by course.
   * Used to nag the teacher to settle accounts before/after a course ends.
   */
  static async getFinancialAlerts(teacherId: string): Promise<{
    totals: {
      unpaidInvoiceAmount: number;
      unpaidInvoiceCount: number;
      pendingDepositAmount: number;
      pendingDepositCount: number;
      coursesWithDebt: number;
      endedCoursesWithDebt: number;
    };
    courses: Array<{
      courseId: string;
      courseName: string;
      endDate: string | null;
      isEnded: boolean;
      unpaidInvoiceAmount: number;
      unpaidInvoiceCount: number;
      pendingDepositAmount: number;
      pendingDepositCount: number;
      totalOutstanding: number;
    }>;
  }> {
    await requireTeacher(teacherId);
    const { default: pool } = await import('../../config/database');

    const [invR, depR] = await Promise.all([
      pool.query(
        `SELECT
           c.id AS course_id,
           c.course_name,
           c.end_date,
           (c.end_date < CURRENT_DATE) AS is_ended,
           COALESCE(SUM(ci.remaining_amount), 0)::float AS unpaid_invoice_amount,
           COUNT(*)::int AS unpaid_invoice_count
         FROM course_invoices ci
         JOIN courses c ON c.id = ci.course_id
         WHERE ci.teacher_id = $1
           AND ci.deleted_at IS NULL
           AND ci.invoice_status IN ('pending', 'partial', 'overdue')
           AND ci.remaining_amount > 0
           AND c.teacher_id = $1
         GROUP BY c.id, c.course_name, c.end_date`,
        [teacherId]
      ),
      pool.query(
        `SELECT
           c.id AS course_id,
           c.course_name,
           c.end_date,
           (c.end_date < CURRENT_DATE) AS is_ended,
           COALESCE(SUM(rp.amount), 0)::float AS pending_deposit_amount,
           COUNT(*)::int AS pending_deposit_count
         FROM reservation_payments rp
         JOIN courses c ON c.id = rp.course_id
         WHERE rp.teacher_id = $1
           AND rp.status = 'pending'
           AND c.teacher_id = $1
         GROUP BY c.id, c.course_name, c.end_date`,
        [teacherId]
      ),
    ]);

    type Acc = {
      courseId: string;
      courseName: string;
      endDate: string | null;
      isEnded: boolean;
      unpaidInvoiceAmount: number;
      unpaidInvoiceCount: number;
      pendingDepositAmount: number;
      pendingDepositCount: number;
      totalOutstanding: number;
    };

    const byCourse = new Map<string, Acc>();

    const upsert = (row: any, kind: 'invoice' | 'deposit') => {
      const id = String(row.course_id);
      let cur = byCourse.get(id);
      if (!cur) {
        cur = {
          courseId: id,
          courseName: String(row.course_name ?? ''),
          endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
          isEnded: row.is_ended === true,
          unpaidInvoiceAmount: 0,
          unpaidInvoiceCount: 0,
          pendingDepositAmount: 0,
          pendingDepositCount: 0,
          totalOutstanding: 0,
        };
        byCourse.set(id, cur);
      }
      if (kind === 'invoice') {
        cur.unpaidInvoiceAmount = Number(row.unpaid_invoice_amount ?? 0);
        cur.unpaidInvoiceCount = Number(row.unpaid_invoice_count ?? 0);
      } else {
        cur.pendingDepositAmount = Number(row.pending_deposit_amount ?? 0);
        cur.pendingDepositCount = Number(row.pending_deposit_count ?? 0);
      }
      cur.totalOutstanding =
        cur.unpaidInvoiceAmount + cur.pendingDepositAmount;
    };

    for (const row of invR.rows) upsert(row, 'invoice');
    for (const row of depR.rows) upsert(row, 'deposit');

    const courses = Array.from(byCourse.values()).sort((a, b) => {
      if (a.isEnded !== b.isEnded) return a.isEnded ? -1 : 1;
      return b.totalOutstanding - a.totalOutstanding;
    });

    const totals = courses.reduce(
      (acc, c) => {
        acc.unpaidInvoiceAmount += c.unpaidInvoiceAmount;
        acc.unpaidInvoiceCount += c.unpaidInvoiceCount;
        acc.pendingDepositAmount += c.pendingDepositAmount;
        acc.pendingDepositCount += c.pendingDepositCount;
        acc.coursesWithDebt += 1;
        if (c.isEnded) acc.endedCoursesWithDebt += 1;
        return acc;
      },
      {
        unpaidInvoiceAmount: 0,
        unpaidInvoiceCount: 0,
        pendingDepositAmount: 0,
        pendingDepositCount: 0,
        coursesWithDebt: 0,
        endedCoursesWithDebt: 0,
      }
    );

    return { totals, courses };
  }

  static async getCourseFinancialAlert(
    courseId: string,
    teacherId: string
  ): Promise<{
    courseId: string;
    courseName: string;
    endDate: string | null;
    isEnded: boolean;
    unpaidInvoiceAmount: number;
    unpaidInvoiceCount: number;
    pendingDepositAmount: number;
    pendingDepositCount: number;
    totalOutstanding: number;
    hasDebt: boolean;
  }> {
    await requireTeacher(teacherId);
    const course = await CourseModel.findByIdAndTeacher(courseId, teacherId);
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const { default: pool } = await import('../../config/database');
    const [invR, depR] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(remaining_amount), 0)::float AS unpaid_invoice_amount,
           COUNT(*)::int AS unpaid_invoice_count
         FROM course_invoices
         WHERE teacher_id = $1
           AND course_id = $2
           AND deleted_at IS NULL
           AND invoice_status IN ('pending', 'partial', 'overdue')
           AND remaining_amount > 0`,
        [teacherId, courseId]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(amount), 0)::float AS pending_deposit_amount,
           COUNT(*)::int AS pending_deposit_count
         FROM reservation_payments
         WHERE teacher_id = $1
           AND course_id = $2
           AND status = 'pending'`,
        [teacherId, courseId]
      ),
    ]);

    const unpaidInvoiceAmount = Number(
      invR.rows[0]?.unpaid_invoice_amount ?? 0
    );
    const unpaidInvoiceCount = Number(invR.rows[0]?.unpaid_invoice_count ?? 0);
    const pendingDepositAmount = Number(
      depR.rows[0]?.pending_deposit_amount ?? 0
    );
    const pendingDepositCount = Number(
      depR.rows[0]?.pending_deposit_count ?? 0
    );
    const totalOutstanding = unpaidInvoiceAmount + pendingDepositAmount;
    const isEnded = CourseModel.isEnded(course);

    return {
      courseId,
      courseName: String((course as any).course_name ?? ''),
      endDate: course.end_date
        ? String(course.end_date).slice(0, 10)
        : null,
      isEnded,
      unpaidInvoiceAmount,
      unpaidInvoiceCount,
      pendingDepositAmount,
      pendingDepositCount,
      totalOutstanding,
      hasDebt: totalOutstanding > 0,
    };
  }
}
