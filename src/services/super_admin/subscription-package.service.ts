import { SubscriptionPackageModel } from '../../models/subscription-package.model';
import type {
  CreateSubscriptionPackageRequest,
  SubscriptionPackage,
  UpdateSubscriptionPackageRequest,
} from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';

export class SubscriptionPackageService {
  static async createPackage(data: CreateSubscriptionPackageRequest): Promise<SubscriptionPackage> {
    if (await SubscriptionPackageModel.findByName(data.name)) {
      throw new ApiError(409, 'اسم الباقة موجود بالفعل', ErrorCodes.ALREADY_EXISTS);
    }
    const existingPackageWithSameSpecs = await SubscriptionPackageModel.findBySpecifications({
      maxStudents: data.maxStudents,
      price: data.price,
      durationDays: data.durationDays,
      isFree: data.isFree ?? false,
    });
    if (existingPackageWithSameSpecs) {
      throw new ApiError(409, 'يوجد باقة بنفس المواصفات', ErrorCodes.ALREADY_EXISTS);
    }
    if (data.maxStudents <= 0) {
      throw new ApiError(
        400,
        'عدد الطلاب يجب أن يكون أكبر من صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.price < 0) {
      throw new ApiError(
        400,
        'السعر يجب أن يكون أكبر من أو يساوي صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.durationDays <= 0) {
      throw new ApiError(
        400,
        'مدة الباقة يجب أن تكون أكبر من صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.isFree && data.price !== 0) {
      throw new ApiError(
        400,
        'الباقة المجانية يجب أن يكون سعرها صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    return SubscriptionPackageModel.create(data);
  }

  static async getPackageById(id: string): Promise<SubscriptionPackage> {
    const package_ = await SubscriptionPackageModel.findById(id);
    if (!package_) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return package_;
  }

  static async getAllPackages(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isFree?: boolean;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{ items: SubscriptionPackage[]; total: number }> {
    const result = await SubscriptionPackageModel.findAll(params);
    return { items: result.packages, total: result.total };
  }

  static async updatePackage(
    id: string,
    data: UpdateSubscriptionPackageRequest
  ): Promise<SubscriptionPackage> {
    const existingPackage = await SubscriptionPackageModel.findById(id);
    if (!existingPackage) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (data.name && data.name !== existingPackage.name) {
      if (await SubscriptionPackageModel.findByName(data.name)) {
        throw new ApiError(409, 'اسم الباقة موجود بالفعل', ErrorCodes.ALREADY_EXISTS);
      }
    }
    if (data.maxStudents !== undefined && data.maxStudents <= 0) {
      throw new ApiError(
        400,
        'عدد الطلاب يجب أن يكون أكبر من صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.price !== undefined && data.price < 0) {
      throw new ApiError(
        400,
        'السعر يجب أن يكون أكبر من أو يساوي صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.durationDays !== undefined && data.durationDays <= 0) {
      throw new ApiError(
        400,
        'مدة الباقة يجب أن تكون أكبر من صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (data.isFree === true && data.price !== undefined && data.price !== 0) {
      throw new ApiError(
        400,
        'الباقة المجانية يجب أن يكون سعرها صفر',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    const updatedPackage = await SubscriptionPackageModel.update(id, data);
    if (!updatedPackage) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updatedPackage;
  }

  static async activatePackage(id: string): Promise<void> {
    const success = await SubscriptionPackageModel.activate(id);
    if (!success) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async deactivatePackage(id: string): Promise<void> {
    const success = await SubscriptionPackageModel.deactivate(id);
    if (!success) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async deletePackage(id: string): Promise<void> {
    const success = await SubscriptionPackageModel.delete(id);
    if (!success) {
      throw new ApiError(404, 'الباقة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  static async getActivePackages(teacherId?: string): Promise<SubscriptionPackage[]> {
    return SubscriptionPackageModel.getActivePackages(teacherId);
  }

  static async getFreePackage(): Promise<SubscriptionPackage> {
    const package_ = await SubscriptionPackageModel.getFreePackage();
    if (!package_) {
      throw new ApiError(404, 'لا توجد باقة مجانية', ErrorCodes.NOT_FOUND);
    }
    return package_;
  }
}
