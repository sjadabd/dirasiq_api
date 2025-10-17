import { Request, Response } from 'express';
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

export class TeacherSessionController {
  // Helpers: format time to 12-hour with Arabic AM/PM
  private static to12h(time: string): string {
    // time like HH:MM or HH:MM:SS
    if (!time) return '';
    const [hStr, mStr] = String(time).split(':');
    let h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    const am = h < 12;
    h = h % 12;
    if (h === 0) h = 12;
    const mm = m.toString().padStart(2, '0');
    return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
  }

  private static to12hFromISO(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    let h = d.getHours();
    const m = d.getMinutes();
    const am = h < 12;
    h = h % 12;
    if (h === 0) h = 12;
    const mm = m.toString().padStart(2, '0');
    return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
  }
  // POST /api/teacher/sessions
  static async createSession(req: Request, res: Response): Promise<void> {
    try {
      const teacher = req.user;
      if (!teacher || teacher.id !== req.body.teacher_id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }

      const payload = req.body || {};
      // Support either single weekday or multiple weekdays
      const hasWeekdaysArray =
        Array.isArray(payload.weekdays) && payload.weekdays.length > 0;
      const required = ['course_id', 'teacher_id', 'start_time', 'end_time'];
      for (const k of required) {
        if (payload[k] === undefined || payload[k] === null) {
          res.status(400).json({
            success: false,
            message: 'بيانات ناقصة',
            errors: [`حقل ${k} مطلوب`],
          });
          return;
        }
      }
      if (
        !hasWeekdaysArray &&
        (payload.weekday === undefined || payload.weekday === null)
      ) {
        res.status(400).json({
          success: false,
          message: 'بيانات ناقصة',
          errors: ['weekday مطلوب عند عدم إرسال weekdays[]'],
        });
        return;
      }

      // Basic validations
      const validateWeekday = (d: any) =>
        Number.isInteger(d) && d >= 0 && d <= 6;
      if (hasWeekdaysArray) {
        const invalid = payload.weekdays.some(
          (d: any) => !validateWeekday(Number(d))
        );
        if (invalid) {
          res.status(400).json({
            success: false,
            message: 'قيمة يوم الأسبوع غير صحيحة',
            errors: ['weekdays يجب أن تحتوي قيم بين 0 و 6'],
          });
          return;
        }
      } else {
        const weekday = Number(payload.weekday);
        if (!validateWeekday(weekday)) {
          res.status(400).json({
            success: false,
            message: 'قيمة يوم الأسبوع غير صحيحة',
            errors: ['weekday يجب أن يكون بين 0 و 6'],
          });
          return;
        }
      }
      const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
      if (!timeRe.test(payload.start_time) || !timeRe.test(payload.end_time)) {
        res.status(400).json({
          success: false,
          message: 'صيغة الوقت غير صحيحة',
          errors: ['start_time/end_time يجب أن تكون HH:MM أو HH:MM:SS'],
        });
        return;
      }
      const toSec = (s: string) => {
        const [h, m, sec] = String(s)
          .split(':')
          .map(x => parseInt(x, 10));
        return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
      };
      if (toSec(payload.start_time) >= toSec(payload.end_time)) {
        res.status(400).json({
          success: false,
          message: 'الوقت غير صحيح',
          errors: ['start_time يجب أن يكون قبل end_time'],
        });
        return;
      }

      // Weekday name helper (PostgreSQL DOW: 0=Sunday..6=Saturday)
      const weekdayName = (d: number) => {
        const names = [
          'الأحد',
          'الاثنين',
          'الثلاثاء',
          'الأربعاء',
          'الخميس',
          'الجمعة',
          'السبت',
        ];
        return names[d] ?? String(d);
      };

      // If weekdays[] provided: create multiple sessions
      if (hasWeekdaysArray) {
        const created: any[] = [];
        const skipped: any[] = [];
        for (const dRaw of payload.weekdays) {
          const d = Number(dRaw);
          // Conflict check per day
          const conflict = await SessionModel.hasConflict({
            teacherId: payload.teacher_id,
            weekday: d,
            startTime: payload.start_time,
            endTime: payload.end_time,
          });
          if (conflict) {
            skipped.push({ weekday: d, reason: 'conflict' });
            continue;
          }
          const s = await SessionModel.createSession({
            course_id: payload.course_id,
            teacher_id: payload.teacher_id,
            title: payload.title,
            weekday: d,
            start_time: payload.start_time,
            end_time: payload.end_time,
            recurrence: payload.recurrence,
            flex_type: payload.flex_type,
            flex_minutes: payload.flex_minutes,
            flex_alternates: payload.flex_alternates,
            hard_constraints: payload.hard_constraints,
            soft_constraints: payload.soft_constraints,
            state: payload.state,
          });
          // auto-attach confirmed course students + any provided studentIds
          const confirmed =
            await CourseBookingModel.getConfirmedStudentIdsByCourse(
              payload.course_id
            );
          const provided = Array.isArray(payload.studentIds)
            ? payload.studentIds
            : [];
          const unique = Array.from(
            new Set<string>([...confirmed, ...provided].map(String))
          );
          if (unique.length > 0) {
            await SessionModel.addAttendees(s.id, unique);
          }
          created.push(s);
        }

        // Notify course confirmed students once if at least one session created
        if (created.length > 0) {
          try {
            const oneSignalConfig = {
              appId: process.env['ONESIGNAL_APP_ID'] || '',
              restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
            };
            const notifService = new NotificationService(oneSignalConfig);
            const studentIds =
              await CourseBookingModel.getConfirmedStudentIdsByCourse(
                payload.course_id
              );
            if (studentIds.length > 0) {
              const dayNames = created
                .map(s => weekdayName(Number(s.weekday)))
                .join(', ');
              await notifService.createAndSendNotification({
                title: 'تم إنشاء جدول الدروس',
                message: `تمت إضافة جلسات جديدة لأيام: ${dayNames} من ${TeacherSessionController.to12h(payload.start_time)} إلى ${TeacherSessionController.to12h(payload.end_time)}`,
                type: NotificationType.COURSE_UPDATE,
                priority: NotificationPriority.HIGH,
                recipientType: RecipientType.SPECIFIC_STUDENTS,
                recipientIds: studentIds,
                data: {
                  courseId: payload.course_id,
                  sessionIds: created.map(s => s.id),
                },
                createdBy: String(teacher.id),
              });
            }
          } catch (e) {
            console.error('Failed to send sessions creation notifications:', e);
          }
        }

        res.status(201).json({
          success: true,
          message: 'تم إنشاء الجلسات',
          data: { created, skipped },
        });
        return;
      }

      // Single-day behavior (existing)
      const weekday = Number(payload.weekday);
      // Conflict check for this teacher on same weekday
      const conflict = await SessionModel.hasConflict({
        teacherId: payload.teacher_id,
        weekday,
        startTime: payload.start_time,
        endTime: payload.end_time,
      });
      if (conflict) {
        res.status(409).json({
          success: false,
          message: 'تعارض في الجدول',
          errors: ['يوجد جلسة أخرى متداخلة لنفس المعلم في نفس اليوم'],
        });
        return;
      }

      const session = await SessionModel.createSession({
        course_id: payload.course_id,
        teacher_id: payload.teacher_id,
        title: payload.title,
        weekday,
        start_time: payload.start_time,
        end_time: payload.end_time,
        recurrence: payload.recurrence,
        flex_type: payload.flex_type,
        flex_minutes: payload.flex_minutes,
        flex_alternates: payload.flex_alternates,
        hard_constraints: payload.hard_constraints,
        soft_constraints: payload.soft_constraints,
        state: payload.state,
      });

      // auto-attach confirmed course students + any provided studentIds
      const confirmed = await CourseBookingModel.getConfirmedStudentIdsByCourse(
        payload.course_id
      );
      const provided = Array.isArray(payload.studentIds)
        ? payload.studentIds
        : [];
      const unique = Array.from(
        new Set<string>([...confirmed, ...provided].map(String))
      );
      if (unique.length > 0) {
        await SessionModel.addAttendees(session.id, unique);
      }

      // Notify confirmed students in this course about the new schedule
      try {
        const oneSignalConfig = {
          appId: process.env['ONESIGNAL_APP_ID'] || '',
          restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
        };
        const notifService = new NotificationService(oneSignalConfig);
        const studentIds =
          await CourseBookingModel.getConfirmedStudentIdsByCourse(
            payload.course_id
          );
        if (studentIds.length > 0) {
          const dayName = weekdayName(Number(weekday));
          await notifService.createAndSendNotification({
            title: 'تم إنشاء جدول الدروس',
            message:
              `تم إضافة جلسة جديدة: ${session.title || ''} يوم ${dayName} من ${TeacherSessionController.to12h(session.start_time as any)} إلى ${TeacherSessionController.to12h(session.end_time as any)}`.trim(),
            type: NotificationType.COURSE_UPDATE,
            priority: NotificationPriority.HIGH,
            recipientType: RecipientType.SPECIFIC_STUDENTS,
            recipientIds: studentIds,
            data: { courseId: session.course_id, sessionId: session.id },
            createdBy: String(teacher.id),
          });
        }
      } catch (e) {
        console.error('Failed to send session creation notifications:', e);
      }

      res
        .status(201)
        .json({ success: true, message: 'تم إنشاء الجلسة', data: session });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // GET /api/teacher/sessions/:id/attendance?date=YYYY-MM-DD
  static async getSessionAttendanceByDate(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const dateISO =
        (req.query['date'] as string) ||
        new Date().toISOString().substring(0, 10);

      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }

      let data = await AttendanceModel.getSessionAttendanceForDate(
        sessionId,
        dateISO
      );
      // add 12h formatted check-in time for display
      data = data.map((it: any) => ({
        ...it,
        checkin_at_12h: TeacherSessionController.to12hFromISO(it.checkin_at),
      }));
      res.status(200).json({
        success: true,
        message: 'تم جلب حضور الجلسة لليوم المحدد',
        data,
        date: dateISO,
      });
    } catch (error) {
      console.error('Error getting session attendance by date:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // POST /api/teacher/sessions/:id/attendance (bulk update)
  // Body: { date: 'YYYY-MM-DD', items: [{ studentId, status: 'present'|'absent'|'leave' }] }
  static async bulkSetSessionAttendance(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const me = req.user;
      const { date, items } = req.body || {};

      if (!date || !Array.isArray(items)) {
        res.status(400).json({
          success: false,
          message: 'بيانات ناقصة',
          errors: ['date و items مطلوبان'],
        });
        return;
      }

      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== me?.id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }

      // Ensure all studentIds belong to this session's attendees (strict policy)
      const allowedIds = new Set(await SessionModel.listAttendeeIds(sessionId));
      const filtered = items.filter((it: any) =>
        allowedIds.has(String(it.studentId))
      );

      const result = await AttendanceModel.bulkSetAttendanceStatuses({
        sessionId,
        courseId: session.course_id,
        teacherId: session.teacher_id,
        dateISO: String(date),
        items: filtered,
      });

      // Notify affected students about their updated attendance status
      try {
        if (filtered.length > 0) {
          const oneSignalConfig = {
            appId: process.env['ONESIGNAL_APP_ID'] || '',
            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
          };
          const notifService = new NotificationService(oneSignalConfig);
          const day = String(date);
          for (const it of filtered) {
            const status = String(it.status);
            const statusText = status === 'present' ? 'حضور' : status === 'absent' ? 'غياب' : 'إجازة';
            await notifService.createAndSendNotification({
              title: 'تحديث حالة الحضور',
              message: `قام المعلم بتحديث حالتك: ${statusText} بتاريخ ${day}`,
              type: NotificationType.COURSE_UPDATE,
              priority: NotificationPriority.HIGH,
              recipientType: RecipientType.SPECIFIC_STUDENTS,
              recipientIds: [String(it.studentId)],
              data: { sessionId, courseId: session.course_id, teacherId: session.teacher_id, date: day, status },
              createdBy: String(me.id),
            });
          }
        }
      } catch (e) {
        console.error('Failed to send bulk attendance notifications:', e);
      }

      res.status(200).json({
        success: true,
        message: 'تم تحديث حالات الحضور',
        data: { updated: result.updated },
      });
    } catch (error) {
      console.error('Error bulk setting session attendance:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // POST /api/teacher/sessions/:id/attendees
  static async addAttendees(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const { studentIds } = req.body || {};

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'قائمة الطلاب مطلوبة',
          errors: ['studentIds مطلوب'],
        });
        return;
      }

      // Ownership check
      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }
      await SessionModel.addAttendees(sessionId, studentIds);
      res
        .status(200)
        .json({ success: true, message: 'تم إضافة الطلاب إلى الجلسة' });
    } catch (error) {
      console.error('Error adding attendees:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // GET /api/teacher/sessions/:id/attendees
  static async listAttendees(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }
      const attendees = await SessionModel.listAttendeesDetailed(sessionId);
      res
        .status(200)
        .json({ success: true, message: 'تم جلب الطلاب', data: attendees });
    } catch (error) {
      console.error('Error listing attendees:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // GET /api/teacher/courses/:courseId/confirmed-students
  static async getConfirmedStudentsByCourse(
    req: Request<{ courseId: string }>,
    res: Response
  ): Promise<void> {
    try {
      const teacher = req.user;
      const courseId = req.params['courseId'];
      if (!teacher || !courseId) {
        res.status(400).json({
          success: false,
          message: 'بيانات ناقصة',
          errors: ['courseId مطلوب'],
        });
        return;
      }

      // Authorization: ensure course belongs to this teacher and is not deleted
      const course = await CourseModel.findByIdAndTeacher(courseId, teacher.id);
      if (!course) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية أو الكورس غير موجود'],
        });
        return;
      }

      const students =
        await CourseBookingModel.getConfirmedStudentsDetailedByCourse(courseId);
      const data = students.map(s => ({
        id: s.student_id,
        name: s.student_name,
        gradeId: s.grade_id,
        gradeName: s.grade_name,
        studyYear: s.study_year,
      }));

      res.status(200).json({
        success: true,
        message: 'تم جلب الطلاب المؤكدين للكورس',
        data,
      });
    } catch (error) {
      console.error('Error getting confirmed students by course:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // DELETE /api/teacher/sessions/:id/attendees
  static async removeAttendees(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const { studentIds } = req.body || {};
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'قائمة الطلاب مطلوبة',
          errors: ['studentIds مطلوب'],
        });
        return;
      }
      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'غير مسموح',
          errors: ['صلاحيات غير كافية'],
        });
        return;
      }
      const removed = await SessionModel.removeAttendees(sessionId, studentIds);
      res.status(200).json({
        success: true,
        message: 'تم حذف الطلاب من الجلسة',
        data: { removed },
      });
    } catch (error) {
      console.error('Error removing attendees:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // GET /api/teacher/sessions
  static async listMySessions(req: Request, res: Response): Promise<void> {
    try {
      const teacher = req.user;
      const page = parseInt((req.query['page'] as string) || '1', 10);
      const limit = parseInt((req.query['limit'] as string) || '20', 10);

      // Optional filters: weekday (0-6) and courseId (uuid). If null/empty -> no filter
      const weekdayRaw = req.query['weekday'] as string | undefined;
      const courseIdRaw = req.query['courseId'] as string | undefined;
      const hasValue = (v?: string) =>
        v !== undefined &&
        v !== null &&
        v !== '' &&
        v !== 'null' &&
        v !== 'undefined';
      const weekday = hasValue(weekdayRaw) ? Number(weekdayRaw) : null;
      const courseId = hasValue(courseIdRaw) ? String(courseIdRaw) : null;

      const { sessions, total } = await SessionModel.getTeacherSessions(
        teacher.id,
        page,
        limit,
        { weekday, courseId }
      );
      // Add 12h times in listing for display
      const displaySessions = sessions.map((s: any) => ({
        ...s,
        start_time_12h: TeacherSessionController.to12h(s.start_time),
        end_time_12h: TeacherSessionController.to12h(s.end_time),
      }));
      res.status(200).json({
        success: true,
        message: 'تم جلب الجلسات',
        data: displaySessions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error listing sessions:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // PUT /api/teacher/sessions/:id
  static async updateSession(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const id = req.params['id'];
      const me = req.user;
      const existing = await SessionModel.getById(id);
      if (!existing || existing.teacher_id !== me?.id) {
        res
          .status(404)
          .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
        return;
      }

      const payload = req.body || {};
      // Optional validations when fields provided
      if (payload.weekday !== undefined) {
        const d = Number(payload.weekday);
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          res
            .status(400)
            .json({ success: false, message: 'قيمة يوم الأسبوع غير صحيحة' });
          return;
        }
      }
      const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
      if (
        (payload.start_time && !timeRe.test(payload.start_time)) ||
        (payload.end_time && !timeRe.test(payload.end_time))
      ) {
        res
          .status(400)
          .json({ success: false, message: 'صيغة الوقت غير صحيحة' });
        return;
      }
      const useWeekday =
        payload.weekday !== undefined
          ? Number(payload.weekday)
          : existing.weekday;
      const useStart = payload.start_time ?? (existing.start_time as any);
      const useEnd = payload.end_time ?? (existing.end_time as any);
      const toSec = (s: string) => {
        const [h, m, sec] = String(s)
          .split(':')
          .map(x => parseInt(x, 10));
        return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
      };
      if (toSec(useStart) >= toSec(useEnd)) {
        res.status(400).json({
          success: false,
          message: 'الوقت غير صحيح',
          errors: ['start_time يجب أن يكون قبل end_time'],
        });
        return;
      }
      const conflict = await SessionModel.hasConflict({
        teacherId: existing.teacher_id,
        weekday: useWeekday,
        startTime: useStart,
        endTime: useEnd,
        excludeSessionId: id,
      });
      if (conflict) {
        res.status(409).json({
          success: false,
          message: 'تعارض في الجدول',
          errors: ['يوجد جلسة أخرى متداخلة'],
        });
        return;
      }

      const updated = await SessionModel.updateSession(id, payload);
      res
        .status(200)
        .json({ success: true, message: 'تم تحديث الجلسة', data: updated });
    } catch (error) {
      console.error('Error updating session:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // DELETE /api/teacher/sessions/:id
  static async deleteSession(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const id = req.params['id'];
      const me = req.user;
      const existing = await SessionModel.getById(id);
      if (!existing || existing.teacher_id !== me?.id) {
        res
          .status(404)
          .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
        return;
      }
      const ok = await SessionModel.softDeleteSession(id);
      res.status(ok ? 200 : 404).json({
        success: ok,
        message: ok ? 'تم حذف الجلسة' : 'الجلسة غير موجودة',
      });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // POST /api/teacher/sessions/:id/end
  static async endSessionAndNotify(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<void> {
    try {
      const sessionId = req.params['id'];
      const me = req.user;
      const session = await SessionModel.getById(sessionId);
      if (!session || session.teacher_id !== me?.id) {
        res
          .status(404)
          .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
        return;
      }

      // Get today's checked-in students for this session
      const occurredOnISO = new Date().toISOString().substring(0, 10);
      const studentIds = await AttendanceModel.getCheckedInStudentIds(
        sessionId,
        occurredOnISO
      );

      // Notify students the lecture has ended
      try {
        if (studentIds.length > 0) {
          const notifService = new NotificationService({
            appId: process.env['ONESIGNAL_APP_ID'] || '',
            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
          });
          await notifService.createAndSendNotification({
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
            createdBy: String(me.id),
          });
        }
      } catch (e) {
        console.error('Failed to send session end notifications:', e);
      }

      res
        .status(200)
        .json({ success: true, message: 'تم إنهاء الجلسة وإشعار الطلاب' });
    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['تعذر إنهاء الجلسة'],
      });
    }
  }
}
