"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assignment_controller_1 = require("../../controllers/student/assignment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, assignment_controller_1.StudentAssignmentController.list);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, assignment_controller_1.StudentAssignmentController.getById);
router.get('/:id/submission', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, assignment_controller_1.StudentAssignmentController.mySubmission);
router.post('/:id/submit', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, assignment_controller_1.StudentAssignmentController.submit);
exports.default = router;
//# sourceMappingURL=assignment.routes.js.map