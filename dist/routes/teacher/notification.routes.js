"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../../controllers/teacher/notification.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher);
router.get('/', notification_controller_1.TeacherNotificationController.listMyNotifications);
router.post('/', notification_controller_1.TeacherNotificationController.createNotification);
router.delete('/:id', notification_controller_1.TeacherNotificationController.deleteNotification);
exports.default = router;
//# sourceMappingURL=notification.routes.js.map