import { SubscriptionPackageModel } from '../models/subscription-package.model';
import { TeacherReferralModel } from '../models/teacher-referral.model';
import { TeacherSubscriptionBonusModel } from '../models/teacher-subscription-bonus.model';
import { TeacherSubscriptionModel } from '../models/teacher-subscription.model';
import type {
  CreateTeacherSubscriptionRequest,
  TeacherSubscription,
  UpdateTeacherSubscriptionRequest,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { logger } from '../utils/logger';

export class TeacherSubscriptionService {
  static async create(data: CreateTeacherSubscriptionRequest): Promise<TeacherSubscription> {
    return TeacherSubscriptionModel.create(data);
  }

  static async findById(id: string): Promise<TeacherSubscription> {
    const subscription = await TeacherSubscriptionModel.findById(id);
    if (!subscription) {
      throw new ApiError(404, 'الاشتراك غير موجود', ErrorCodes.NOT_FOUND);
    }
    return subscription;
  }

  static async findByTeacherId(teacherId: string): Promise<TeacherSubscription[]> {
    return TeacherSubscriptionModel.findByTeacherId(teacherId);
  }

  static async findActiveByTeacherId(teacherId: string): Promise<TeacherSubscription> {
    const active = await TeacherSubscriptionModel.findActiveByTeacherId(teacherId);
    if (!active) {
      throw new ApiError(404, 'لا يوجد اشتراك نشط', ErrorCodes.NOT_FOUND);
    }
    return active;
  }

  static async update(
    id: string,
    data: UpdateTeacherSubscriptionRequest
  ): Promise<TeacherSubscription> {
    const updated = await TeacherSubscriptionModel.update(id, data);
    if (!updated) {
      throw new ApiError(
        404,
        'الاشتراك غير موجود أو لم يتم تحديثه',
        ErrorCodes.NOT_FOUND
      );
    }
    return updated;
  }

  static async delete(id: string): Promise<void> {
    const deleted = await TeacherSubscriptionModel.delete(id);
    if (!deleted) {
      throw new ApiError(
        404,
        'الاشتراك غير موجود أو لم يتم حذفه',
        ErrorCodes.NOT_FOUND
      );
    }
  }

  /**
   * تفعيل باقة لمعلم: إلغاء تفعيل الحالية وإنشاء اشتراك جديد من الباقة المطلوبة.
   * Also completes any pending teacher referral and grants referral bonuses
   * — those side-effects are best-effort and never fail the activation.
   */
  static async activateForTeacher(
    teacherId: string,
    packageId: string
  ): Promise<TeacherSubscription> {
    const pkg = await SubscriptionPackageModel.findById(packageId);
    if (!pkg || !pkg.isActive) {
      throw new ApiError(404, 'الباقة غير موجودة أو غير مفعلة', ErrorCodes.NOT_FOUND);
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + Number(pkg.durationDays || 30));

    const created = await TeacherSubscriptionModel.create({
      teacherId,
      subscriptionPackageId: pkg.id,
      startDate,
      endDate,
    });

    // Best-effort referral completion + bonus grants. Never fails activation.
    if (!pkg.isFree) {
      try {
        const referral =
          await TeacherReferralModel.findPendingByReferredTeacherId(teacherId);
        if (referral) {
          await TeacherReferralModel.updateStatus(referral.id, 'completed');
          try {
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
            await TeacherSubscriptionBonusModel.create({
              teacherSubscriptionId: created.id,
              bonusType: 'referral_referred',
              bonusValue: 2,
              expiresAt: created.endDate ?? null,
            });
          } catch (bonusErr) {
            logger.warn({ err: bonusErr }, 'referral bonus grant failed');
          }
        }
      } catch (refErr) {
        logger.warn({ err: refErr }, 'teacher referral completion failed');
      }
    }

    return created;
  }
}
