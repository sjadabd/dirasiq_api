import { GradeModel } from '@/models/grade.model';
import { ApiResponse, CreateGradeRequest, UpdateGradeRequest } from '@/types';

export class GradeService {
  // Create new grade (Super Admin only)
  static async create(data: CreateGradeRequest): Promise<ApiResponse> {
    try {
      // Check if grade name already exists
      const existingGrade = await GradeModel.nameExists(data.name);
      if (existingGrade) {
        return {
          success: false,
          message: 'الصف موجود بالفعل',
          errors: ['الصف موجود بالفعل']
        };
      }

      // Create grade
      const grade = await GradeModel.create(data);

      return {
        success: true,
        message: 'تم إنشاء الصف',
        data: { grade }
      };
    } catch (error) {
      console.error('Error creating grade:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get all grades with pagination (Super Admin only)
  static async getAll(page: number = 1, limit: number = 10, search?: string): Promise<ApiResponse> {
    try {
      const result = await GradeModel.findAll(page, limit, search);

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: result.grades,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting grades:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  static async getAllActive() {
    try {
      const grades = await GradeModel.findActive();
      return { success: true, data: grades };
    } catch (err: any) {
      return { success: false, message: 'فشل في جلب الصفوف', errors: [err.message] };
    }
  }


  // Get active grades only (for public use)
  static async getActive(): Promise<ApiResponse> {
    try {
      const grades = await GradeModel.findActive();

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: grades
      };
    } catch (error) {
      console.error('Error getting active grades:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الصف غير موجود',
          errors: ['الصف غير موجود']
        };
      }

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: { grade }
      };
    } catch (error) {
      console.error('Error getting grade:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الصف غير موجود',
          errors: ['الصف غير موجود']
        };
      }

      // Check if new name conflicts with existing grade
      if (data.name && data.name !== existingGrade.name) {
        const nameExists = await GradeModel.nameExists(data.name, id);
        if (nameExists) {
          return {
            success: false,
            message: 'الصف موجود بالفعل',
            errors: ['الصف موجود بالفعل']
          };
        }
      }

      // Update grade
      const updatedGrade = await GradeModel.update(id, data);

      if (!updatedGrade) {
        return {
          success: false,
          message: 'الصف غير موجود',
          errors: ['الصف غير موجود']
        };
      }

      return {
        success: true,
        message: 'تم تحديث الصف',
        data: { grade: updatedGrade }
      };
    } catch (error) {
      console.error('Error updating grade:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الصف غير موجود',
          errors: ['الصف غير موجود']
        };
      }

      // Soft delete grade
      const deleted = await GradeModel.delete(id);

      if (!deleted) {
        return {
          success: false,
          message: 'فشلت العملية',
          errors: ['خطأ داخلي في الخادم']
        };
      }

      return {
        success: true,
        message: 'تم حذف الصف'
      };
    } catch (error) {
      console.error('Error deleting grade:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }
}
