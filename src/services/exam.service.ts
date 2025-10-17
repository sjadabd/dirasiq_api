import { Exam, ExamGrade, ExamModel, ExamType } from '../models/exam.model';

export class ExamService {
  get model() { return ExamModel; }

  async createExam(payload: Partial<Exam> & { teacher_id: string }): Promise<Exam> {
    return ExamModel.create(payload);
  }

  async updateExam(id: string, patch: Partial<Exam>): Promise<Exam | null> {
    return ExamModel.update(id, patch);
  }

  async removeExam(id: string): Promise<boolean> {
    return ExamModel.remove(id);
  }

  async getById(id: string): Promise<Exam | null> {
    return ExamModel.getById(id);
  }

  async listByTeacher(teacherId: string, page = 1, limit = 20, type?: ExamType) {
    return ExamModel.listByTeacher(teacherId, page, limit, type);
  }

  async listForStudent(studentId: string, page = 1, limit = 20, type?: ExamType) {
    return ExamModel.listForStudent(studentId, page, limit, type);
  }

  async setGrade(examId: string, studentId: string, score: number, gradedBy: string): Promise<ExamGrade> {
    return ExamModel.setGrade(examId, studentId, score, gradedBy);
  }
}
