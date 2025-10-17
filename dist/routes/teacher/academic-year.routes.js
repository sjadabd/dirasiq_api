"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academic_year_controller_1 = require("../../controllers/teacher/academic-year.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, academic_year_controller_1.TeacherAcademicYearController.list);
exports.default = router;
//# sourceMappingURL=academic-year.routes.js.map