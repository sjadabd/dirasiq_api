import { AcademicYearModel } from '../../models/academic-year.model';
import type {
  AcademicYear,
  CreateAcademicYearRequest,
  UpdateAcademicYearRequest,
} from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';

const YEAR_PATTERN = /^\d{4}-\d{4}$/;

export class AcademicYearService {
  static async create(data: CreateAcademicYearRequest): Promise<{ academicYear: AcademicYear }> {
    if (!YEAR_PATTERN.test(data.year)) {
      throw new ApiError(
        400,
        'تنسيق السنة الأكاديمية غير صحيح',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (await AcademicYearModel.yearExists(data.year)) {
      throw new ApiError(
        409,
        'السنة الأكاديمية موجودة بالفعل',
        ErrorCodes.ALREADY_EXISTS
      );
    }
    const academicYear = await AcademicYearModel.create(data);
    return { academicYear };
  }

  static async getAll(
    page = 1,
    limit = 10,
    search?: string,
    isActive?: boolean
  ): Promise<{ items: AcademicYear[]; total: number }> {
    const result = await AcademicYearModel.findAll(page, limit, search, isActive);
    return { items: result.academicYears, total: result.total };
  }

  static async getById(id: string): Promise<{ academicYear: AcademicYear }> {
    const academicYear = await AcademicYearModel.findById(id);
    if (!academicYear) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { academicYear };
  }

  /**
   * Returns the active academic year, or null if none is active. Callers can
   * use this in two modes:
   *   - When the active year is required, treat null as a hard error and
   *     throw ApiError yourself (the auth.service.ts registerStudent flow
   *     does this).
   *   - When the active year is optional (dashboard widgets etc), pass
   *     `null` through to the response.
   */
  static async getActive(): Promise<{ academicYear: AcademicYear } | null> {
    const academicYear = await AcademicYearModel.getActive();
    if (!academicYear) return null;
    return { academicYear };
  }

  /** Throws if no active academic year exists. */
  static async getActiveOrThrow(): Promise<{ academicYear: AcademicYear }> {
    const result = await AcademicYearService.getActive();
    if (!result) {
      throw new ApiError(404, 'لا توجد سنة أكاديمية نشطة', ErrorCodes.NOT_FOUND);
    }
    return result;
  }

  static async update(
    id: string,
    data: UpdateAcademicYearRequest
  ): Promise<{ academicYear: AcademicYear }> {
    if (!(await AcademicYearModel.exists(id))) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (data.year !== undefined) {
      if (!YEAR_PATTERN.test(data.year)) {
        throw new ApiError(
          400,
          'تنسيق السنة الأكاديمية غير صحيح',
          ErrorCodes.VALIDATION_ERROR
        );
      }
      if (await AcademicYearModel.yearExists(data.year, id)) {
        throw new ApiError(
          409,
          'السنة الأكاديمية موجودة بالفعل',
          ErrorCodes.ALREADY_EXISTS
        );
      }
    }
    const academicYear = await AcademicYearModel.update(id, data);
    if (!academicYear) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { academicYear };
  }

  static async delete(id: string): Promise<void> {
    const academicYear = await AcademicYearModel.findById(id);
    if (!academicYear) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (academicYear.is_active) {
      throw new ApiError(
        400,
        'لا يمكن حذف السنة الأكاديمية النشطة',
        ErrorCodes.BUSINESS_RULE
      );
    }
    const deleted = await AcademicYearModel.delete(id);
    if (!deleted) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async activate(id: string): Promise<{ academicYear: AcademicYear }> {
    if (!(await AcademicYearModel.exists(id))) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const academicYear = await AcademicYearModel.activate(id);
    if (!academicYear) {
      throw new ApiError(404, 'السنة الأكاديمية غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return { academicYear };
  }
}
