"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const types_1 = require("../types");
const router = (0, express_1.Router)();
const notificationController = new notification_controller_1.NotificationController();
router.use(auth_middleware_1.authenticateToken);
router.post('/send-to-all', notification_controller_1.notificationValidation.sendNotification, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN || userType === types_1.UserType.TEACHER) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins and teachers can send notifications to all users.'
        });
    }
}, notificationController.sendToAll);
router.post('/send-to-teachers', notification_controller_1.notificationValidation.sendNotification, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN || userType === types_1.UserType.TEACHER) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins and teachers can send notifications to teachers.'
        });
    }
}, notificationController.sendToTeachers);
router.post('/send-to-students', notification_controller_1.notificationValidation.sendNotification, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN || userType === types_1.UserType.TEACHER) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins and teachers can send notifications to students.'
        });
    }
}, notificationController.sendToStudents);
router.post('/send-to-specific', notification_controller_1.notificationValidation.sendToSpecificUsers, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN || userType === types_1.UserType.TEACHER) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins and teachers can send notifications to specific users.'
        });
    }
}, notificationController.sendToSpecificUsers);
router.post('/send-template', notification_controller_1.notificationValidation.sendTemplateNotification, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN || userType === types_1.UserType.TEACHER) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins and teachers can send template notifications.'
        });
    }
}, notificationController.sendTemplateNotification);
router.get('/', notification_controller_1.notificationValidation.getNotifications, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins can view all notifications.'
        });
    }
}, notificationController.getNotifications);
router.get('/statistics', (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins can view notification statistics.'
        });
    }
}, notificationController.getStatistics);
router.post('/process-pending', (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins can process pending notifications.'
        });
    }
}, notificationController.processPendingNotifications);
router.get('/:id', notification_controller_1.notificationValidation.getNotificationById, (req, _res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN) {
        next();
    }
    else {
        next();
    }
}, notificationController.getNotificationById);
router.delete('/:id', notification_controller_1.notificationValidation.deleteNotification, (req, res, next) => {
    const userType = req.user?.userType;
    if (userType === types_1.UserType.SUPER_ADMIN) {
        next();
    }
    else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Only super admins can delete notifications.'
        });
    }
}, notificationController.deleteNotification);
router.get('/user/my-notifications', (req, _res, next) => {
    const { page = 1, limit = 10 } = req.query;
    req.query = { ...req.query, page, limit };
    next();
}, notificationController.getUserNotifications);
router.put('/:id/read', notification_controller_1.notificationValidation.markAsRead, notificationController.markAsRead);
exports.default = router;
//# sourceMappingURL=notification.routes.js.map