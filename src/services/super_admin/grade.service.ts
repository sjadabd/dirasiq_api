import { GradeModel } from '@/models/grade.model';
import { ApiResponse, CreateGradeRequest, UpdateGradeRequest } from '@/types';
import { getMessage } from '@/utils/messages';

export class GradeService {
  // Create new grade (Super Admin only)
  static async create(data: CreateGradeRequest): Promise<ApiResponse> {
    try {
      // Check if grade name already exists
      const existingGrade = await GradeModel.nameExists(data.name);
      if (existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.ALREADY_EXISTS'),
          errors: [getMessage('GRADE.ALREADY_EXISTS')]
        };
      }

      // Create grade
      const grade = await GradeModel.create(data);

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

  // Get all grades with pagination (Super Admin only)
  static async getAll(page: number = 1, limit: number = 10, search?: string): Promise<ApiResponse> {
    try {
      const result = await GradeModel.findAll(page, limit, search);

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

  // Get active grades only (for public use)
  static async getActive(): Promise<ApiResponse> {
    try {
      const grades = await GradeModel.findActive();

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: grades
      };
    } catch (error) {
      console.error('Error getting active grades:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get grade by ID
  static async getById(id: string): Promise<ApiResponse> {
    try {
      const grade = await GradeModel.findById(id);

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

  // Update grade (Super Admin only)
  static async update(id: string, data: UpdateGradeRequest): Promise<ApiResponse> {
    try {
      // Check if grade exists
      const existingGrade = await GradeModel.findById(id);
      if (!existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      // Check if new name conflicts with existing grade
      if (data.name && data.name !== existingGrade.name) {
        const nameExists = await GradeModel.nameExists(data.name, id);
        if (nameExists) {
          return {
            success: false,
            message: getMessage('GRADE.ALREADY_EXISTS'),
            errors: [getMessage('GRADE.ALREADY_EXISTS')]
          };
        }
      }

      // Update grade
      const updatedGrade = await GradeModel.update(id, data);

      if (!updatedGrade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GRADE.UPDATED'),
        data: { grade: updatedGrade }
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

  // Delete grade (Super Admin only)
  static async delete(id: string): Promise<ApiResponse> {
    try {
      // Check if grade exists
      const existingGrade = await GradeModel.findById(id);
      if (!existingGrade) {
        return {
          success: false,
          message: getMessage('GRADE.NOT_FOUND'),
          errors: [getMessage('GRADE.NOT_FOUND')]
        };
      }

      // Soft delete grade
      const deleted = await GradeModel.delete(id);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('GENERAL.OPERATION_FAILED'),
          errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
