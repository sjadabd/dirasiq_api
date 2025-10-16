import { SubjectModel } from '../../models/subject.model';
import { UserModel } from '../../models/user.model';
import { ApiResponse, CreateSubjectRequest, UpdateSubjectRequest } from '../../types';

export class SubjectService {
  // Create new subject
  static async create(teacherId: string, data: CreateSubjectRequest): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      // Check if subject name already exists for this teacher
      const existingSubject = await SubjectModel.nameExistsForTeacher(teacherId, data.name);
      if (existingSubject) {
        return {
          success: false,
          message: 'المادة موجودة بالفعل',
          errors: ['المادة موجودة بالفعل']
        };
      }

      // Create subject
      const subject = await SubjectModel.create(teacherId, data);

      return {
        success: true,
        message: 'تم إنشاء المادة',
        data: { subject }
      };
    } catch (error) {
      console.error('Error creating subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get all subjects for a teacher with pagination
  static async getAllByTeacher(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    includeDeleted: boolean | null = false
  ): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      const result = await SubjectModel.findAllByTeacher(teacherId, page, limit, search, includeDeleted);

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: result.subjects,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting subjects:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get subject by ID
  static async getById(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      const subject = await SubjectModel.findByIdAndTeacher(id, teacherId);

      if (!subject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: { subject }
      };
    } catch (error) {
      console.error('Error getting subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Update subject
  static async update(id: string, teacherId: string, data: UpdateSubjectRequest): Promise<ApiResponse> {
    try {
      // Check if subject exists and belongs to teacher
      const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId);
      if (!existingSubject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      // Check if new name already exists for this teacher (if name is being updated)
      if (data.name && data.name !== existingSubject.name) {
        const nameExists = await SubjectModel.nameExistsForTeacher(teacherId, data.name, id);
        if (nameExists) {
          return {
            success: false,
            message: 'المادة موجودة بالفعل',
            errors: ['المادة موجودة بالفعل']
          };
        }
      }

      // Update subject
      const subject = await SubjectModel.update(id, teacherId, data);

      if (!subject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم تحديث المادة',
        data: { subject }
      };
    } catch (error) {
      console.error('Error updating subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Delete subject (soft delete)
  static async delete(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if subject exists and belongs to teacher
      const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId);
      if (!existingSubject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      // Soft delete subject
      const deleted = await SubjectModel.delete(id, teacherId);

      if (!deleted) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم حذف المادة'
      };
    } catch (error) {
      console.error('Error deleting subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Restore soft deleted subject
  static async restore(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if subject exists and belongs to teacher (including deleted ones)
      const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId, true);
      if (!existingSubject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      // Check if subject is actually deleted
      if (!existingSubject.deleted_at) {
        return {
          success: false,
          message: 'المادة غير محذوفة',
          errors: ['المادة غير محذوفة']
        };
      }

      // Restore subject
      const restored = await SubjectModel.restore(id, teacherId);

      if (!restored) {
        return {
          success: false,
          message: 'فشل في استعادة المادة',
          errors: ['فشل في استعادة المادة']
        };
      }

      return {
        success: true,
        message: 'تم استعادة المادة'
      };
    } catch (error) {
      console.error('Error restoring subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Hard delete subject (permanent deletion)
  static async hardDelete(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if subject exists and belongs to teacher
      const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId, true);
      if (!existingSubject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      // Hard delete subject
      const deleted = await SubjectModel.hardDelete(id, teacherId);

      if (!deleted) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة غير موجودة']
        };
      }

      return {
        success: true,
        message: 'تم حذف المادة نهائياً'
      };
    } catch (error) {
      console.error('Error hard deleting subject:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get all subjects (simple list - id and name only)
  static async getAllSubjects(teacherId: string): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      // Get all active subjects for the teacher (simple format)
      const result = await SubjectModel.findAllByTeacher(teacherId, 1, 1000, undefined, false);

      // Format response to include only id and name
      const simpleSubjects = result.subjects.map(subject => ({
        id: subject.id,
        name: subject.name
      }));

      return {
        success: true,
        message: 'تم جلب المواد بنجاح',
        data: simpleSubjects,
        count: simpleSubjects.length
      };
    } catch (error) {
      console.error('Error getting all subjects:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }
}
