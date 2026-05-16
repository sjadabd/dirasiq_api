import type { Request, Response } from 'express';

import { AttendanceModel } from '../../models/attendance.model';
import { CourseBookingModel } from '../../models/course-booking.model';
import { CourseModel } from '../../models/course.model';
import {
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../../models/notification.model';
import { SessionModel } from '../../models/session.model';
import { NotificationService } from '../../services/notification.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

// One shared OneSignal client for all session-side notifications.
const notificationService = new NotificationService({
  appId: process.env['ONESIGNAL_APP_ID'] || '',
  restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
});

const WEEKDAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const weekdayName = (d: number): string => WEEKDAY_NAMES_AR[d] ?? String(d);

const to12h = (time: string | undefined | null): string => {
  if (!time) return '';
  const [hStr, mStr] = String(time).split(':');
  let h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  const am = h < 12;
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${am ? 'صباحاً' : 'مساءً'}`;
};

const to12hFromISO = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${am ? 'صباحاً' : 'مساءً'}`;
};

const ensureOwnership = async (sessionId: string, teacherId: string) => {
  const session = await SessionModel.getById(sessionId);
  if (!session) {
    throw new ApiError(404, 'الجلسة غير موجودة', ErrorCodes.NOT_FOUND);
  }
  if (session.teacher_id !== teacherId) {
    throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
  }
  return session;
};

export class TeacherSessionController {
  // -------------------------------------------------------------------------
  // POST /api/teacher/sessions
  // -------------------------------------------------------------------------
  static async createSession(req: Request, res: Response): Promise<void> {
    const teacher = req.user;
    const payload = req.body as Record<string, any>;

    if (payload['teacher_id'] !== teacher.id) {
      throw new ApiError(403, 'صلاحيات غير كافية', ErrorCodes.FORBIDDEN);
    }

    const hasWeekdaysArray =
      Array.isArray(payload['weekdays']) && payload['weekdays'].length > 0;

    if (hasWeekdaysArray) {
      const created: any[] = [];
      const skipped: any[] = [];
      for (const dRaw of payload['weekdays']) {
        const d = Number(dRaw);
        const conflict = await SessionModel.hasConflict({
          teacherId: payload['teacher_id'],
          weekday: d,
          startTime: payload['start_time'],
          endTime: payload['end_time'],
        });
        if (conflict) {
          skipped.push({ weekday: d, reason: 'conflict' });
          continue;
        }
        const s = await SessionModel.createSession({
          course_id: payload['course_id'],
          teacher_id: payload['teacher_id'],
          title: payload['title'],
          weekday: d,
          start_time: payload['start_time'],
          end_time: payload['end_time'],
          recurrence: payload['recurrence'],
          flex_type: payload['flex_type'],
          flex_minutes: payload['flex_minutes'],
          flex_alternates: payload['flex_alternates'],
          hard_constraints: payload['hard_constraints'],
          soft_constraints: payload['soft_constraints'],
          state: payload['state'],
        });
        const confirmed = await CourseBookingModel.getConfirmedStudentIdsByCourse(payload['course_id']);
        const provided = Array.isArray(payload['studentIds']) ? payload['studentIds'] : [];
        const unique = Array.from(new Set([...confirmed, ...provided].map(String)));
        if (unique.length > 0) {
          await SessionModel.addAttendees(s.id, unique);
        }
        created.push(s);
      }

      if (created.length > 0) {
        try {
          const studentIds = await CourseBookingModel.getConfirmedStudentIdsByCourse(payload['course_id']);
          if (studentIds.length > 0) {
            const dayNames = created.map((s) => weekdayName(Number(s.weekday))).join(', ');
            await notificationService.createAndSendNotification({
              title: 'تم إنشاء جدول الدروس',
              message: `تمت إضافة جلسات جديدة لأيام: ${dayNames} من ${to12h(payload['start_time'])} إلى ${to12h(payload['end_time'])}`,
              type: NotificationType.COURSE_UPDATE,
              priority: NotificationPriority.HIGH,
              recipientType: RecipientType.SPECIFIC_STUDENTS,
              recipientIds: studentIds,
              data: {
                courseId: payload['course_id'],
                sessionIds: created.map((s) => s.id),
              },
              createdBy: String(teacher.id),
            });
          }
        } catch (err) {
          req.log?.warn({ err }, 'session bulk-create notification failed');
        }
      }

      res.status(201).json(ok({ created, skipped }, 'تم إنشاء الجلسات'));
      return;
    }

    // Single-day path
    const weekday = Number(payload['weekday']);
    const conflict = await SessionModel.hasConflict({
      teacherId: payload['teacher_id'],
      weekday,
      startTime: payload['start_time'],
      endTime: payload['end_time'],
    });
    if (conflict) {
      throw new ApiError(
        409,
        'يوجد جلسة أخرى متداخلة لنفس المعلم في نفس اليوم',
        ErrorCodes.CONFLICT
      );
    }

    const session = await SessionModel.createSession({
      course_id: payload['course_id'],
      teacher_id: payload['teacher_id'],
      title: payload['title'],
      weekday,
      start_time: payload['start_time'],
      end_time: payload['end_time'],
      recurrence: payload['recurrence'],
      flex_type: payload['flex_type'],
      flex_minutes: payload['flex_minutes'],
      flex_alternates: payload['flex_alternates'],
      hard_constraints: payload['hard_constraints'],
      soft_constraints: payload['soft_constraints'],
      state: payload['state'],
    });

    const confirmed = await CourseBookingModel.getConfirmedStudentIdsByCourse(payload['course_id']);
    const provided = Array.isArray(payload['studentIds']) ? payload['studentIds'] : [];
    const unique = Array.from(new Set([...confirmed, ...provided].map(String)));
    if (unique.length > 0) {
      await SessionModel.addAttendees(session.id, unique);
    }

    try {
      const studentIds = await CourseBookingModel.getConfirmedStudentIdsByCourse(payload['course_id']);
      if (studentIds.length > 0) {
        const dayName = weekdayName(weekday);
        await notificationService.createAndSendNotification({
          title: 'تم إنشاء جدول الدروس',
          message: `تم إضافة جلسة جديدة: ${session.title || ''} يوم ${dayName} من ${to12h(session.start_time as any)} إلى ${to12h(session.end_time as any)}`.trim(),
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: studentIds,
          data: { courseId: session.course_id, sessionId: session.id },
          createdBy: String(teacher.id),
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'session create notification failed');
    }

    res.status(201).json(ok(session, 'تم إنشاء الجلسة'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/sessions/:id/attendance?date=YYYY-MM-DD
  // -------------------------------------------------------------------------
  static async getSessionAttendanceByDate(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    const dateISO = (req.query['date'] as string | undefined) || new Date().toISOString().substring(0, 10);

    await ensureOwnership(sessionId, teacherId);

    const rows = await AttendanceModel.getSessionAttendanceForDate(sessionId, dateISO);
    const data = rows.map((it: any) => ({
      ...it,
      checkin_at_12h: to12hFromISO(it.checkin_at),
    }));
    res.status(200).json(ok(data, 'تم جلب حضور الجلسة لليوم المحدد', { date: dateISO }));
  }

  // -------------------------------------------------------------------------
  // POST /api/teacher/sessions/:id/attendance — bulk set
  // -------------------------------------------------------------------------
  static async bulkSetSessionAttendance(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    const { date, items } = req.body as {
      date: string;
      items: Array<{ studentId: string; status: 'present' | 'absent' | 'leave' }>;
    };

    const session = await ensureOwnership(sessionId, teacherId);

    // Strict: only accept entries for students who are already attendees.
    const allowedIds = new Set(await SessionModel.listAttendeeIds(sessionId));
    const filtered = items.filter((it) => allowedIds.has(String(it.studentId)));

    const result = await AttendanceModel.bulkSetAttendanceStatuses({
      sessionId,
      courseId: session.course_id,
      teacherId: session.teacher_id,
      dateISO: String(date),
      items: filtered,
    });

    try {
      const statusText: Record<string, string> = {
        present: 'حضور',
        absent: 'غياب',
        leave: 'إجازة',
      };
      for (const it of filtered) {
        await notificationService.createAndSendNotification({
          title: 'تحديث حالة الحضور',
          message: `قام المعلم بتحديث حالتك: ${statusText[it.status]} بتاريخ ${date}`,
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [String(it.studentId)],
          data: {
            sessionId,
            courseId: session.course_id,
            teacherId: session.teacher_id,
            date,
            status: it.status,
          },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'bulk attendance notifications failed');
    }

    res.status(200).json(ok({ updated: result.updated }, 'تم تحديث حالات الحضور'));
  }

  // -------------------------------------------------------------------------
  // POST /api/teacher/sessions/:id/attendees
  // -------------------------------------------------------------------------
  static async addAttendees(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    const { studentIds } = req.body as { studentIds: string[] };

    await ensureOwnership(sessionId, teacherId);
    await SessionModel.addAttendees(sessionId, studentIds);
    res.status(200).json(ok(null, 'تم إضافة الطلاب إلى الجلسة'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/sessions/:id/attendees
  // -------------------------------------------------------------------------
  static async listAttendees(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    await ensureOwnership(sessionId, teacherId);
    const attendees = await SessionModel.listAttendeesDetailed(sessionId);
    res.status(200).json(ok(attendees, 'تم جلب الطلاب'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/sessions/courses/:courseId/confirmed-students
  // -------------------------------------------------------------------------
  static async getConfirmedStudentsByCourse(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const courseId = req.params['courseId'] as string;

    const course = await CourseModel.findByIdAndTeacher(courseId, teacherId);
    if (!course) {
      throw new ApiError(
        404,
        'الكورس غير موجود أو الوصول مرفوض',
        ErrorCodes.NOT_FOUND
      );
    }

    const students = await CourseBookingModel.getConfirmedStudentsDetailedByCourse(courseId);
    const data = students.map((s) => ({
      id: s.student_id,
      name: s.student_name,
      gradeId: s.grade_id,
      gradeName: s.grade_name,
      studyYear: s.study_year,
    }));
    res.status(200).json(ok(data, 'تم جلب الطلاب المؤكدين للكورس'));
  }

  // -------------------------------------------------------------------------
  // DELETE /api/teacher/sessions/:id/attendees
  // -------------------------------------------------------------------------
  static async removeAttendees(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    const { studentIds } = req.body as { studentIds: string[] };
    await ensureOwnership(sessionId, teacherId);
    const removed = await SessionModel.removeAttendees(sessionId, studentIds);
    res.status(200).json(ok({ removed }, 'تم حذف الطلاب من الجلسة'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/sessions
  // -------------------------------------------------------------------------
  static async listMySessions(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      weekday?: number;
      courseId?: string;
    };
    const { page, limit } = parsePagination(query);
    const filters = {
      weekday: typeof query.weekday === 'number' ? query.weekday : null,
      courseId: query.courseId ?? null,
    };

    const { sessions, total } = await SessionModel.getTeacherSessions(teacherId, page, limit, filters);
    const displaySessions = sessions.map((s: any) => ({
      ...s,
      start_time_24h: s.start_time,
      end_time_24h: s.end_time,
      start_time: to12h(s.start_time),
      end_time: to12h(s.end_time),
    }));
    res
      .status(200)
      .json(paginated(displaySessions, buildPaginationMeta(total, page, limit), 'تم جلب الجلسات'));
  }

  // -------------------------------------------------------------------------
  // PUT /api/teacher/sessions/:id
  // -------------------------------------------------------------------------
  static async updateSession(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const existing = await ensureOwnership(id, teacherId);
    const payload = req.body as Record<string, any>;

    const useWeekday = payload['weekday'] !== undefined ? Number(payload['weekday']) : existing.weekday;
    const useStart = payload['start_time'] ?? (existing.start_time as any);
    const useEnd = payload['end_time'] ?? (existing.end_time as any);

    const conflict = await SessionModel.hasConflict({
      teacherId: existing.teacher_id,
      weekday: useWeekday,
      startTime: useStart,
      endTime: useEnd,
      excludeSessionId: id,
    });
    if (conflict) {
      throw new ApiError(409, 'يوجد جلسة أخرى متداخلة', ErrorCodes.CONFLICT);
    }

    const updated = await SessionModel.updateSession(id, payload);
    res.status(200).json(ok(updated, 'تم تحديث الجلسة'));
  }

  // -------------------------------------------------------------------------
  // DELETE /api/teacher/sessions/:id
  // -------------------------------------------------------------------------
  static async deleteSession(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await ensureOwnership(id, teacherId);
    const success = await SessionModel.softDeleteSession(id);
    if (!success) {
      throw new ApiError(404, 'الجلسة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(null, 'تم حذف الجلسة'));
  }

  // -------------------------------------------------------------------------
  // POST /api/teacher/sessions/:id/end
  // -------------------------------------------------------------------------
  static async endSessionAndNotify(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['id'] as string;
    const session = await ensureOwnership(sessionId, teacherId);

    const occurredOnISO = new Date().toISOString().substring(0, 10);
    const studentIds = await AttendanceModel.getCheckedInStudentIds(sessionId, occurredOnISO);

    try {
      if (studentIds.length > 0) {
        await notificationService.createAndSendNotification({
          title: 'انتهت المحاضرة',
          message: 'تم إنهاء المحاضرة. شكراً لحضوركم',
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: studentIds,
          data: {
            sessionId: session.id,
            courseId: session.course_id,
            teacherId: session.teacher_id,
            endedAt: new Date().toISOString(),
          },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'session end notification failed');
    }

    res.status(200).json(ok(null, 'تم إنهاء الجلسة وإشعار الطلاب'));
  }
}
