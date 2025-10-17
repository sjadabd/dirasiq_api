"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assignment_controller_1 = require("../../controllers/teacher/assignment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.create);
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.list);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.getById);
router.get('/:id/overview', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.overview);
router.get('/:id/students', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.students);
router.patch('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.update);
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.remove);
router.put('/:id/recipients', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.setRecipients);
router.put('/:assignmentId/grade/:studentId', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.grade);
router.get('/:id/recipients', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.recipients);
router.get('/:assignmentId/submission/:studentId', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, assignment_controller_1.TeacherAssignmentController.getStudentSubmission);
exports.default = router;
//# sourceMappingURL=assignment.routes.js.map