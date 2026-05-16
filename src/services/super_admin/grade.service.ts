import { GradeModel } from '../../models/grade.model';
import type { CreateGradeRequest, Grade, UpdateGradeRequest } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';

export interface UserGradesResult {
  userType: string;
  studyYear: string;
  grades: Array<{
    id: string;
    gradeId: string;
    gradeName: string;
    studyYear: string;
    createdAt: Date;
  }>;
}

export class GradeService {
  static async create(data: CreateGradeRequest): Promise<{ grade: Grade }> {
    if (await GradeModel.nameExists(data.name)) {
      throw new ApiError(409, 'الصف موجود بالفعل', ErrorCodes.ALREADY_EXISTS);
    }
    const grade = await GradeModel.create(data);
    return { grade };
  }

  static async getAll(
    page = 1,
    limit = 10,
    search?: string
  ): Promise<{ items: Grade[]; total: number }> {
    const result = await GradeModel.findAll(page, limit, search);
    return { items: result.grades, total: result.total };
  }

  static async getAllActive(): Promise<Grade[]> {
    return GradeModel.findActive();
  }

  static async getActive(): Promise<Grade[]> {
    return GradeModel.findActive();
  }

  static async getById(id: string): Promise<{ grade: Grade }> {
    const grade = await GradeModel.findById(id);
    if (!grade) {
      throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
    }
    return { grade };
  }

  static async update(id: string, data: UpdateGradeRequest): Promise<{ grade: Grade }> {
    const existingGrade = await GradeModel.findById(id);
    if (!existingGrade) {
      throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (data.name && data.name !== existingGrade.name) {
      if (await GradeModel.nameExists(data.name, id)) {
        throw new ApiError(409, 'الصف موجود بالفعل', ErrorCodes.ALREADY_EXISTS);
      }
    }
    const updatedGrade = await GradeModel.update(id, data);
    if (!updatedGrade) {
      throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
    }
    return { grade: updatedGrade };
  }

  static async delete(id: string): Promise<void> {
    const existingGrade = await GradeModel.findById(id);
    if (!existingGrade) {
      throw new ApiError(404, 'الصف غير موجود', ErrorCodes.NOT_FOUND);
    }
    const deleted = await GradeModel.delete(id);
    if (!deleted) {
      throw new ApiError(500, 'فشلت العملية', ErrorCodes.INTERNAL_ERROR);
    }
  }

  static async getUserGrades(
    userId: string,
    userType: string,
    studyYear?: string
  ): Promise<UserGradesResult> {
    const { UserModel } = await import('../../models/user.model');
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }

    let activeStudyYear = studyYear;
    if (!activeStudyYear) {
      const { AcademicYearModel } = await import('../../models/academic-year.model');
      const activeAcademicYear = await AcademicYearModel.getActive();
      if (activeAcademicYear) {
        activeStudyYear = activeAcademicYear.year;
      }
    }
    if (!activeStudyYear) {
      throw new ApiError(404, 'لا توجد سنة دراسية نشطة', ErrorCodes.NOT_FOUND);
    }

    let userGrades: UserGradesResult['grades'] = [];

    if (userType === 'teacher') {
      const { TeacherGradeModel } = await import('../../models/teacher-grade.model');
      const teacherGrades = await TeacherGradeModel.findByTeacherId(userId);
      const filteredGrades = teacherGrades.filter((tg) => tg.studyYear === activeStudyYear);
      userGrades = await Promise.all(
        filteredGrades.map(async (tg) => {
          const grade = await GradeModel.findById(tg.gradeId);
          return {
            id: tg.id,
            gradeId: tg.gradeId,
            gradeName: grade?.name || 'غير محدد',
            studyYear: tg.studyYear,
            createdAt: tg.createdAt,
          };
        })
      );
    } else if (userType === 'student') {
      const { StudentGradeModel } = await import('../../models/student-grade.model');
      const studentGrades = await StudentGradeModel.findByStudentId(userId);
      const filteredGrades = studentGrades.filter((sg) => sg.studyYear === activeStudyYear);
      userGrades = await Promise.all(
        filteredGrades.map(async (sg) => {
          const grade = await GradeModel.findById(sg.gradeId);
          return {
            id: sg.id,
            gradeId: sg.gradeId,
            gradeName: grade?.name || 'غير محدد',
            studyYear: sg.studyYear,
            createdAt: sg.createdAt,
          };
        })
      );
    } else {
      throw new ApiError(400, 'نوع المستخدم غير مدعوم', ErrorCodes.VALIDATION_ERROR);
    }

    return { userType, studyYear: activeStudyYear, grades: userGrades };
  }
}
