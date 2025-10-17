"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignmentService = void 0;
const assignment_model_1 = require("../models/assignment.model");
class AssignmentService {
    async createAssignment(payload) {
        const assignment = await assignment_model_1.AssignmentModel.create(payload);
        return assignment;
    }
    async listByTeacher(teacherId, page = 1, limit = 20, studyYear) {
        return assignment_model_1.AssignmentModel.listByTeacher(teacherId, page, limit, studyYear);
    }
    async getById(id) {
        return assignment_model_1.AssignmentModel.getById(id);
    }
    async update(id, patch) {
        return assignment_model_1.AssignmentModel.update(id, patch);
    }
    async softDelete(id) {
        return assignment_model_1.AssignmentModel.softDelete(id);
    }
    async setRecipients(assignmentId, studentIds) {
        await assignment_model_1.AssignmentModel.setRecipients(assignmentId, studentIds);
    }
    async listForStudent(studentId, page = 1, limit = 20, studyYear) {
        return assignment_model_1.AssignmentModel.listForStudent(studentId, page, limit, studyYear);
    }
    async submit(assignmentId, studentId, data) {
        return assignment_model_1.AssignmentModel.upsertSubmission(assignmentId, studentId, data);
    }
    async grade(assignmentId, studentId, score, gradedBy, feedback) {
        const existing = await assignment_model_1.AssignmentModel.getSubmission(assignmentId, studentId);
        if (!existing) {
            return assignment_model_1.AssignmentModel.upsertSubmission(assignmentId, studentId, {
                status: 'graded',
                score,
                graded_at: new Date().toISOString(),
                graded_by: gradedBy,
                feedback: feedback ?? null,
            });
        }
        return assignment_model_1.AssignmentModel.gradeSubmission(assignmentId, studentId, score, gradedBy, feedback);
    }
}
exports.AssignmentService = AssignmentService;
//# sourceMappingURL=assignment.service.js.map