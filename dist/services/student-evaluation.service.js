"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentEvaluationService = void 0;
const student_evaluation_model_1 = require("../models/student-evaluation.model");
class StudentEvaluationService {
    get model() { return student_evaluation_model_1.StudentEvaluationModel; }
    async upsertMany(teacherId, evalDate, items) {
        return student_evaluation_model_1.StudentEvaluationModel.upsertMany(teacherId, evalDate, items);
    }
    async update(id, patch) {
        return student_evaluation_model_1.StudentEvaluationModel.update(id, patch);
    }
    async getById(id) {
        return student_evaluation_model_1.StudentEvaluationModel.getById(id);
    }
    async listForTeacher(teacherId, filters) {
        return student_evaluation_model_1.StudentEvaluationModel.listForTeacher(teacherId, filters);
    }
    async listForStudent(studentId, filters) {
        return student_evaluation_model_1.StudentEvaluationModel.listForStudent(studentId, filters);
    }
}
exports.StudentEvaluationService = StudentEvaluationService;
//# sourceMappingURL=student-evaluation.service.js.map