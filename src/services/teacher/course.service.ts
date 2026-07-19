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
    const restoredCourse = await CourseModel.restore(id, teacherId);
    if (!restoredCourse) {
      throw new ApiError(
        404,
        'لا يمكن استرجاع الدورة - إما أنها غير موجودة أو منتهية الصلاحية',
        ErrorCodes.NOT_FOUND
      );
    }
    return { course: restoredCourse };
  }
}
