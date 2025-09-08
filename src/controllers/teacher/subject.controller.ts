import { SubjectService } from '@/services/teacher/subject.service';
import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';

export class SubjectController {
  // Create new subject
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage('اسم المادة مطلوب').run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const result = await SubjectService.create(teacherId, req.body);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in create subject controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get all subjects for the authenticated teacher
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req),
        query('search').optional().isString().withMessage('Search must be a string').run(req),
        query('is_deleted').optional().custom((value) => {
          if (value === undefined || value === null || value === 'null') {
            return true; // Allow null/undefined
          }
          if (value === 'true' || value === 'false') {
            return true; // Allow boolean strings
          }
          throw new Error('is_deleted must be true, false, or null');
        }).withMessage('is_deleted must be true, false, or null').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;

      // Handle is_deleted parameter: null/undefined = all, true = deleted only, false = active only
      const isDeletedParam = req.query['is_deleted'];
      let includeDeleted: boolean | null = null; // null means include all

      if (isDeletedParam === 'true') {
        includeDeleted = true; // deleted only
      } else if (isDeletedParam === 'false') {
        includeDeleted = false; // active only
      }
      // if isDeletedParam is null/undefined, includeDeleted remains null (all data)

      // Handle search parameter properly - treat "null", "undefined", empty string as null
      let search: string | undefined = req.query['search'] as string;
      if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
        search = undefined;
      }

      const result = await SubjectService.getAllByTeacher(teacherId, page, limit, search, includeDeleted);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get all subjects controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get subject by ID
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const id = req.params['id'] || '';

      const result = await SubjectService.getById(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in get subject by ID controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Update subject
  static async update(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters and body
      await Promise.all([
        param('id').isUUID().withMessage('ID must be a valid UUID').run(req),
        body('name').optional().notEmpty().withMessage('اسم المادة مطلوب').run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const id = req.params['id'] || '';

      const result = await SubjectService.update(id, teacherId, req.body);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in update subject controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Delete subject (soft delete)
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const id = req.params['id'] || '';

      const result = await SubjectService.delete(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in delete subject controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Restore soft deleted subject
  static async restore(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const id = req.params['id'] || '';

      const result = await SubjectService.restore(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in restore subject controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Hard delete subject (permanent deletion)
  static async hardDelete(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const teacherId = (req as any).user.id;
      const id = req.params['id'] || '';

      const result = await SubjectService.hardDelete(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in hard delete subject controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get all subjects (simple list - id and name only)
  static async getAllSubjects(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = (req as any).user.id;
      const result = await SubjectService.getAllSubjects(teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get all subjects controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
