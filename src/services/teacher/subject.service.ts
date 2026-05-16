import { SubjectModel } from '../../models/subject.model';
import { UserModel } from '../../models/user.model';
import type { CreateSubjectRequest, Subject, UpdateSubjectRequest } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';

const requireTeacher = async (teacherId: string): Promise<void> => {
  const teacher = await UserModel.findById(teacherId);
  if (!teacher || teacher.userType !== 'teacher') {
    throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
  }
};

export class SubjectService {
  static async create(
    teacherId: string,
    data: CreateSubjectRequest
  ): Promise<{ subject: Subject }> {
    await requireTeacher(teacherId);
    if (await SubjectModel.nameExistsForTeacher(teacherId, data.name)) {
      throw new ApiError(409, 'المادة موجودة بالفعل', ErrorCodes.ALREADY_EXISTS);
    }
    const subject = await SubjectModel.create(teacherId, data);
    return { subject };
  }

  static async getAllByTeacher(
    teacherId: string,
    page = 1,
    limit = 10,
    search?: string,
    includeDeleted: boolean | null = false
  ): Promise<{ items: Subject[]; total: number }> {
    await requireTeacher(teacherId);
    const result = await SubjectModel.findAllByTeacher(
      teacherId,
      page,
      limit,
      search,
      includeDeleted
    );
    return { items: result.subjects, total: result.total };
  }

  static async getById(id: string, teacherId: string): Promise<{ subject: Subject }> {
    const subject = await SubjectModel.findByIdAndTeacher(id, teacherId);
    if (!subject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { subject };
  }

  static async update(
    id: string,
    teacherId: string,
    data: UpdateSubjectRequest
  ): Promise<{ subject: Subject }> {
    const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId);
    if (!existingSubject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (data.name && data.name !== existingSubject.name) {
      if (await SubjectModel.nameExistsForTeacher(teacherId, data.name, id)) {
        throw new ApiError(409, 'المادة موجودة بالفعل', ErrorCodes.ALREADY_EXISTS);
      }
    }
    const subject = await SubjectModel.update(id, teacherId, data);
    if (!subject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { subject };
  }

  static async delete(id: string, teacherId: string): Promise<void> {
    const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId);
    if (!existingSubject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const deleted = await SubjectModel.delete(id, teacherId);
    if (!deleted) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async restore(id: string, teacherId: string): Promise<void> {
    const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId, true);
    if (!existingSubject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (!existingSubject.deleted_at) {
      throw new ApiError(400, 'المادة غير محذوفة', ErrorCodes.BUSINESS_RULE);
    }
    const restored = await SubjectModel.restore(id, teacherId);
    if (!restored) {
      throw new ApiError(500, 'فشل في استعادة المادة', ErrorCodes.INTERNAL_ERROR);
    }
  }

  static async hardDelete(id: string, teacherId: string): Promise<void> {
    const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId, true);
    if (!existingSubject) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const deleted = await SubjectModel.hardDelete(id, teacherId);
    if (!deleted) {
      throw new ApiError(404, 'المادة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  /** Simple `{id, name}` list for selects. */
  static async getAllSubjects(teacherId: string): Promise<Array<{ id: string; name: string }>> {
    await requireTeacher(teacherId);
    const result = await SubjectModel.findAllByTeacher(teacherId, 1, 1000, undefined, false);
    return result.subjects.map((subject) => ({ id: subject.id, name: subject.name }));
  }
}
