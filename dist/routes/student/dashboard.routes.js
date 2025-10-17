"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../../controllers/student/dashboard.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/overview', dashboard_controller_1.StudentDashboardController.getOverview);
router.get('/weekly-schedule', dashboard_controller_1.StudentDashboardController.getWeeklySchedule);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map