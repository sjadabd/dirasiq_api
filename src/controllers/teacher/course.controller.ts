import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { CourseService } from '../../services/teacher/course.service';

export class CourseController {
  // Create new course

  // GET /api/teacher/courses/names
  // Returns only id and name for teacher's courses in the active academic year (no pagination)
  static async listNamesForActiveYear(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = (req as any).user?.id;
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }

      const result = await CourseService.listNamesForActiveYear(teacherId);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in listNamesForActiveYear controller:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // Create new course
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('study_year').notEmpty().withMessage('السنة الدراسية مطلوبة').run(req),
        body('grade_id').isUUID().withMessage('Grade ID must be a valid UUID').run(req),
        body('subject_id').isUUID().withMessage('Subject ID must be a valid UUID').run(req),
        body('course_name').notEmpty().withMessage('اسم الدورة مطلوب').run(req),
        body('start_date').isISO8601().withMessage('Start date must be a valid date').run(req),
        body('end_date').isISO8601().withMessage('End date must be a valid date').run(req),
        body('price').isFloat({ min: 0 }).withMessage('السعر غير صحيح').run(req),
        body('seats_count').isInt({ min: 1 }).withMessage('عدد المقاعد غير صحيح').run(req),
        body('course_images').optional().isArray().withMessage('Course images must be an array').run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req),
        body('has_reservation').optional().isBoolean().toBoolean().withMessage('has_reservation يجب أن يكون قيمة منطقية').run(req),
        body('reservation_amount').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat().withMessage('مبلغ العربون يجب أن يكون رقمًا أكبر من صفر').run(req)
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
      const result = await CourseService.create(teacherId, req.body);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in create course controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get all courses for the authenticated teacher
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req),
        query('search').optional().isString().withMessage('Search must be a string').run(req),
        query('study_year').optional().isString().withMessage('Study year must be a string').run(req),
        query('deleted').optional().custom((value) => {
          if (value === undefined || value === null || value === 'null') {
            return true; // Allow null/undefined
          }
          if (value === 'true' || value === 'false') {
            return true; // Allow boolean strings
          }
          throw new Error('deleted must be true, false, or null');
        }).withMessage('deleted must be true, false, or null').run(req),
        query('grade_id').optional().custom((value) => {
          if (value && value !== 'null' && value !== 'undefined' && value !== '') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(value)) {
              throw new Error('Grade ID must be a valid UUID');
            }
          }
          return true;
        }).run(req),
        query('subject_id').optional().custom((value) => {
          if (value && value !== 'null' && value !== 'undefined' && value !== '') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(value)) {
              throw new Error('Subject ID must be a valid UUID');
            }
          }
          return true;
        }).run(req)
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

      // Handle search parameter properly - treat "null", "undefined", empty string as null
      let search: string | undefined = req.query['search'] as string;
      if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
        search = undefined;
      }

      // Handle filter parameters
      let studyYear: string | undefined = req.query['study_year'] as string;
      if (studyYear === 'null' || studyYear === 'undefined' || studyYear === '' || studyYear === undefined) {
        studyYear = undefined;
      }

      let gradeId: string | undefined = req.query['grade_id'] as string;
      if (gradeId === 'null' || gradeId === 'undefined' || gradeId === '' || gradeId === undefined) {
        gradeId = undefined;
      }

      let subjectId: string | undefined = req.query['subject_id'] as string;
      if (subjectId === 'null' || subjectId === 'undefined' || subjectId === '' || subjectId === undefined) {
        subjectId = undefined;
      }

      // Handle deleted parameter
      let deleted: boolean | undefined = undefined;
      const deletedParam = req.query['deleted'] as string;
      if (deletedParam === 'true') {
        deleted = true;
      } else if (deletedParam === 'false') {
        deleted = false;
      }

      const result = await CourseService.getAllByTeacher(teacherId, page, limit, search, studyYear, gradeId, subjectId, deleted);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get all courses controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get course by ID
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

      const result = await CourseService.getById(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in get course by ID controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Update course
  static async update(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters and body
      await Promise.all([
        param('id').isUUID().withMessage('ID must be a valid UUID').run(req),
        body('study_year').optional().isString().withMessage('Study year must be a string').run(req),
        body('grade_id').optional().isUUID().withMessage('Grade ID must be a valid UUID').run(req),
        body('subject_id').optional().isUUID().withMessage('Subject ID must be a valid UUID').run(req),
        body('course_name').optional().notEmpty().withMessage('اسم الدورة مطلوب').run(req),
        body('start_date').optional().isISO8601().withMessage('Start date must be a valid date').run(req),
        body('end_date').optional().isISO8601().withMessage('End date must be a valid date').run(req),
        body('price').optional().isFloat({ min: 0 }).withMessage('السعر غير صحيح').run(req),
        body('seats_count').optional().isInt({ min: 1 }).withMessage('عدد المقاعد غير صحيح').run(req),
        body('course_images').optional().isArray().withMessage('Course images must be an array').run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req),
        body('has_reservation').optional().isBoolean().toBoolean().withMessage('has_reservation يجب أن يكون قيمة منطقية').run(req),
        body('reservation_amount').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat().withMessage('مبلغ العربون يجب أن يكون رقمًا أكبر من صفر').run(req)
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

      const result = await CourseService.update(id, teacherId, req.body);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in update course controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Delete course (soft delete)
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

      const result = await CourseService.delete(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in delete course controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get deleted courses that are not expired
  static async getDeletedNotExpired(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req)
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

      const result = await CourseService.getDeletedNotExpired(teacherId, page, limit);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get deleted not expired courses controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Restore deleted course
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

      const result = await CourseService.restore(id, teacherId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in restore course controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
