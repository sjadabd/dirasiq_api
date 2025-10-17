"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseReminderService = void 0;
const database_1 = __importDefault(require("../config/database"));
const notification_model_1 = require("../models/notification.model");
const notification_service_1 = require("../services/notification.service");
class CourseReminderService {
    constructor() {
        const oneSignalConfig = {
            appId: process.env['ONESIGNAL_APP_ID'] || '',
            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
        };
        this.notificationService = new notification_service_1.NotificationService(oneSignalConfig);
    }
    async sendReminders() {
        for (const days of [3, 2, 1]) {
            await this.sendReminderForOffset(days);
        }
    }
    async sendReminderForCourse(courseId, daysUntilStart = 1) {
        const query = `
      SELECT
        c.id AS course_id,
        c.course_name,
        c.start_date,
        c.teacher_id,
        cb.student_id
      FROM courses c
      JOIN course_bookings cb ON cb.course_id = c.id
      WHERE c.is_deleted = false
        AND cb.is_deleted = false
        AND cb.status = 'confirmed'
        AND c.id = $1
    `;
        const result = await database_1.default.query(query, [courseId]);
        if (result.rows.length === 0)
            return;
        const studentIds = Array.from(new Set(result.rows.map(r => r.student_id)));
        const courseName = result.rows[0].course_name;
        const createdBy = result.rows[0].teacher_id;
        const title = `تذكير دورة - ${courseName}`;
        const message = daysUntilStart === 1
            ? `غدًا تبدأ دورتك: ${courseName}. يرجى الاستعداد.`
            : `تبقى ${daysUntilStart} أيام لبدء دورتك: ${courseName}. يرجى الاستعداد.`;
        await this.notificationService.createAndSendNotification({
            title,
            message,
            type: notification_model_1.NotificationType.CLASS_REMINDER,
            priority: 'high',
            recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
            recipientIds: studentIds,
            data: { courseId, daysUntilStart, manual: true },
            createdBy
        });
    }
    async sendReminderForOffset(daysUntilStart) {
        const query = `
      SELECT
        c.id AS course_id,
        c.course_name,
        c.start_date,
        c.study_year,
        c.teacher_id,
        cb.student_id
      FROM courses c
      JOIN course_bookings cb ON cb.course_id = c.id
      WHERE c.is_deleted = false
        AND cb.is_deleted = false
        AND cb.status = 'confirmed'
        AND DATE(c.start_date) = (CURRENT_DATE + INTERVAL '${daysUntilStart} day')
    `;
        const result = await database_1.default.query(query);
        if (result.rows.length === 0)
            return;
        const byCourse = {};
        for (const row of result.rows) {
            const cid = row.course_id;
            if (!byCourse[cid]) {
                byCourse[cid] = { courseName: row.course_name, studentIds: [], teacherId: row.teacher_id };
            }
            byCourse[cid].studentIds.push(row.student_id);
        }
        for (const [courseId, { courseName, studentIds, teacherId }] of Object.entries(byCourse)) {
            const title = `تذكير دورة - ${courseName}`;
            const message = daysUntilStart === 1
                ? `غدًا تبدأ دورتك: ${courseName}. يرجى الاستعداد.`
                : `تبقى ${daysUntilStart} أيام لبدء دورتك: ${courseName}. يرجى الاستعداد.`;
            await this.notificationService.createAndSendNotification({
                title,
                message,
                type: notification_model_1.NotificationType.CLASS_REMINDER,
                priority: 'high',
                recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
                recipientIds: studentIds,
                data: { courseId, daysUntilStart },
                createdBy: teacherId
            });
        }
    }
}
exports.CourseReminderService = CourseReminderService;
//# sourceMappingURL=course-reminder.service.js.map