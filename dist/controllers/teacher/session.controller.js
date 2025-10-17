"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherSessionController = void 0;
const attendance_model_1 = require("../../models/attendance.model");
const course_booking_model_1 = require("../../models/course-booking.model");
const course_model_1 = require("../../models/course.model");
const notification_model_1 = require("../../models/notification.model");
const session_model_1 = require("../../models/session.model");
const notification_service_1 = require("../../services/notification.service");
class TeacherSessionController {
    static to12h(time) {
        if (!time)
            return '';
        const [hStr, mStr] = String(time).split(':');
        let h = parseInt(hStr || '0', 10);
        const m = parseInt(mStr || '0', 10);
        const am = h < 12;
        h = h % 12;
        if (h === 0)
            h = 12;
        const mm = m.toString().padStart(2, '0');
        return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
    }
    static to12hFromISO(iso) {
        if (!iso)
            return null;
        const d = new Date(iso);
        if (isNaN(d.getTime()))
            return null;
        let h = d.getHours();
        const m = d.getMinutes();
        const am = h < 12;
        h = h % 12;
        if (h === 0)
            h = 12;
        const mm = m.toString().padStart(2, '0');
        return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
    }
    static async createSession(req, res) {
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
            const hasWeekdaysArray = Array.isArray(payload.weekdays) && payload.weekdays.length > 0;
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
            if (!hasWeekdaysArray &&
                (payload.weekday === undefined || payload.weekday === null)) {
                res.status(400).json({
                    success: false,
                    message: 'بيانات ناقصة',
                    errors: ['weekday مطلوب عند عدم إرسال weekdays[]'],
                });
                return;
            }
            const validateWeekday = (d) => Number.isInteger(d) && d >= 0 && d <= 6;
            if (hasWeekdaysArray) {
                const invalid = payload.weekdays.some((d) => !validateWeekday(Number(d)));
                if (invalid) {
                    res.status(400).json({
                        success: false,
                        message: 'قيمة يوم الأسبوع غير صحيحة',
                        errors: ['weekdays يجب أن تحتوي قيم بين 0 و 6'],
                    });
                    return;
                }
            }
            else {
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
            const toSec = (s) => {
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
            const weekdayName = (d) => {
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
            if (hasWeekdaysArray) {
                const created = [];
                const skipped = [];
                for (const dRaw of payload.weekdays) {
                    const d = Number(dRaw);
                    const conflict = await session_model_1.SessionModel.hasConflict({
                        teacherId: payload.teacher_id,
                        weekday: d,
                        startTime: payload.start_time,
                        endTime: payload.end_time,
                    });
                    if (conflict) {
                        skipped.push({ weekday: d, reason: 'conflict' });
                        continue;
                    }
                    const s = await session_model_1.SessionModel.createSession({
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
                    const confirmed = await course_booking_model_1.CourseBookingModel.getConfirmedStudentIdsByCourse(payload.course_id);
                    const provided = Array.isArray(payload.studentIds)
                        ? payload.studentIds
                        : [];
                    const unique = Array.from(new Set([...confirmed, ...provided].map(String)));
                    if (unique.length > 0) {
                        await session_model_1.SessionModel.addAttendees(s.id, unique);
                    }
                    created.push(s);
                }
                if (created.length > 0) {
                    try {
                        const oneSignalConfig = {
                            appId: process.env['ONESIGNAL_APP_ID'] || '',
                            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
                        };
                        const notifService = new notification_service_1.NotificationService(oneSignalConfig);
                        const studentIds = await course_booking_model_1.CourseBookingModel.getConfirmedStudentIdsByCourse(payload.course_id);
                        if (studentIds.length > 0) {
                            const dayNames = created
                                .map(s => weekdayName(Number(s.weekday)))
                                .join(', ');
                            await notifService.createAndSendNotification({
                                title: 'تم إنشاء جدول الدروس',
                                message: `تمت إضافة جلسات جديدة لأيام: ${dayNames} من ${TeacherSessionController.to12h(payload.start_time)} إلى ${TeacherSessionController.to12h(payload.end_time)}`,
                                type: notification_model_1.NotificationType.COURSE_UPDATE,
                                priority: notification_model_1.NotificationPriority.HIGH,
                                recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
                                recipientIds: studentIds,
                                data: {
                                    courseId: payload.course_id,
                                    sessionIds: created.map(s => s.id),
                                },
                                createdBy: String(teacher.id),
                            });
                        }
                    }
                    catch (e) {
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
            const weekday = Number(payload.weekday);
            const conflict = await session_model_1.SessionModel.hasConflict({
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
            const session = await session_model_1.SessionModel.createSession({
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
            const confirmed = await course_booking_model_1.CourseBookingModel.getConfirmedStudentIdsByCourse(payload.course_id);
            const provided = Array.isArray(payload.studentIds)
                ? payload.studentIds
                : [];
            const unique = Array.from(new Set([...confirmed, ...provided].map(String)));
            if (unique.length > 0) {
                await session_model_1.SessionModel.addAttendees(session.id, unique);
            }
            try {
                const oneSignalConfig = {
                    appId: process.env['ONESIGNAL_APP_ID'] || '',
                    restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
                };
                const notifService = new notification_service_1.NotificationService(oneSignalConfig);
                const studentIds = await course_booking_model_1.CourseBookingModel.getConfirmedStudentIdsByCourse(payload.course_id);
                if (studentIds.length > 0) {
                    const dayName = weekdayName(Number(weekday));
                    await notifService.createAndSendNotification({
                        title: 'تم إنشاء جدول الدروس',
                        message: `تم إضافة جلسة جديدة: ${session.title || ''} يوم ${dayName} من ${TeacherSessionController.to12h(session.start_time)} إلى ${TeacherSessionController.to12h(session.end_time)}`.trim(),
                        type: notification_model_1.NotificationType.COURSE_UPDATE,
                        priority: notification_model_1.NotificationPriority.HIGH,
                        recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
                        recipientIds: studentIds,
                        data: { courseId: session.course_id, sessionId: session.id },
                        createdBy: String(teacher.id),
                    });
                }
            }
            catch (e) {
                console.error('Failed to send session creation notifications:', e);
            }
            res
                .status(201)
                .json({ success: true, message: 'تم إنشاء الجلسة', data: session });
        }
        catch (error) {
            console.error('Error creating session:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getSessionAttendanceByDate(req, res) {
        try {
            const sessionId = req.params['id'];
            const dateISO = req.query['date'] ||
                new Date().toISOString().substring(0, 10);
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== req.user?.id) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية'],
                });
                return;
            }
            let data = await attendance_model_1.AttendanceModel.getSessionAttendanceForDate(sessionId, dateISO);
            data = data.map((it) => ({
                ...it,
                checkin_at_12h: TeacherSessionController.to12hFromISO(it.checkin_at),
            }));
            res.status(200).json({
                success: true,
                message: 'تم جلب حضور الجلسة لليوم المحدد',
                data,
                date: dateISO,
            });
        }
        catch (error) {
            console.error('Error getting session attendance by date:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async bulkSetSessionAttendance(req, res) {
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
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== me?.id) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية'],
                });
                return;
            }
            const allowedIds = new Set(await session_model_1.SessionModel.listAttendeeIds(sessionId));
            const filtered = items.filter((it) => allowedIds.has(String(it.studentId)));
            const result = await attendance_model_1.AttendanceModel.bulkSetAttendanceStatuses({
                sessionId,
                courseId: session.course_id,
                teacherId: session.teacher_id,
                dateISO: String(date),
                items: filtered,
            });
            try {
                if (filtered.length > 0) {
                    const oneSignalConfig = {
                        appId: process.env['ONESIGNAL_APP_ID'] || '',
                        restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
                    };
                    const notifService = new notification_service_1.NotificationService(oneSignalConfig);
                    const day = String(date);
                    for (const it of filtered) {
                        const status = String(it.status);
                        const statusText = status === 'present' ? 'حضور' : status === 'absent' ? 'غياب' : 'إجازة';
                        await notifService.createAndSendNotification({
                            title: 'تحديث حالة الحضور',
                            message: `قام المعلم بتحديث حالتك: ${statusText} بتاريخ ${day}`,
                            type: notification_model_1.NotificationType.COURSE_UPDATE,
                            priority: notification_model_1.NotificationPriority.HIGH,
                            recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
                            recipientIds: [String(it.studentId)],
                            data: { sessionId, courseId: session.course_id, teacherId: session.teacher_id, date: day, status },
                            createdBy: String(me.id),
                        });
                    }
                }
            }
            catch (e) {
                console.error('Failed to send bulk attendance notifications:', e);
            }
            res.status(200).json({
                success: true,
                message: 'تم تحديث حالات الحضور',
                data: { updated: result.updated },
            });
        }
        catch (error) {
            console.error('Error bulk setting session attendance:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async addAttendees(req, res) {
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
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== req.user?.id) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية'],
                });
                return;
            }
            await session_model_1.SessionModel.addAttendees(sessionId, studentIds);
            res
                .status(200)
                .json({ success: true, message: 'تم إضافة الطلاب إلى الجلسة' });
        }
        catch (error) {
            console.error('Error adding attendees:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async listAttendees(req, res) {
        try {
            const sessionId = req.params['id'];
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== req.user?.id) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية'],
                });
                return;
            }
            const attendees = await session_model_1.SessionModel.listAttendeesDetailed(sessionId);
            res
                .status(200)
                .json({ success: true, message: 'تم جلب الطلاب', data: attendees });
        }
        catch (error) {
            console.error('Error listing attendees:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getConfirmedStudentsByCourse(req, res) {
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
            const course = await course_model_1.CourseModel.findByIdAndTeacher(courseId, teacher.id);
            if (!course) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية أو الكورس غير موجود'],
                });
                return;
            }
            const students = await course_booking_model_1.CourseBookingModel.getConfirmedStudentsDetailedByCourse(courseId);
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
        }
        catch (error) {
            console.error('Error getting confirmed students by course:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async removeAttendees(req, res) {
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
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== req.user?.id) {
                res.status(403).json({
                    success: false,
                    message: 'غير مسموح',
                    errors: ['صلاحيات غير كافية'],
                });
                return;
            }
            const removed = await session_model_1.SessionModel.removeAttendees(sessionId, studentIds);
            res.status(200).json({
                success: true,
                message: 'تم حذف الطلاب من الجلسة',
                data: { removed },
            });
        }
        catch (error) {
            console.error('Error removing attendees:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async listMySessions(req, res) {
        try {
            const teacher = req.user;
            const page = parseInt(req.query['page'] || '1', 10);
            const limit = parseInt(req.query['limit'] || '20', 10);
            const weekdayRaw = req.query['weekday'];
            const courseIdRaw = req.query['courseId'];
            const hasValue = (v) => v !== undefined &&
                v !== null &&
                v !== '' &&
                v !== 'null' &&
                v !== 'undefined';
            const weekday = hasValue(weekdayRaw) ? Number(weekdayRaw) : null;
            const courseId = hasValue(courseIdRaw) ? String(courseIdRaw) : null;
            const { sessions, total } = await session_model_1.SessionModel.getTeacherSessions(teacher.id, page, limit, { weekday, courseId });
            const displaySessions = sessions.map((s) => ({
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
        }
        catch (error) {
            console.error('Error listing sessions:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async updateSession(req, res) {
        try {
            const id = req.params['id'];
            const me = req.user;
            const existing = await session_model_1.SessionModel.getById(id);
            if (!existing || existing.teacher_id !== me?.id) {
                res
                    .status(404)
                    .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
                return;
            }
            const payload = req.body || {};
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
            if ((payload.start_time && !timeRe.test(payload.start_time)) ||
                (payload.end_time && !timeRe.test(payload.end_time))) {
                res
                    .status(400)
                    .json({ success: false, message: 'صيغة الوقت غير صحيحة' });
                return;
            }
            const useWeekday = payload.weekday !== undefined
                ? Number(payload.weekday)
                : existing.weekday;
            const useStart = payload.start_time ?? existing.start_time;
            const useEnd = payload.end_time ?? existing.end_time;
            const toSec = (s) => {
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
            const conflict = await session_model_1.SessionModel.hasConflict({
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
            const updated = await session_model_1.SessionModel.updateSession(id, payload);
            res
                .status(200)
                .json({ success: true, message: 'تم تحديث الجلسة', data: updated });
        }
        catch (error) {
            console.error('Error updating session:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async deleteSession(req, res) {
        try {
            const id = req.params['id'];
            const me = req.user;
            const existing = await session_model_1.SessionModel.getById(id);
            if (!existing || existing.teacher_id !== me?.id) {
                res
                    .status(404)
                    .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
                return;
            }
            const ok = await session_model_1.SessionModel.softDeleteSession(id);
            res.status(ok ? 200 : 404).json({
                success: ok,
                message: ok ? 'تم حذف الجلسة' : 'الجلسة غير موجودة',
            });
        }
        catch (error) {
            console.error('Error deleting session:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async endSessionAndNotify(req, res) {
        try {
            const sessionId = req.params['id'];
            const me = req.user;
            const session = await session_model_1.SessionModel.getById(sessionId);
            if (!session || session.teacher_id !== me?.id) {
                res
                    .status(404)
                    .json({ success: false, message: 'الجلسة غير موجودة أو غير مسموح' });
                return;
            }
            const occurredOnISO = new Date().toISOString().substring(0, 10);
            const studentIds = await attendance_model_1.AttendanceModel.getCheckedInStudentIds(sessionId, occurredOnISO);
            try {
                if (studentIds.length > 0) {
                    const notifService = new notification_service_1.NotificationService({
                        appId: process.env['ONESIGNAL_APP_ID'] || '',
                        restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
                    });
                    await notifService.createAndSendNotification({
                        title: 'انتهت المحاضرة',
                        message: 'تم إنهاء المحاضرة. شكراً لحضوركم',
                        type: notification_model_1.NotificationType.COURSE_UPDATE,
                        priority: notification_model_1.NotificationPriority.HIGH,
                        recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
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
            }
            catch (e) {
                console.error('Failed to send session end notifications:', e);
            }
            res
                .status(200)
                .json({ success: true, message: 'تم إنهاء الجلسة وإشعار الطلاب' });
        }
        catch (error) {
            console.error('Error ending session:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['تعذر إنهاء الجلسة'],
            });
        }
    }
}
exports.TeacherSessionController = TeacherSessionController;
//# sourceMappingURL=session.controller.js.map