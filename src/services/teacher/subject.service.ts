import { SubjectModel } from '@/models/subject.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse, CreateSubjectRequest, UpdateSubjectRequest } from '@/types';
import { getMessage } from '@/utils/messages';

export class SubjectService {
  // Create new subject
  static async create(teacherId: string, data: CreateSubjectRequest): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: getMessage('SUBJECT.TEACHER_NOT_FOUND'),
          errors: [getMessage('SUBJECT.TEACHER_NOT_FOUND')]
        };
      }

      // Check if subject name already exists for this teacher
      const existingSubject = await SubjectModel.nameExistsForTeacher(teacherId, data.name);
      if (existingSubject) {
        return {
          success: false,
          message: getMessage('SUBJECT.ALREADY_EXISTS'),
          errors: [getMessage('SUBJECT.ALREADY_EXISTS')]
        };
      }

      // Create subject
      const subject = await SubjectModel.create(teacherId, data);

      return {
        success: true,
        message: getMessage('SUBJECT.CREATED'),
        data: { subject }
      };
    } catch (error) {
      console.error('Error creating subject:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Get all subjects for a teacher with pagination
  static async getAllByTeacher(teacherId: string, page: number = 1, limit: number = 10, search?: string): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: getMessage('SUBJECT.TEACHER_NOT_FOUND'),
          errors: [getMessage('SUBJECT.TEACHER_NOT_FOUND')]
        };
      }

      const result = await SubjectModel.findAllByTeacher(teacherId, page, limit, search);

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: result.subjects,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting subjects:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('SUBJECT.NOT_FOUND'),
          errors: [getMessage('SUBJECT.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: { subject }
      };
    } catch (error) {
      console.error('Error getting subject:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('SUBJECT.NOT_FOUND'),
          errors: [getMessage('SUBJECT.NOT_FOUND')]
        };
      }

      // Check if new name already exists for this teacher (if name is being updated)
      if (data.name && data.name !== existingSubject.name) {
        const nameExists = await SubjectModel.nameExistsForTeacher(teacherId, data.name, id);
        if (nameExists) {
          return {
            success: false,
            message: getMessage('SUBJECT.ALREADY_EXISTS'),
            errors: [getMessage('SUBJECT.ALREADY_EXISTS')]
          };
        }
      }

      // Update subject
      const subject = await SubjectModel.update(id, teacherId, data);

      if (!subject) {
        return {
          success: false,
          message: getMessage('SUBJECT.NOT_FOUND'),
          errors: [getMessage('SUBJECT.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('SUBJECT.UPDATED'),
        data: { subject }
      };
    } catch (error) {
      console.error('Error updating subject:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Delete subject
  static async delete(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if subject exists and belongs to teacher
      const existingSubject = await SubjectModel.findByIdAndTeacher(id, teacherId);
      if (!existingSubject) {
        return {
          success: false,
          message: getMessage('SUBJECT.NOT_FOUND'),
          errors: [getMessage('SUBJECT.NOT_FOUND')]
        };
      }

      // Delete subject
      const deleted = await SubjectModel.delete(id, teacherId);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('SUBJECT.NOT_FOUND'),
          errors: [getMessage('SUBJECT.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('SUBJECT.DELETED')
      };
    } catch (error) {
      console.error('Error deleting subject:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}
