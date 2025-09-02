import { AcademicYearService } from '@/services/academic-year.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';

export class AcademicYearController {
  // Create new academic year
  static async create(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('year')
        .notEmpty()
        .withMessage(getMessage('ACADEMIC_YEAR.YEAR_REQUIRED'))
        .isLength({ min: 9, max: 9 })
        .withMessage(getMessage('ACADEMIC_YEAR.YEAR_MIN_LENGTH'))
        .matches(/^\d{4}-\d{4}$/)
        .withMessage(getMessage('ACADEMIC_YEAR.YEAR_PATTERN'))
        .run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { year } = req.body;
      const result = await AcademicYearService.create({ year });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in create academic year controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get all academic years with pagination
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req),
        query('search').optional().isString().withMessage('Search must be a string').run(req),
        query('is_active').optional().isIn(['true', 'false', 'null']).withMessage('is_active must be true, false, or null').run(req)
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

      // Handle search parameter properly - treat "null", "undefined", empty string as null
      let search: string | undefined = req.query['search'] as string;
      if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
        search = undefined;
      }

      // Handle is_active parameter properly
      let isActive: boolean | undefined = undefined;
      const isActiveParam = req.query['is_active'] as string;
      if (isActiveParam === 'true') {
        isActive = true;
      } else if (isActiveParam === 'false') {
        isActive = false;
      }
      // If isActiveParam is 'null' or undefined, keep isActive as undefined (show all)

      const result = await AcademicYearService.getAll(page, limit, search, isActive);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error in get all academic years controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get academic year by ID
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameter (UUID format)
      await param('id')
        .isUUID()
        .withMessage('ID must be a valid UUID')
        .run(req);

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
      const result = await AcademicYearService.getById(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in get academic year by ID controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get active academic year
  static async getActive(_req: Request, res: Response): Promise<void> {
    try {
      const result = await AcademicYearService.getActive();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in get active academic year controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Update academic year
  static async update(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameter and request body
      await Promise.all([
        param('id').isUUID().withMessage('ID must be a valid UUID').run(req),
        body('year').optional().isLength({ min: 9, max: 9 }).withMessage(getMessage('ACADEMIC_YEAR.YEAR_MIN_LENGTH')).run(req),
        body('year').optional().matches(/^\d{4}-\d{4}$/).withMessage(getMessage('ACADEMIC_YEAR.YEAR_PATTERN')).run(req),
        body('is_active').optional().isBoolean().withMessage('is_active must be a boolean').run(req)
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
      const { year, is_active } = req.body;
      const result = await AcademicYearService.update(id, { year, is_active });

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in update academic year controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Delete academic year
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameter (UUID format)
      await param('id')
        .isUUID()
        .withMessage('ID must be a valid UUID')
        .run(req);

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
      const result = await AcademicYearService.delete(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in delete academic year controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Activate academic year
  static async activate(req: Request, res: Response): Promise<void> {
    try {
      // Validate path parameter (UUID format)
      await param('id')
        .isUUID()
        .withMessage('ID must be a valid UUID')
        .run(req);

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
      const result = await AcademicYearService.activate(id);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in activate academic year controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
