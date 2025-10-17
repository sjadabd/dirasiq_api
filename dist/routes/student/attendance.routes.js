"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendance_controller_1 = require("../../controllers/student/attendance.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent);
router.post('/check-in', attendance_controller_1.StudentAttendanceController.checkIn);
router.get('/by-course/:courseId', attendance_controller_1.StudentAttendanceController.getMyAttendanceByCourse);
exports.default = router;
//# sourceMappingURL=attendance.routes.js.map