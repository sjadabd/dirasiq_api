"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationValidation = exports.NotificationController = void 0;
const express_validator_1 = require("express-validator");
const path_1 = __importDefault(require("path"));
const assignment_model_1 = require("../models/assignment.model");
const notification_model_1 = require("../models/notification.model");
const notification_service_1 = require("../services/notification.service");
const file_util_1 = require("../utils/file.util");
class NotificationController {
    constructor() {
        this.sendToAll = async (req, res) => {
            try {
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation errors',
                        errors: errors.array()
                    });
                    return;
                }
                const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
                const createdBy = req.user?.id;
                if (!createdBy) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                let enrichedData = { ...(data || {}) };
                if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
                    const baseDir = path_1.default.resolve(__dirname, '..', '..', 'public', 'uploads', 'notification');
                    const toRelative = (p) => {
                        const u = p.replace(/\\/g, '/');
                        const i = u.lastIndexOf('/public/');
                        if (i !== -1)
                            return u.substring(i + '/public/'.length);
                        const j = u.indexOf('uploads/');
                        return j !== -1 ? u.substring(j) : u;
                    };
                    if (attachments?.pdfBase64) {
                        const pdfPath = await (0, file_util_1.saveBase64File)(attachments.pdfBase64, baseDir, 'attachment.pdf');
                        enrichedData['attachments'] = { ...(enrichedData['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
                    }
                    if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
                        const imagePaths = await (0, file_util_1.saveMultipleBase64Images)(attachments.imagesBase64, baseDir);
                        enrichedData['attachments'] = {
                            ...(enrichedData['attachments'] || {}),
                            imageUrls: imagePaths.map(toRelative),
                        };
                    }
                }
                const notification = await this.notificationService.createAndSendNotification({
                    title,
                    message,
                    type: type || notification_model_1.NotificationType.SYSTEM_ANNOUNCEMENT,
                    priority: priority || notification_model_1.NotificationPriority.MEDIUM,
                    recipientType: notification_model_1.RecipientType.ALL,
                    data: {
                        ...enrichedData,
                        url,
                        imageUrl
                    },
                    createdBy
                });
                if (notification) {
                    res.status(201).json({
                        success: true,
                        message: 'Notification sent successfully',
                        data: notification
                    });
                }
                else {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to send notification'
                    });
                }
            }
            catch (error) {
                console.error('Error in sendToAll:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.sendToTeachers = async (req, res) => {
            try {
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation errors',
                        errors: errors.array()
                    });
                    return;
                }
                const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
                const createdBy = req.user?.id;
                if (!createdBy) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                let enrichedData = { ...(data || {}) };
                if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
                    const baseDir = path_1.default.join(__dirname, '../../public/uploads/notifications');
                    const toRelative = (p) => {
                        const u = p.replace(/\\/g, '/');
                        const i = u.lastIndexOf('/public/');
                        if (i !== -1)
                            return u.substring(i + '/public/'.length);
                        const j = u.indexOf('uploads/');
                        return j !== -1 ? u.substring(j) : u;
                    };
                    if (attachments?.pdfBase64) {
                        const pdfPath = await (0, file_util_1.saveBase64File)(attachments.pdfBase64, baseDir, 'attachment.pdf');
                        enrichedData['attachments'] = { ...(enrichedData['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
                    }
                    if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
                        const imagePaths = await (0, file_util_1.saveMultipleBase64Images)(attachments.imagesBase64, baseDir);
                        enrichedData['attachments'] = {
                            ...(enrichedData['attachments'] || {}),
                            imageUrls: imagePaths.map(toRelative),
                        };
                    }
                }
                const notification = await this.notificationService.createAndSendNotification({
                    title,
                    message,
                    type: type || notification_model_1.NotificationType.SYSTEM_ANNOUNCEMENT,
                    priority: priority || notification_model_1.NotificationPriority.MEDIUM,
                    recipientType: notification_model_1.RecipientType.TEACHERS,
                    data: {
                        ...enrichedData,
                        url,
                        imageUrl
                    },
                    createdBy
                });
                if (notification) {
                    res.status(201).json({
                        success: true,
                        message: 'Notification sent to teachers successfully',
                        data: notification
                    });
                }
                else {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to send notification to teachers'
                    });
                }
            }
            catch (error) {
                console.error('Error in sendToTeachers:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.sendToStudents = async (req, res) => {
            try {
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation errors',
                        errors: errors.array()
                    });
                    return;
                }
                const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
                const createdBy = req.user?.id;
                if (!createdBy) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                let enrichedData = { ...(data || {}) };
                if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
                    const baseDir = path_1.default.join(__dirname, '../../public/uploads/notifications');
                    const toRelative = (p) => {
                        const u = p.replace(/\\/g, '/');
                        const i = u.lastIndexOf('/public/');
                        if (i !== -1)
                            return u.substring(i + '/public/'.length);
                        const j = u.indexOf('uploads/');
                        return j !== -1 ? u.substring(j) : u;
                    };
                    if (attachments?.pdfBase64) {
                        const pdfPath = await (0, file_util_1.saveBase64File)(attachments.pdfBase64, baseDir, 'attachment.pdf');
                        enrichedData['attachments'] = { ...(enrichedData['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
                    }
                    if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
                        const imagePaths = await (0, file_util_1.saveMultipleBase64Images)(attachments.imagesBase64, baseDir);
                        enrichedData['attachments'] = {
                            ...(enrichedData['attachments'] || {}),
                            imageUrls: imagePaths.map(toRelative),
                        };
                    }
                }
                const notification = await this.notificationService.createAndSendNotification({
                    title,
                    message,
                    type: type || notification_model_1.NotificationType.SYSTEM_ANNOUNCEMENT,
                    priority: priority || notification_model_1.NotificationPriority.MEDIUM,
                    recipientType: notification_model_1.RecipientType.STUDENTS,
                    data: {
                        ...enrichedData,
                        url,
                        imageUrl
                    },
                    createdBy
                });
                if (notification) {
                    res.status(201).json({
                        success: true,
                        message: 'Notification sent to students successfully',
                        data: notification
                    });
                }
                else {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to send notification to students'
                    });
                }
            }
            catch (error) {
                console.error('Error in sendToStudents:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.sendToSpecificUsers = async (req, res) => {
            try {
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation errors',
                        errors: errors.array()
                    });
                    return;
                }
                const { title, message, type, priority, recipientIds, recipientType, data, url, imageUrl, attachments } = req.body;
                const createdBy = req.user?.id;
                if (!createdBy) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                if (!recipientIds || recipientIds.length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Recipient IDs are required'
                    });
                    return;
                }
                let enrichedData = { ...(data || {}) };
                if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
                    const baseDir = path_1.default.join(__dirname, '../../public/uploads/notifications');
                    const toRelative = (p) => {
                        const u = p.replace(/\\/g, '/');
                        const i = u.lastIndexOf('/public/');
                        if (i !== -1)
                            return u.substring(i + '/public/'.length);
                        const j = u.indexOf('uploads/');
                        return j !== -1 ? u.substring(j) : u;
                    };
                    if (attachments?.pdfBase64) {
                        const pdfPath = await (0, file_util_1.saveBase64File)(attachments.pdfBase64, baseDir, 'attachment.pdf');
                        enrichedData['attachments'] = { ...(enrichedData['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
                    }
                    if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
                        const imagePaths = await (0, file_util_1.saveMultipleBase64Images)(attachments.imagesBase64, baseDir);
                        enrichedData['attachments'] = {
                            ...(enrichedData['attachments'] || {}),
                            imageUrls: imagePaths.map(toRelative),
                        };
                    }
                }
                const notification = await this.notificationService.createAndSendNotification({
                    title,
                    message,
                    type: type || notification_model_1.NotificationType.SYSTEM_ANNOUNCEMENT,
                    priority: priority || notification_model_1.NotificationPriority.MEDIUM,
                    recipientType: recipientType || notification_model_1.RecipientType.SPECIFIC_TEACHERS,
                    recipientIds,
                    data: {
                        ...enrichedData,
                        url,
                        imageUrl
                    },
                    createdBy
                });
                if (notification) {
                    res.status(201).json({
                        success: true,
                        message: 'Notification sent to specific users successfully',
                        data: notification
                    });
                }
                else {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to send notification to specific users'
                    });
                }
            }
            catch (error) {
                console.error('Error in sendToSpecificUsers:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.sendTemplateNotification = async (req, res) => {
            try {
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation errors',
                        errors: errors.array()
                    });
                    return;
                }
                const { templateName, variables, recipients } = req.body;
                const createdBy = req.user?.id;
                if (!createdBy) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                const notification = await this.notificationService.sendTemplateNotification(templateName, variables, recipients, createdBy);
                if (notification) {
                    res.status(201).json({
                        success: true,
                        message: 'Template notification sent successfully',
                        data: notification
                    });
                }
                else {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to send template notification'
                    });
                }
            }
            catch (error) {
                console.error('Error in sendTemplateNotification:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.getNotifications = async (req, res) => {
            try {
                const { type, status, priority, recipientType, createdBy, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
                const filters = {
                    type: type,
                    status: status,
                    priority: priority,
                    recipientType: recipientType,
                    createdBy: createdBy,
                    page: parseInt(page),
                    limit: parseInt(limit)
                };
                if (dateFrom) {
                    filters.dateFrom = new Date(dateFrom);
                }
                if (dateTo) {
                    filters.dateTo = new Date(dateTo);
                }
                const result = await notification_model_1.NotificationModel.findMany(filters);
                res.status(200).json({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error('Error in getNotifications:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.getNotificationById = async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    res.status(400).json({
                        success: false,
                        message: 'Notification ID is required'
                    });
                    return;
                }
                const notification = await notification_model_1.NotificationModel.findById(id);
                if (!notification) {
                    res.status(404).json({
                        success: false,
                        message: 'Notification not found'
                    });
                    return;
                }
                res.status(200).json({
                    success: true,
                    data: notification
                });
            }
            catch (error) {
                console.error('Error in getNotificationById:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.getUserNotifications = async (req, res) => {
            try {
                const userId = req.user?.id;
                const { page = 1, limit = 10, q, type, courseId, subType } = req.query;
                if (!userId) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                const parsedType = type && Object.values(notification_model_1.NotificationType).includes(type)
                    ? type
                    : null;
                const result = await this.notificationService.getUserNotifications(userId, parseInt(page), parseInt(limit), {
                    q: q ? String(q) : null,
                    type: parsedType,
                    courseId: courseId ? String(courseId) : null,
                    subType: subType ? String(subType) : null,
                });
                const toAbsolute = (p) => {
                    if (!p)
                        return p;
                    const path = p.startsWith('/') ? p : `/${p}`;
                    return `${req.protocol}://${req.get('host')}${path}`;
                };
                const isAbsoluteUrl = (u) => !!u && /^(https?:)?\/\//i.test(u);
                const rawList = (result.notifications || result.data || []);
                const notifications = await Promise.all(rawList.map(async (n) => {
                    const data = n.data || {};
                    let attachments = data.attachments || {};
                    if (n.type === notification_model_1.NotificationType.ASSIGNMENT_DUE || n.type === 'assignment_due') {
                        const assignmentId = data.assignmentId || data.assignment_id;
                        const hasFiles = attachments && (Array.isArray(attachments.files) ? attachments.files.length > 0 : false);
                        if (assignmentId && !hasFiles) {
                            try {
                                const assignment = await assignment_model_1.AssignmentModel.getById(String(assignmentId));
                                if (assignment && assignment.attachments) {
                                    attachments = { ...(attachments || {}), ...assignment.attachments };
                                }
                            }
                            catch (e) {
                            }
                        }
                    }
                    const link = data.link && !isAbsoluteUrl(data.link) ? toAbsolute(String(data.link)) : data.link;
                    const url = data.url && !isAbsoluteUrl(data.url) ? toAbsolute(String(data.url)) : data.url;
                    const imageUrl = data.imageUrl && !isAbsoluteUrl(data.imageUrl) ? toAbsolute(String(data.imageUrl)) : data.imageUrl;
                    const pdfUrl = attachments?.pdfUrl ? toAbsolute(attachments.pdfUrl) : undefined;
                    const imageUrls = Array.isArray(attachments?.imageUrls)
                        ? attachments.imageUrls.map((u) => toAbsolute(u))
                        : undefined;
                    const files = Array.isArray(attachments?.files)
                        ? attachments.files.map((f) => ({
                            ...f,
                            url: typeof f?.url === 'string' && !isAbsoluteUrl(f.url) ? toAbsolute(f.url) : f?.url,
                        }))
                        : undefined;
                    return {
                        ...n,
                        data: {
                            ...data,
                            ...(link ? { link } : {}),
                            ...(url ? { url } : {}),
                            ...(imageUrl ? { imageUrl } : {}),
                            attachments: {
                                ...(attachments || {}),
                                ...(pdfUrl ? { pdfUrl } : {}),
                                ...(imageUrls ? { imageUrls } : {}),
                                ...(files ? { files } : {}),
                            },
                        },
                    };
                }));
                const modified = {
                    ...result,
                    notifications,
                };
                res.status(200).json({
                    success: true,
                    data: modified
                });
            }
            catch (error) {
                console.error('Error in getUserNotifications:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.createAndSendNotification = async (notificationData) => {
            return await this.notificationService.createAndSendNotification(notificationData);
        };
        this.markAsRead = async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user?.id;
                if (!id) {
                    res.status(400).json({
                        success: false,
                        message: 'Notification ID is required'
                    });
                    return;
                }
                if (!userId) {
                    res.status(401).json({
                        success: false,
                        message: 'User not authenticated'
                    });
                    return;
                }
                const success = await this.notificationService.markNotificationAsRead(id, userId);
                if (success) {
                    res.status(200).json({
                        success: true,
                        message: 'Notification marked as read'
                    });
                }
                else {
                    res.status(404).json({
                        success: false,
                        message: 'Notification not found or already marked as read'
                    });
                }
            }
            catch (error) {
                console.error('Error in markAsRead:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.getStatistics = async (_req, res) => {
            try {
                const stats = await this.notificationService.getNotificationStats();
                res.status(200).json({
                    success: true,
                    data: stats
                });
            }
            catch (error) {
                console.error('Error in getStatistics:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.processPendingNotifications = async (_req, res) => {
            try {
                await this.notificationService.processPendingNotifications();
                res.status(200).json({
                    success: true,
                    message: 'Pending notifications processed successfully'
                });
            }
            catch (error) {
                console.error('Error in processPendingNotifications:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.deleteNotification = async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    res.status(400).json({
                        success: false,
                        message: 'Notification ID is required'
                    });
                    return;
                }
                const success = await notification_model_1.NotificationModel.delete(id);
                if (success) {
                    res.status(200).json({
                        success: true,
                        message: 'Notification deleted successfully'
                    });
                }
                else {
                    res.status(404).json({
                        success: false,
                        message: 'Notification not found'
                    });
                }
            }
            catch (error) {
                console.error('Error in deleteNotification:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        const oneSignalConfig = {
            appId: process.env['ONESIGNAL_APP_ID'] || '',
            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
        };
        this.notificationService = new notification_service_1.NotificationService(oneSignalConfig);
    }
}
exports.NotificationController = NotificationController;
exports.notificationValidation = {
    sendNotification: [
        (0, express_validator_1.body)('title').notEmpty().withMessage('Title is required').isLength({ max: 255 }).withMessage('Title too long'),
        (0, express_validator_1.body)('message').notEmpty().withMessage('Message is required'),
        (0, express_validator_1.body)('type').optional().isIn(Object.values(notification_model_1.NotificationType)).withMessage('Invalid notification type'),
        (0, express_validator_1.body)('priority').optional().isIn(Object.values(notification_model_1.NotificationPriority)).withMessage('Invalid priority'),
        (0, express_validator_1.body)('data').optional().isObject().withMessage('Data must be an object'),
        (0, express_validator_1.body)('url').optional().isURL().withMessage('Invalid URL'),
        (0, express_validator_1.body)('imageUrl').optional().isURL().withMessage('Invalid image URL')
    ],
    sendToSpecificUsers: [
        (0, express_validator_1.body)('title').notEmpty().withMessage('Title is required').isLength({ max: 255 }).withMessage('Title too long'),
        (0, express_validator_1.body)('message').notEmpty().withMessage('Message is required'),
        (0, express_validator_1.body)('recipientIds').isArray({ min: 1 }).withMessage('At least one recipient ID is required'),
        (0, express_validator_1.body)('recipientIds.*').isUUID().withMessage('Invalid recipient ID format'),
        (0, express_validator_1.body)('type').optional().isIn(Object.values(notification_model_1.NotificationType)).withMessage('Invalid notification type'),
        (0, express_validator_1.body)('priority').optional().isIn(Object.values(notification_model_1.NotificationPriority)).withMessage('Invalid priority'),
        (0, express_validator_1.body)('recipientType').optional().isIn([notification_model_1.RecipientType.SPECIFIC_TEACHERS, notification_model_1.RecipientType.SPECIFIC_STUDENTS]).withMessage('Invalid recipient type'),
        (0, express_validator_1.body)('data').optional().isObject().withMessage('Data must be an object'),
        (0, express_validator_1.body)('url').optional().isURL().withMessage('Invalid URL'),
        (0, express_validator_1.body)('imageUrl').optional().isURL().withMessage('Invalid image URL')
    ],
    sendTemplateNotification: [
        (0, express_validator_1.body)('templateName').notEmpty().withMessage('Template name is required'),
        (0, express_validator_1.body)('variables').isObject().withMessage('Variables must be an object'),
        (0, express_validator_1.body)('recipients').isObject().withMessage('Recipients must be an object'),
        (0, express_validator_1.body)('recipients.userIds').optional().isArray().withMessage('User IDs must be an array'),
        (0, express_validator_1.body)('recipients.userTypes').optional().isArray().withMessage('User types must be an array'),
        (0, express_validator_1.body)('recipients.allUsers').optional().isBoolean().withMessage('All users must be a boolean')
    ],
    getNotifications: [
        (0, express_validator_1.query)('type').optional().isIn(Object.values(notification_model_1.NotificationType)).withMessage('Invalid notification type'),
        (0, express_validator_1.query)('status').optional().isIn(['pending', 'sent', 'delivered', 'read', 'failed']).withMessage('Invalid status'),
        (0, express_validator_1.query)('priority').optional().isIn(Object.values(notification_model_1.NotificationPriority)).withMessage('Invalid priority'),
        (0, express_validator_1.query)('recipientType').optional().isIn(Object.values(notification_model_1.RecipientType)).withMessage('Invalid recipient type'),
        (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        (0, express_validator_1.query)('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
        (0, express_validator_1.query)('dateTo').optional().isISO8601().withMessage('Invalid date format')
    ],
    getNotificationById: [
        (0, express_validator_1.param)('id').isUUID().withMessage('Invalid notification ID')
    ],
    markAsRead: [
        (0, express_validator_1.param)('id').isUUID().withMessage('Invalid notification ID')
    ],
    deleteNotification: [
        (0, express_validator_1.param)('id').isUUID().withMessage('Invalid notification ID')
    ]
};
//# sourceMappingURL=notification.controller.js.map