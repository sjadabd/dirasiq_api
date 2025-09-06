import { TeacherSubscriptionModel } from '@/models/teacher-subscription.model'
import {
  ApiResponse,
  CreateTeacherSubscriptionRequest,
  UpdateTeacherSubscriptionRequest
} from '@/types'

export class TeacherSubscriptionService {
  // إنشاء اشتراك جديد
  static async create(data: CreateTeacherSubscriptionRequest): Promise<ApiResponse> {
    try {
      const subscription = await TeacherSubscriptionModel.create(data)

      return {
        success: true,
        message: 'تم إنشاء الاشتراك بنجاح',
        data: subscription
      }
    } catch (error) {
      console.error('Error creating teacher subscription:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الاشتراك غير موجود',
          errors: ['الاشتراك غير موجود']
        }
      }

      return {
        success: true,
        message: 'تم العثور على الاشتراك',
        data: subscription
      }
    } catch (error) {
      console.error('Error finding subscription by ID:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      }
    }
  }

  // جلب اشتراكات معلم حسب ID
  static async findByTeacherId(teacherId: string): Promise<ApiResponse> {
    try {
      const subscriptions = await TeacherSubscriptionModel.findByTeacherId(teacherId)

      return {
        success: true,
        message: 'تم العثور على الاشتراك',
        data: subscriptions,
        count: subscriptions.length
      }
    } catch (error) {
      console.error('Error finding teacher subscriptions:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'لا يوجد اشتراك نشط',
          errors: ['لا يوجد اشتراك نشط']
        }
      }

      return {
        success: true,
        message: 'تم العثور على الاشتراك النشط',
        data: active
      }
    } catch (error) {
      console.error('Error getting active subscription:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الاشتراك غير موجود أو لم يتم تحديثه',
          errors: ['الاشتراك غير موجود أو لم يتم تحديثه']
        }
      }

      return {
        success: true,
        message: 'تم تحديث الاشتراك بنجاح',
        data: updated
      }
    } catch (error) {
      console.error('Error updating subscription:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
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
          message: 'الاشتراك غير موجود أو لم يتم حذفه',
          errors: ['الاشتراك غير موجود أو لم يتم حذفه']
        }
      }

      return {
        success: true,
        message: 'تم حذف الاشتراك بنجاح'
      }
    } catch (error) {
      console.error('Error deleting subscription:', error)
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      }
    }
  }
}
