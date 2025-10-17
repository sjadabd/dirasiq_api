"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const onesignal_node_1 = require("onesignal-node");
const academic_year_model_1 = require("../models/academic-year.model");
const notification_model_1 = require("../models/notification.model");
const student_grade_model_1 = require("../models/student-grade.model");
const token_model_1 = require("../models/token.model");
const user_model_1 = require("../models/user.model");
const types_1 = require("../types");
class NotificationService {
    constructor(config) {
        this.config = config;
        this.oneSignal = new onesignal_node_1.Client(config.appId, config.restApiKey);
    }
    async sendToPlayers(playerIds, options) {
        if (!playerIds || playerIds.length === 0) {
            console.warn('⚠️ No player IDs provided');
            return false;
        }
        const validPlayerIds = playerIds.filter((id) => id && id.trim().length > 0);
        if (validPlayerIds.length === 0) {
            console.warn('⚠️ No valid player IDs found');
            return false;
        }
        console.info(`🚀 Sending notification to ${validPlayerIds.length} device(s): title="${options.title}"`);
        const notification = {
            app_id: this.config.appId,
            include_player_ids: validPlayerIds,
            headings: { en: options.title, ar: options.title },
            contents: { en: options.message, ar: options.message },
            data: options.data || {},
            priority: options.priority || 'normal',
            ttl: options.ttl || 3600,
        };
        if (options.url)
            notification.url = options.url;
        if (options.imageUrl)
            notification.large_icon = options.imageUrl;
        if (options.collapseId)
            notification.collapse_id = options.collapseId;
        const response = await this.oneSignal.createNotification(notification);
        console.info(`📬 OneSignal response: status=${response.statusCode}, body=${typeof response.body === 'string' ? response.body : JSON.stringify(response.body)}`);
        if (response.statusCode === 200) {
            return true;
        }
        else {
            console.error('❌ Notification failed:', response.body);
            return false;
        }
    }
    async sendToAll(options) {
        try {
            const notification = {
                app_id: this.config.appId,
                included_segments: ['All'],
                headings: { en: options.title, ar: options.title },
                contents: { en: options.message, ar: options.message },
                data: options.data || {},
                priority: options.priority || 'normal',
                ttl: options.ttl || 3600,
            };
            const response = await this.oneSignal.createNotification(notification);
            return response.statusCode === 200;
        }
        catch (error) {
            console.error('❌ Error sending notification to all users:', error);
            return false;
        }
    }
    async sendToSpecificUsers(userIds, options) {
        try {
            let allPlayerIds = [];
            for (const id of userIds) {
                const playerIds = await token_model_1.TokenModel.getPlayerIdsByUserId(id);
                allPlayerIds.push(...(playerIds || []));
            }
            const uniquePlayerIds = Array.from(new Set(allPlayerIds));
            console.info(`🎯 Targeting specific users: users=${userIds.length}, resolvedDevices=${uniquePlayerIds.length}`);
            if (uniquePlayerIds.length === 0) {
                console.warn('⚠️ No valid player IDs found for users:', userIds);
                return false;
            }
            return await this.sendToPlayers(uniquePlayerIds, options);
        }
        catch (error) {
            console.error('❌ Error sending to specific users:', error);
            return false;
        }
    }
    async sendToUserTypes(userTypes, options) {
        try {
            const users = await this.getUsersByTypes(userTypes);
            let allPlayerIds = [];
            for (const user of users) {
                const playerIds = await token_model_1.TokenModel.getPlayerIdsByUserId(user.id);
                allPlayerIds.push(...(playerIds || []));
            }
            if (allPlayerIds.length === 0) {
                console.warn('⚠️ No valid player IDs found for userTypes:', userTypes);
                return false;
            }
            return await this.sendToPlayers(allPlayerIds, options);
        }
        catch (error) {
            console.error('❌ Error sending to user types:', error);
            return false;
        }
    }
    async createAndSendNotification(notificationData) {
        try {
            let senderName = 'النظام';
            let senderType = 'system';
            let senderId = null;
            try {
                const user = await user_model_1.UserModel.findById(String(notificationData.createdBy));
                if (user) {
                    senderId = String(user.id);
                    const displayName = user?.name || '';
                    switch (user.userType) {
                        case types_1.UserType.SUPER_ADMIN:
                            senderType = 'admin';
                            senderName = displayName || 'الإدارة';
                            break;
                        case types_1.UserType.TEACHER:
                            senderType = 'teacher';
                            senderName = displayName || 'المعلم';
                            break;
                        case types_1.UserType.STUDENT:
                            senderType = 'student';
                            senderName = displayName || 'الطالب';
                            break;
                        default:
                            senderType = 'user';
                            senderName = displayName || 'مستخدم';
                    }
                }
                else {
                    senderType = 'system';
                    senderName = 'النظام';
                }
            }
            catch {
                senderType = 'system';
                senderName = 'النظام';
            }
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const enrichedData = {
                ...notificationData.data,
                ...(activeYear && { studyYear: notificationData.data?.['studyYear'] || activeYear.year }),
                sender: {
                    id: senderId || String(notificationData.createdBy || ''),
                    type: senderType,
                    name: senderName,
                },
            };
            const notification = await notification_model_1.NotificationModel.create({
                ...notificationData,
                priority: notificationData.priority,
                data: enrichedData,
            });
            const sendOptions = {
                title: notificationData.title,
                message: `من ${senderName}: ${notificationData.message}`,
                data: {
                    ...enrichedData,
                    notificationId: notification.id,
                    type: notificationData.type,
                },
                priority: this.mapPriorityToOneSignal(notificationData.priority || 'medium'),
            };
            let success = false;
            switch (notificationData.recipientType) {
                case notification_model_1.RecipientType.ALL:
                    console.info('📣 createAndSendNotification: RecipientType=ALL');
                    success = await this.sendToAll(sendOptions);
                    break;
                case notification_model_1.RecipientType.TEACHERS:
                    console.info('👩‍🏫 createAndSendNotification: RecipientType=TEACHERS');
                    success = await this.sendToUserTypes([types_1.UserType.TEACHER], sendOptions);
                    break;
                case notification_model_1.RecipientType.STUDENTS:
                    if (notificationData.data?.['gradeId'] && notificationData.data?.['studyYear']) {
                        console.info(`🎓 createAndSendNotification: RecipientType=STUDENTS with filter gradeId=${notificationData.data['gradeId']} studyYear=${notificationData.data['studyYear']}`);
                        const studentGrades = await student_grade_model_1.StudentGradeModel.findByGradeAndStudyYear(String(notificationData.data['gradeId']), notificationData.data['studyYear']);
                        const studentIds = studentGrades.map((sg) => sg.studentId);
                        console.info(`👥 Filtered students count: ${studentIds.length}`);
                        if (studentIds.length > 0) {
                            success = await this.sendToSpecificUsers(studentIds, sendOptions);
                        }
                    }
                    else {
                        console.info('🎓 createAndSendNotification: RecipientType=STUDENTS (no filter)');
                        success = await this.sendToUserTypes([types_1.UserType.STUDENT], sendOptions);
                    }
                    break;
                case notification_model_1.RecipientType.SPECIFIC_TEACHERS:
                case notification_model_1.RecipientType.SPECIFIC_STUDENTS:
                    if (notificationData.recipientIds?.length) {
                        console.info(`📌 createAndSendNotification: RecipientType=SPECIFIC, recipients=${notificationData.recipientIds.length}`);
                        success = await this.sendToSpecificUsers(notificationData.recipientIds, sendOptions);
                    }
                    break;
            }
            await notification_model_1.NotificationModel.updateStatus(notification.id, success ? notification_model_1.NotificationStatus.SENT : notification_model_1.NotificationStatus.FAILED, success ? { sentAt: new Date() } : {});
            console.info(`✅ Notification ${success ? 'SENT' : 'FAILED'}: id=${notification.id}, title="${notificationData.title}"`);
            return notification;
        }
        catch (error) {
            console.error('❌ Error in createAndSendNotification:', error);
            return null;
        }
    }
    async sendTemplateNotification(templateName, variables, recipients, createdBy) {
        try {
            const template = await this.getNotificationTemplate(templateName);
            if (!template) {
                throw new Error(`Template ${templateName} not found`);
            }
            const title = this.replaceTemplateVariables(template.title_template, variables);
            const message = this.replaceTemplateVariables(template.message_template, variables);
            let recipientType = notification_model_1.RecipientType.ALL;
            let recipientIds;
            if (recipients.allUsers) {
                recipientType = notification_model_1.RecipientType.ALL;
            }
            else if (recipients.userTypes?.length) {
                if (recipients.userTypes.includes(types_1.UserType.TEACHER))
                    recipientType = notification_model_1.RecipientType.TEACHERS;
                if (recipients.userTypes.includes(types_1.UserType.STUDENT))
                    recipientType = notification_model_1.RecipientType.STUDENTS;
            }
            else if (recipients.userIds?.length) {
                recipientIds = recipients.userIds;
                recipientType = notification_model_1.RecipientType.SPECIFIC_TEACHERS;
            }
            return await this.createAndSendNotification({
                title,
                message,
                type: template.type,
                priority: template.priority,
                recipientType,
                ...(recipientIds && { recipientIds }),
                data: variables,
                createdBy,
            });
        }
        catch (error) {
            console.error('❌ Error sending template notification:', error);
            return null;
        }
    }
    async processPendingNotifications() {
        try {
            const pendingNotifications = await notification_model_1.NotificationModel.getPendingNotifications();
            for (const notification of pendingNotifications) {
                await this.sendPendingNotification(notification);
            }
        }
        catch (error) {
            console.error('❌ Error processing pending notifications:', error);
        }
    }
    async sendPendingNotification(notification) {
        try {
            const sendOptions = {
                title: notification.title,
                message: notification.message,
                data: {
                    ...notification.data,
                    notificationId: notification.id,
                    type: notification.type,
                },
                priority: this.mapPriorityToOneSignal(notification.priority),
            };
            let success = false;
            switch (notification.recipientType) {
                case notification_model_1.RecipientType.ALL:
                    success = await this.sendToAll(sendOptions);
                    break;
                case notification_model_1.RecipientType.TEACHERS:
                    success = await this.sendToUserTypes([types_1.UserType.TEACHER], sendOptions);
                    break;
                case notification_model_1.RecipientType.STUDENTS:
                    success = await this.sendToUserTypes([types_1.UserType.STUDENT], sendOptions);
                    break;
                case notification_model_1.RecipientType.SPECIFIC_TEACHERS:
                case notification_model_1.RecipientType.SPECIFIC_STUDENTS:
                    if (notification.recipientIds?.length) {
                        success = await this.sendToSpecificUsers(notification.recipientIds, sendOptions);
                    }
                    break;
            }
            await notification_model_1.NotificationModel.updateStatus(notification.id, success ? notification_model_1.NotificationStatus.SENT : notification_model_1.NotificationStatus.FAILED, success ? { sentAt: new Date() } : {});
        }
        catch (error) {
            console.error('❌ Error sending pending notification:', error);
            await notification_model_1.NotificationModel.updateStatus(notification.id, notification_model_1.NotificationStatus.FAILED);
        }
    }
    async getUsersByTypes(userTypes) {
        const allUsers = await user_model_1.UserModel.findAll({ limit: 10000 });
        return allUsers.users.filter((user) => userTypes.includes(user.userType));
    }
    mapPriorityToOneSignal(priority) {
        switch (priority) {
            case 'urgent':
            case 'high':
                return 'high';
            case 'low':
                return 'low';
            default:
                return 'normal';
        }
    }
    replaceTemplateVariables(template, variables) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }
    async getNotificationTemplate(templateName) {
        const templates = {
            homework_reminder: {
                title_template: 'تنبيه واجب منزلي - {{course_name}}',
                message_template: 'لديك واجب منزلي جديد في مادة {{subject_name}} من المعلم {{teacher_name}}. الموعد النهائي: {{due_date}}',
                type: 'homework_reminder',
                priority: 'high',
            },
            new_booking: {
                title_template: 'حجز جديد - {{course_name}}',
                message_template: 'لديك حجز جديد من الطالب {{student_name}} في دورة {{course_name}}. {{student_message}}',
                type: 'new_booking',
                priority: 'high',
            },
        };
        return templates[templateName] || null;
    }
    async getNotificationStats() {
        return await notification_model_1.NotificationModel.getStatistics();
    }
    async getUserNotifications(userId, page = 1, limit = 10, options) {
        if (options && (options.q || options.type || options.courseId || options.subType)) {
            return await notification_model_1.NotificationModel.getUserNotificationsWithFilters(userId, {
                page,
                limit,
                q: options.q ?? null,
                type: options.type ?? null,
                courseId: options.courseId ?? null,
                subType: options.subType ?? null,
            });
        }
        return await notification_model_1.NotificationModel.getUserNotifications(userId, page, limit);
    }
    async markNotificationAsRead(notificationId, userId) {
        return await notification_model_1.NotificationModel.markAsRead(notificationId, userId);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map