import { SubscriptionPackageModel } from '../models/subscription-package.model';
import { TeacherReferralModel } from '../models/teacher-referral.model';
import { TeacherSubscriptionBonusModel } from '../models/teacher-subscription-bonus.model';
import { TeacherSubscriptionModel } from '../models/teacher-subscription.model';
import {
  ApiResponse,
  CreateTeacherSubscriptionRequest,
  UpdateTeacherSubscriptionRequest,
} from '../types';

export class TeacherSubscriptionService {
  // إنشاء اشتراك جديد
  static async create(
    data: CreateTeacherSubscriptionRequest
  ): Promise<ApiResponse> {
    try {
      const subscription = await TeacherSubscriptionModel.create(data);

      return {
        success: true,
        message: 'تم إنشاء الاشتراك بنجاح',
        data: subscription,
      };
    } catch (error) {
      console.error('Error creating teacher subscription:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // جلب اشتراك حسب ID
  static async findById(id: string): Promise<ApiResponse> {
    try {
      const subscription = await TeacherSubscriptionModel.findById(id);

      if (!subscription) {
        return {
          success: false,
          message: 'الاشتراك غير موجود',
          errors: ['الاشتراك غير موجود'],
        };
      }

      return {
        success: true,
        message: 'تم العثور على الاشتراك',
        data: subscription,
      };
    } catch (error) {
      console.error('Error finding subscription by ID:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // جلب اشتراكات معلم حسب ID
  static async findByTeacherId(teacherId: string): Promise<ApiResponse> {
    try {
      const subscriptions =
        await TeacherSubscriptionModel.findByTeacherId(teacherId);

      return {
        success: true,
        message: 'تم العثور على الاشتراك',
        data: subscriptions,
        count: subscriptions.length,
      };
    } catch (error) {
      console.error('Error finding teacher subscriptions:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // جلب الاشتراك الحالي الفعّال
  static async findActiveByTeacherId(teacherId: string): Promise<ApiResponse> {
    try {
      const active =
        await TeacherSubscriptionModel.findActiveByTeacherId(teacherId);

      if (!active) {
        return {
          success: false,
          message: 'لا يوجد اشتراك نشط',
          errors: ['لا يوجد اشتراك نشط'],
        };
      }

      return {
        success: true,
        message: 'تم العثور على الاشتراك النشط',
        data: active,
      };
    } catch (error) {
      console.error('Error getting active subscription:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // تحديث الاشتراك
  static async update(
    id: string,
    data: UpdateTeacherSubscriptionRequest
  ): Promise<ApiResponse> {
    try {
      const updated = await TeacherSubscriptionModel.update(id, data);

      if (!updated) {
        return {
          success: false,
          message: 'الاشتراك غير موجود أو لم يتم تحديثه',
          errors: ['الاشتراك غير موجود أو لم يتم تحديثه'],
        };
      }

      return {
        success: true,
        message: 'تم تحديث الاشتراك بنجاح',
        data: updated,
      };
    } catch (error) {
      console.error('Error updating subscription:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // حذف الاشتراك
  static async delete(id: string): Promise<ApiResponse> {
    try {
      const deleted = await TeacherSubscriptionModel.delete(id);

      if (!deleted) {
        return {
          success: false,
          message: 'الاشتراك غير موجود أو لم يتم حذفه',
          errors: ['الاشتراك غير موجود أو لم يتم حذفه'],
        };
      }

      return {
        success: true,
        message: 'تم حذف الاشتراك بنجاح',
      };
    } catch (error) {
      console.error('Error deleting subscription:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // تفعيل باقة لمعلم: إلغاء تفعيل الحالية وإنشاء اشتراك جديد من الباقة المطلوبة
  static async activateForTeacher(
    teacherId: string,
    packageId: string
  ): Promise<ApiResponse> {
    try {
      // 1) التحقق من الباقة
      const pkg = await SubscriptionPackageModel.findById(packageId);
      if (!pkg || !pkg.isActive) {
        return {
          success: false,
          message: 'الباقة غير موجودة أو غير مفعلة',
          errors: ['الباقة غير موجودة أو غير مفعلة'],
        };
      }

      // 2) إنشاء اشتراك جديد بحسب مدة الباقة (يدعم تعدد الاشتراكات والتجديد)
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Number(pkg.durationDays || 30));

      const created = await TeacherSubscriptionModel.create({
        teacherId,
        subscriptionPackageId: pkg.id,
        startDate,
        endDate,
      });

      // 4) إذا كانت هذه أول باقة مدفوعة لمعلم مدعو، نكمل الإحالة (Referral)
      if (!pkg.isFree) {
        try {
          const referral =
            await TeacherReferralModel.findPendingByReferredTeacherId(
              teacherId
            );

          if (referral) {
            await TeacherReferralModel.updateStatus(referral.id, 'completed');

            // إضافة Bonus للمعلم الداعي (referrer) والمعلم المدعو (referred)
            // مبدئيًا: 5 طلاب إضافيين للداعي، 2 للمدعو
            try {
              // Bonus للمعلم الداعي على اشتراكه النشط الحالي (إن وجد)
              const referrerActive =
                await TeacherSubscriptionModel.findActiveByTeacherId(
                  referral.referrer_teacher_id
                );

              if (referrerActive) {
                await TeacherSubscriptionBonusModel.create({
                  teacherSubscriptionId: referrerActive.id,
                  bonusType: 'referral_referrer',
                  bonusValue: 5,
                  expiresAt: referrerActive.endDate ?? null,
                });
              }

              // Bonus للمعلم المدعو على الاشتراك الحالي الذي تم إنشاؤه للتو
              await TeacherSubscriptionBonusModel.create({
                teacherSubscriptionId: created.id,
                bonusType: 'referral_referred',
                bonusValue: 2,
                expiresAt: created.endDate ?? null,
              });
            } catch (bonusErr) {
              console.error('Error creating referral bonuses:', bonusErr);
            }
          }
        } catch (refErr) {
          console.error(
            'Error completing teacher referral on subscription:',
            refErr
          );
          // لا نفشل تفعيل الاشتراك بسبب مشكلة في الإحالة
        }
      }

      return {
        success: true,
        message: 'تم تفعيل الباقة للمعلم بنجاح',
        data: created,
      };
    } catch (error) {
      console.error('Error activating subscription for teacher:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }
}
