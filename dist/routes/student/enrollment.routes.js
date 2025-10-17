"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const enrollment_controller_1 = require("../../controllers/student/enrollment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/', enrollment_controller_1.StudentEnrollmentController.getMyEnrolledCourses);
router.get('/schedule', enrollment_controller_1.StudentEnrollmentController.getWeeklySchedule);
router.get('/schedule/weekly', enrollment_controller_1.StudentEnrollmentController.getWeeklyScheduleComprehensive);
router.get('/schedule/weekly/by-course/:courseId', enrollment_controller_1.StudentEnrollmentController.getWeeklyScheduleByCourse);
exports.default = router;
//# sourceMappingURL=enrollment.routes.js.map