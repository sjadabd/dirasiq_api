"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../../controllers/teacher/dashboard.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.use(auth_middleware_1.requireTeacher);
router.get('/', dashboard_controller_1.TeacherDashboardController.getDashboard);
router.get('/upcoming-today', dashboard_controller_1.TeacherDashboardController.getTodayUpcomingSessions);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map