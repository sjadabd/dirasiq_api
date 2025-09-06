import { AcademicYearModel } from '@/models/academic-year.model';
import {
  ApiResponse,
  CreateAcademicYearRequest,
  UpdateAcademicYearRequest
} from '@/types';

export class AcademicYearService {
  // Create new academic year
  static async create(data: CreateAcademicYearRequest): Promise<ApiResponse> {
    try {
      // Validate year format (YYYY-YYYY)
      const yearPattern = /^\d{4}-\d{4}$/;
      if (!yearPattern.test(data.year)) {
        return {
          success: false,
          message: 'تنسيق السنة الأكاديمية غير صحيح',
          errors: ['يجب أن تكون السنة بصيغة YYYY-YYYY']
        };
      }

      // Check if year already exists
      const existingYear = await AcademicYearModel.yearExists(data.year);
      if (existingYear) {
        return {
          success: false,
          message: 'السنة الأكاديمية موجودة بالفعل',
          errors: ['السنة الأكاديمية موجودة بالفعل']
        };
      }

      // Create academic year
      const academicYear = await AcademicYearModel.create(data);

      return {
        success: true,
        message: 'تم إنشاء السنة الأكاديمية',
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error creating academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get all academic years with pagination
  static async getAll(page: number = 1, limit: number = 10, search?: string, isActive?: boolean): Promise<ApiResponse> {
    try {
      const result = await AcademicYearModel.findAll(page, limit, search, isActive);

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: result.academicYears,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting academic years:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get academic year by ID
  static async getById(id: string): Promise<ApiResponse> {
    try {
      const academicYear = await AcademicYearModel.findById(id);

      if (!academicYear) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error getting academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get active academic year
  static async getActive(): Promise<ApiResponse> {
    try {
      const academicYear = await AcademicYearModel.getActive();

      if (!academicYear) {
        return {
          success: false,
          message: 'لا توجد سنة أكاديمية نشطة',
          errors: ['لا توجد سنة أكاديمية نشطة']
        };
      }

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error getting active academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Update academic year
  static async update(id: string, data: UpdateAcademicYearRequest): Promise<ApiResponse> {
    try {
      // Check if academic year exists
      const exists = await AcademicYearModel.exists(id);
      if (!exists) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      // Validate year format if provided
      if (data.year) {
        const yearPattern = /^\d{4}-\d{4}$/;
        if (!yearPattern.test(data.year)) {
          return {
            success: false,
            message: 'تنسيق السنة الأكاديمية غير صحيح',
            errors: ['يجب أن تكون السنة بصيغة YYYY-YYYY']
          };
        }

        // Check if year already exists (excluding current record)
        const existingYear = await AcademicYearModel.yearExists(data.year, id);
        if (existingYear) {
          return {
            success: false,
            message: 'السنة الأكاديمية موجودة بالفعل',
            errors: ['السنة الأكاديمية موجودة بالفعل']
          };
        }
      }

      // Update academic year
      const academicYear = await AcademicYearModel.update(id, data);

      if (!academicYear) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم تحديث السنة الأكاديمية',
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error updating academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Delete academic year
  static async delete(id: string): Promise<ApiResponse> {
    try {
      // Check if academic year exists
      const academicYear = await AcademicYearModel.findById(id);
      if (!academicYear) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      // Check if it's active (prevent deletion of active year)
      if (academicYear.is_active) {
        return {
          success: false,
          message: 'لا يمكن حذف السنة الأكاديمية النشطة',
          errors: ['لا يمكن حذف السنة الأكاديمية النشطة']
        };
      }

      // Delete academic year
      const deleted = await AcademicYearModel.delete(id);

      if (!deleted) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم حذف السنة الأكاديمية'
      };
    } catch (error) {
      console.error('Error deleting academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Activate academic year
  static async activate(id: string): Promise<ApiResponse> {
    try {
      // Check if academic year exists
      const exists = await AcademicYearModel.exists(id);
      if (!exists) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      // Activate academic year (this will deactivate all others)
      const academicYear = await AcademicYearModel.activate(id);

      if (!academicYear) {
        return {
          success: false,
          message: 'السنة الأكاديمية غير موجودة',
          errors: ['السنة الأكاديمية غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم تفعيل السنة الأكاديمية',
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error activating academic year:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }
}
