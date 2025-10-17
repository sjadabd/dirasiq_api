"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExamService = void 0;
const exam_model_1 = require("../models/exam.model");
class ExamService {
    get model() { return exam_model_1.ExamModel; }
    async createExam(payload) {
        return exam_model_1.ExamModel.create(payload);
    }
    async updateExam(id, patch) {
        return exam_model_1.ExamModel.update(id, patch);
    }
    async removeExam(id) {
        return exam_model_1.ExamModel.remove(id);
    }
    async getById(id) {
        return exam_model_1.ExamModel.getById(id);
    }
    async listByTeacher(teacherId, page = 1, limit = 20, type) {
        return exam_model_1.ExamModel.listByTeacher(teacherId, page, limit, type);
    }
    async listForStudent(studentId, page = 1, limit = 20, type) {
        return exam_model_1.ExamModel.listForStudent(studentId, page, limit, type);
    }
    async setGrade(examId, studentId, score, gradedBy) {
        return exam_model_1.ExamModel.setGrade(examId, studentId, score, gradedBy);
    }
}
exports.ExamService = ExamService;
//# sourceMappingURL=exam.service.js.map