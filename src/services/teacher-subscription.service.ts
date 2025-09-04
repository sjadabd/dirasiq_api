import { TeacherSubscriptionModel } from '@/models/teacher-subscription.model'
import {
  ApiResponse,
  CreateTeacherSubscriptionRequest,
  UpdateTeacherSubscriptionRequest
} from '@/types'
import { getMessage } from '@/utils/messages'

export class TeacherSubscriptionService {
  // إنشاء اشتراك جديد
  static async create(data: CreateTeacherSubscriptionRequest): Promise<ApiResponse> {
    try {
      const subscription = await TeacherSubscriptionModel.create(data)

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.CREATED_SUCCESSFULLY'),
        data: subscription
      }
    } catch (error) {
      console.error('Error creating teacher subscription:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }

  // جلب اشتراك حسب ID
  static async findById(id: string): Promise<ApiResponse> {
    try {
      const subscription = await TeacherSubscriptionModel.findById(id)

      if (!subscription) {
        return {
          success: false,
          message: getMessage('SUBSCRIPTION.NOT_FOUND'),
          errors: [getMessage('SUBSCRIPTION.NOT_FOUND')]
        }
      }

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.FOUND'),
        data: subscription
      }
    } catch (error) {
      console.error('Error finding subscription by ID:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }

  // جلب اشتراكات معلم حسب ID
  static async findByTeacherId(teacherId: string): Promise<ApiResponse> {
    try {
      const subscriptions = await TeacherSubscriptionModel.findByTeacherId(teacherId)

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.FOUND'),
        data: subscriptions,
        count: subscriptions.length
      }
    } catch (error) {
      console.error('Error finding teacher subscriptions:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }

  // جلب الاشتراك الحالي الفعّال
  static async findActiveByTeacherId(teacherId: string): Promise<ApiResponse> {
    try {
      const active = await TeacherSubscriptionModel.findActiveByTeacherId(teacherId)

      if (!active) {
        return {
          success: false,
          message: getMessage('SUBSCRIPTION.NO_ACTIVE'),
          errors: [getMessage('SUBSCRIPTION.NO_ACTIVE')]
        }
      }

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.ACTIVE_FOUND'),
        data: active
      }
    } catch (error) {
      console.error('Error getting active subscription:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }

  // تحديث الاشتراك
  static async update(id: string, data: UpdateTeacherSubscriptionRequest): Promise<ApiResponse> {
    try {
      const updated = await TeacherSubscriptionModel.update(id, data)

      if (!updated) {
        return {
          success: false,
          message: getMessage('SUBSCRIPTION.NOT_FOUND_OR_NOT_UPDATED'),
          errors: [getMessage('SUBSCRIPTION.NOT_FOUND_OR_NOT_UPDATED')]
        }
      }

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.UPDATED_SUCCESSFULLY'),
        data: updated
      }
    } catch (error) {
      console.error('Error updating subscription:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }

  // حذف الاشتراك
  static async delete(id: string): Promise<ApiResponse> {
    try {
      const deleted = await TeacherSubscriptionModel.delete(id)

      if (!deleted) {
        return {
          success: false,
          message: getMessage('SUBSCRIPTION.NOT_FOUND_OR_NOT_DELETED'),
          errors: [getMessage('SUBSCRIPTION.NOT_FOUND_OR_NOT_DELETED')]
        }
      }

      return {
        success: true,
        message: getMessage('SUBSCRIPTION.DELETED_SUCCESSFULLY')
      }
    } catch (error) {
      console.error('Error deleting subscription:', error)
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      }
    }
  }
}
