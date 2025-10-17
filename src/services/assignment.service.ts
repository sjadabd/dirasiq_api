import { Assignment, AssignmentModel, AssignmentSubmission } from '../models/assignment.model';

export class AssignmentService {

  async createAssignment(payload: Partial<Assignment> & { created_by: string }): Promise<Assignment> {
    const assignment = await AssignmentModel.create(payload);

    // Notify students based on visibility. For simplicity, the controller resolves recipient IDs.
    return assignment;
  }

  async listByTeacher(teacherId: string, page = 1, limit = 20, studyYear?: string | null) {
    return AssignmentModel.listByTeacher(teacherId, page, limit, studyYear);
  }

  async getById(id: string) {
    return AssignmentModel.getById(id);
  }

  async update(id: string, patch: Partial<Assignment>) {
    return AssignmentModel.update(id, patch);
  }

  async softDelete(id: string) {
    return AssignmentModel.softDelete(id);
  }

  async setRecipients(assignmentId: string, studentIds: string[]) {
    await AssignmentModel.setRecipients(assignmentId, studentIds);
  }

  async listForStudent(studentId: string, page = 1, limit = 20, studyYear?: string | null) {
    return AssignmentModel.listForStudent(studentId, page, limit, studyYear);
  }

  async submit(assignmentId: string, studentId: string, data: Partial<AssignmentSubmission>) {
    return AssignmentModel.upsertSubmission(assignmentId, studentId, data);
  }

  async grade(assignmentId: string, studentId: string, score: number, gradedBy: string, feedback?: string) {
    // If no submission exists yet, create one as graded
    const existing = await AssignmentModel.getSubmission(assignmentId, studentId);
    if (!existing) {
      return AssignmentModel.upsertSubmission(assignmentId, studentId, {
        status: 'graded',
        score,
        graded_at: new Date().toISOString(),
        graded_by: gradedBy,
        feedback: feedback ?? null,
      } as any);
    }
    return AssignmentModel.gradeSubmission(assignmentId, studentId, score, gradedBy, feedback);
  }
}
