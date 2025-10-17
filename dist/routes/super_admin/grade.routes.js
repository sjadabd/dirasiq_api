"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const grade_controller_1 = require("../../controllers/super_admin/grade.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/all-student', grade_controller_1.GradeController.getAllActive);
router.use(auth_middleware_1.authenticateToken);
router.get('/all', grade_controller_1.GradeController.getAllActive);
router.get('/my-grades', grade_controller_1.GradeController.getUserGrades);
router.use(auth_middleware_1.requireSuperAdmin);
router.post('/', grade_controller_1.GradeController.create);
router.get('/:id', grade_controller_1.GradeController.getById);
router.put('/:id', grade_controller_1.GradeController.update);
router.delete('/:id', grade_controller_1.GradeController.delete);
router.get('/active', grade_controller_1.GradeController.getActive);
exports.default = router;
//# sourceMappingURL=grade.routes.js.map