import { GradeService } from '@/services/grade.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';

export class GradeController {
  // Create new grade (Super Admin only)
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('GRADE.NAME_REQUIRED')).run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const result = await GradeService.create(req.body);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in create grade controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get all grades with pagination (Super Admin only)
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req),
        query('search').optional().isString().withMessage('Search must be a string').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;

      // Handle search parameter properly
      let search: string | undefined = req.query['search'] as string;
      if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
        search = undefined;
      }

      const result = await GradeService.getAll(page, limit, search);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get all grades controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get active grades only (for public use)
  static async getActive(_req: Request, res: Response): Promise<void> {
    try {
      const result = await GradeService.getActive();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get active grades controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get grade by ID
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const id = req.params['id'] || '';
      const result = await GradeService.getById(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in get grade by ID controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Update grade (Super Admin only)
  static async update(req: Request, res: Response): Promise<void> {
    try {
      // Validate request parameters and body
      await Promise.all([
        param('id').isUUID().withMessage('ID must be a valid UUID').run(req),
        body('name').optional().notEmpty().withMessage(getMessage('GRADE.NAME_REQUIRED')).run(req),
        body('description').optional().isString().withMessage('Description must be a string').run(req),
        body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const id = req.params['id'] || '';
      const result = await GradeService.update(id, req.body);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in update grade controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Delete grade (Super Admin only)
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('ID must be a valid UUID').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const id = req.params['id'] || '';
      const result = await GradeService.delete(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in delete grade controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
