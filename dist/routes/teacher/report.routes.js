"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../../controllers/teacher/report.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/financial', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, report_controller_1.TeacherReportController.financial);
exports.default = router;
//# sourceMappingURL=report.routes.js.map