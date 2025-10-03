import { StudentEvaluationModel, StudentEvaluation, EvalRating } from '@/models/student-evaluation.model';

export class StudentEvaluationService {
  get model() { return StudentEvaluationModel; }

  async upsertMany(
    teacherId: string,
    evalDate: string,
    items: Array<{
      student_id: string;
      scientific_level: EvalRating;
      behavioral_level: EvalRating;
      attendance_level: EvalRating;
      homework_preparation: EvalRating;
      participation_level: EvalRating;
      instruction_following: EvalRating;
      guidance?: string | null;
      notes?: string | null;
    }>
  ): Promise<StudentEvaluation[]> {
    return StudentEvaluationModel.upsertMany(teacherId, evalDate, items);
  }

  async update(id: string, patch: Partial<StudentEvaluation>): Promise<StudentEvaluation | null> {
    return StudentEvaluationModel.update(id, patch);
  }

  async getById(id: string): Promise<StudentEvaluation | null> {
    return StudentEvaluationModel.getById(id);
  }

  async listForTeacher(
    teacherId: string,
    filters: { studentId?: string; from?: string; to?: string; page?: number; limit?: number }
  ) {
    return StudentEvaluationModel.listForTeacher(teacherId, filters);
  }

  async listForStudent(
    studentId: string,
    filters: { from?: string; to?: string; page?: number; limit?: number }
  ) {
    return StudentEvaluationModel.listForStudent(studentId, filters);
  }
}
