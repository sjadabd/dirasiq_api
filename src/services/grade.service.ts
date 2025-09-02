import { GradeModel } from '@/models/grade.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse, CreateGradeRequest, UpdateGradeRequest } from '@/types';
import { getMessage } from '@/utils/messages';

export class GradeService {
  // Create new grade
  static async create(teacherId: string, data: CreateGradeRequest): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: getMessage('GRADE.TEACHER_NOT_FOUND'),
          errors: [getMessage('GRADE.TEACHER_NOT_FOUND')]
        };
      }

      // Check if grade name already exists for this teacher
      const existingGrade = await GradeModel.nameExistsForTeacher(teacherId, data.name);
      if (existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.ALREADY_EXISTS'),
          errors: [getMessage('GRADE.ALREADY_EXISTS')]
        };
      }

      // Create grade
      const grade = await GradeModel.create(teacherId, data);

      return {
        success: true,
        message: getMessage('GRADE.CREATED'),
        data: { grade }
      };
    } catch (error) {
      console.error('Error creating grade:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get all grades for a teacher with pagination
  static async getAllByTeacher(teacherId: string, page: number = 1, limit: number = 10, search?: string): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: getMessage('GRADE.TEACHER_NOT_FOUND'),
          errors: [getMessage('GRADE.TEACHER_NOT_FOUND')]
        };
      }

      const result = await GradeModel.findAllByTeacher(teacherId, page, limit, search);

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: result.grades,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting grades:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get grade by ID
  static async getById(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      const grade = await GradeModel.findByIdAndTeacher(id, teacherId);

      if (!grade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: { grade }
      };
    } catch (error) {
      console.error('Error getting grade:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Update grade
  static async update(id: string, teacherId: string, data: UpdateGradeRequest): Promise<ApiResponse> {
    try {
      // Check if grade exists and belongs to teacher
      const existingGrade = await GradeModel.findByIdAndTeacher(id, teacherId);
      if (!existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      // Check if new name already exists for this teacher (if name is being updated)
      if (data.name && data.name !== existingGrade.name) {
        const nameExists = await GradeModel.nameExistsForTeacher(teacherId, data.name, id);
        if (nameExists) {
          return {
            success: false,
            message: getMessage('GRADE.ALREADY_EXISTS'),
            errors: [getMessage('GRADE.ALREADY_EXISTS')]
          };
        }
      }

      // Update grade
      const grade = await GradeModel.update(id, teacherId, data);

      if (!grade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GRADE.UPDATED'),
        data: { grade }
      };
    } catch (error) {
      console.error('Error updating grade:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Delete grade
  static async delete(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if grade exists and belongs to teacher
      const existingGrade = await GradeModel.findByIdAndTeacher(id, teacherId);
      if (!existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      // Delete grade
      const deleted = await GradeModel.delete(id, teacherId);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GRADE.DELETED')
      };
    } catch (error) {
      console.error('Error deleting grade:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}
