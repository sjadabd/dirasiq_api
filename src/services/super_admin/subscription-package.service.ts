import { SubscriptionPackageModel } from '../../models/subscription-package.model';
import { CreateSubscriptionPackageRequest, SubscriptionPackage, UpdateSubscriptionPackageRequest } from '../../types';

export class SubscriptionPackageService {
  // Create a new subscription package
  static async createPackage(data: CreateSubscriptionPackageRequest): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage;
    errors?: string[];
  }> {
    try {
      // Check if package name already exists
      const existingPackage = await SubscriptionPackageModel.findByName(data.name);
      if (existingPackage) {
        return {
          success: false,
          message: 'اسم الباقة موجود بالفعل',
          errors: ['اسم الباقة موجود بالفعل']
        };
      }

      // Check if package with same specifications already exists
      const existingPackageWithSameSpecs = await SubscriptionPackageModel.findBySpecifications({
        maxStudents: data.maxStudents,
        price: data.price,
        durationDays: data.durationDays,
        isFree: data.isFree || false
      });

      if (existingPackageWithSameSpecs) {
        return {
          success: false,
          message: 'يوجد باقة بنفس المواصفات',
          errors: ['يوجد باقة بنفس المواصفات']
        };
      }

      // Validate package data
      if (data.maxStudents <= 0) {
        return {
          success: false,
          message: 'عدد الطلاب يجب أن يكون أكبر من صفر',
          errors: ['عدد الطلاب يجب أن يكون أكبر من صفر']
        };
      }

      if (data.price < 0) {
        return {
          success: false,
          message: 'السعر يجب أن يكون أكبر من أو يساوي صفر',
          errors: ['السعر يجب أن يكون أكبر من أو يساوي صفر']
        };
      }

      if (data.durationDays <= 0) {
        return {
          success: false,
          message: 'مدة الباقة يجب أن تكون أكبر من صفر',
          errors: ['مدة الباقة يجب أن تكون أكبر من صفر']
        };
      }

      // If package is free, price should be 0
      if (data.isFree && data.price !== 0) {
        return {
          success: false,
          message: 'الباقة المجانية يجب أن يكون سعرها صفر',
          errors: ['الباقة المجانية يجب أن يكون سعرها صفر']
        };
      }

      const package_ = await SubscriptionPackageModel.create(data);

      return {
        success: true,
        message: 'تم إنشاء الباقة بنجاح',
        data: package_
      };
    } catch (error) {
      console.error('Error creating subscription package:', error);
      return {
        success: false,
        message: 'فشل في إنشاء الباقة',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Get subscription package by ID
  static async getPackageById(id: string): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage;
    errors?: string[];
  }> {
    try {
      const package_ = await SubscriptionPackageModel.findById(id);

      if (!package_) {
        return {
          success: false,
          message: 'الباقة غير موجودة',
          errors: ['الباقة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم العثور على الباقة',
        data: package_
      };
    } catch (error) {
      console.error('Error getting subscription package:', error);
      return {
        success: false,
        message: 'فشل في جلب الباقة',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Get all subscription packages with filters
  static async getAllPackages(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isFree?: boolean;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage[];
    count?: number;
    errors?: string[];
  }> {
    try {
      const result = await SubscriptionPackageModel.findAll(params);

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: result.packages,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting subscription packages:', error);
      return {
        success: false,
        message: 'فشل في جلب الباقات',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Update subscription package
  static async updatePackage(id: string, data: UpdateSubscriptionPackageRequest): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage;
    errors?: string[];
  }> {
    try {
      // Check if package exists
      const existingPackage = await SubscriptionPackageModel.findById(id);
      if (!existingPackage) {
        return {
          success: false,
          message: 'الباقة غير موجودة',
          errors: ['الباقة غير موجودة']
        };
      }

      // If updating name, check if new name already exists
      if (data.name && data.name !== existingPackage.name) {
        const packageWithSameName = await SubscriptionPackageModel.findByName(data.name);
        if (packageWithSameName) {
          return {
            success: false,
            message: 'اسم الباقة موجود بالفعل',
            errors: ['اسم الباقة موجود بالفعل']
          };
        }
      }

      // Validate update data
      if (data.maxStudents !== undefined && data.maxStudents <= 0) {
        return {
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: ['عدد الطلاب يجب أن يكون أكبر من صفر']
        };
      }

      if (data.price !== undefined && data.price < 0) {
        return {
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: ['السعر يجب أن يكون أكبر من أو يساوي صفر']
        };
      }

      if (data.durationDays !== undefined && data.durationDays <= 0) {
        return {
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: ['مدة الباقة يجب أن تكون أكبر من صفر']
        };
      }

      // If package is being set to free, price should be 0
      if (data.isFree === true && data.price !== undefined && data.price !== 0) {
        return {
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: ['الباقة المجانية يجب أن يكون سعرها صفر']
        };
      }

      const updatedPackage = await SubscriptionPackageModel.update(id, data);

      if (!updatedPackage) {
        return {
          success: false,
          message: 'فشل في العملية',
          errors: ['حدث خطأ في الخادم']
        };
      }

      return {
        success: true,
        message: 'تم تحديث الباقة بنجاح',
        data: updatedPackage
      };
    } catch (error) {
      console.error('Error updating subscription package:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Activate subscription package
  static async activatePackage(id: string): Promise<{
    success: boolean;
    message: string;
    errors?: string[];
  }> {
    try {
      const success = await SubscriptionPackageModel.activate(id);

      if (!success) {
        return {
          success: false,
          message: 'الباقة غير موجودة',
          errors: ['الباقة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم تفعيل الباقة بنجاح'
      };
    } catch (error) {
      console.error('Error activating subscription package:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Deactivate subscription package
  static async deactivatePackage(id: string): Promise<{
    success: boolean;
    message: string;
    errors?: string[];
  }> {
    try {
      const success = await SubscriptionPackageModel.deactivate(id);

      if (!success) {
        return {
          success: false,
          message: 'الباقة غير موجودة',
          errors: ['الباقة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم إلغاء تفعيل الباقة بنجاح'
      };
    } catch (error) {
      console.error('Error deactivating subscription package:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Delete subscription package
  static async deletePackage(id: string): Promise<{
    success: boolean;
    message: string;
    errors?: string[];
  }> {
    try {
      const success = await SubscriptionPackageModel.delete(id);

      if (!success) {
        return {
          success: false,
          message: 'الباقة غير موجودة',
          errors: ['الباقة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم حذف الباقة بنجاح'
      };
    } catch (error) {
      console.error('Error deleting subscription package:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Get active subscription packages
  static async getActivePackages(teacher_id?: string): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage[];
    errors?: string[];
  }> {
    try {
      const packages = await SubscriptionPackageModel.getActivePackages(teacher_id);

      return {
        success: true,
        message: 'تم العثور على الباقات النشطة',
        data: packages
      };
    } catch (error) {
      console.error('Error getting active subscription packages:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }

  // Get free subscription package
  static async getFreePackage(): Promise<{
    success: boolean;
    message: string;
    data?: SubscriptionPackage;
    errors?: string[];
  }> {
    try {
      const package_ = await SubscriptionPackageModel.getFreePackage();

      if (!package_) {
        return {
          success: false,
          message: 'لا توجد باقة مجانية',
          errors: ['لا توجد باقة مجانية']
        };
      }

      return {
        success: true,
        message: 'تم العثور على الباقة المجانية',
        data: package_
      };
    } catch (error) {
      console.error('Error getting free subscription package:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم']
      };
    }
  }
}
