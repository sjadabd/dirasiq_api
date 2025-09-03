import { AcademicYearModel } from '@/models/academic-year.model';
import {
  ApiResponse,
  CreateAcademicYearRequest,
  UpdateAcademicYearRequest
} from '@/types';
import { getMessage } from '@/utils/messages';

export class AcademicYearService {
  // Create new academic year
  static async create(data: CreateAcademicYearRequest): Promise<ApiResponse> {
    try {
      // Validate year format (YYYY-YYYY)
      const yearPattern = /^\d{4}-\d{4}$/;
      if (!yearPattern.test(data.year)) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.INVALID_FORMAT'),
          errors: [getMessage('ACADEMIC_YEAR.YEAR_PATTERN')]
        };
      }

      // Check if year already exists
      const existingYear = await AcademicYearModel.yearExists(data.year);
      if (existingYear) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.ALREADY_EXISTS'),
          errors: [getMessage('ACADEMIC_YEAR.ALREADY_EXISTS')]
        };
      }

      // Create academic year
      const academicYear = await AcademicYearModel.create(data);

      return {
        success: true,
        message: getMessage('ACADEMIC_YEAR.CREATED'),
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error creating academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get all academic years with pagination
  static async getAll(page: number = 1, limit: number = 10, search?: string, isActive?: boolean): Promise<ApiResponse> {
    try {
      const result = await AcademicYearModel.findAll(page, limit, search, isActive);

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: result.academicYears,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting academic years:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error getting academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('ACADEMIC_YEAR.NO_ACTIVE_YEAR'),
          errors: [getMessage('ACADEMIC_YEAR.NO_ACTIVE_YEAR')]
        };
      }

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error getting active academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      // Validate year format if provided
      if (data.year) {
        const yearPattern = /^\d{4}-\d{4}$/;
        if (!yearPattern.test(data.year)) {
          return {
            success: false,
            message: getMessage('ACADEMIC_YEAR.INVALID_FORMAT'),
            errors: [getMessage('ACADEMIC_YEAR.YEAR_PATTERN')]
          };
        }

        // Check if year already exists (excluding current record)
        const existingYear = await AcademicYearModel.yearExists(data.year, id);
        if (existingYear) {
          return {
            success: false,
            message: getMessage('ACADEMIC_YEAR.ALREADY_EXISTS'),
            errors: [getMessage('ACADEMIC_YEAR.ALREADY_EXISTS')]
          };
        }
      }

      // Update academic year
      const academicYear = await AcademicYearModel.update(id, data);

      if (!academicYear) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('ACADEMIC_YEAR.UPDATED'),
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error updating academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      // Check if it's active (prevent deletion of active year)
      if (academicYear.is_active) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.CANNOT_DELETE_ACTIVE'),
          errors: [getMessage('ACADEMIC_YEAR.CANNOT_DELETE_ACTIVE')]
        };
      }

      // Delete academic year
      const deleted = await AcademicYearModel.delete(id);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('ACADEMIC_YEAR.DELETED')
      };
    } catch (error) {
      console.error('Error deleting academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      // Activate academic year (this will deactivate all others)
      const academicYear = await AcademicYearModel.activate(id);

      if (!academicYear) {
        return {
          success: false,
          message: getMessage('ACADEMIC_YEAR.NOT_FOUND'),
          errors: [getMessage('ACADEMIC_YEAR.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('ACADEMIC_YEAR.ACTIVATED'),
        data: { academicYear }
      };
    } catch (error) {
      console.error('Error activating academic year:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}
