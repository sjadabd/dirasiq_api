import { SubscriptionPackageService } from '@/services/super_admin/subscription-package.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

export class SubscriptionPackageController {
  // Create a new subscription package (Super Admin only)
  static async createPackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('description').optional().isLength({ max: 1000 }).withMessage(getMessage('VALIDATION.DESCRIPTION_TOO_LONG')).run(req),
        body('maxStudents').isInt({ min: 1 }).withMessage(getMessage('SUBSCRIPTION.MAX_STUDENTS_REQUIRED')).run(req),
        body('price').isFloat({ min: 0 }).withMessage(getMessage('SUBSCRIPTION.PRICE_REQUIRED')).run(req),
        body('durationDays').isInt({ min: 1 }).withMessage(getMessage('SUBSCRIPTION.DURATION_DAYS_REQUIRED')).run(req),
        body('isFree').optional().isBoolean().withMessage(getMessage('VALIDATION.INVALID_BOOLEAN')).run(req)
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

      const { name, description, maxStudents, price, durationDays, isFree } = req.body;

      const result = await SubscriptionPackageService.createPackage({
        name,
        description,
        maxStudents: Number(maxStudents),
        price: Number(price),
        durationDays: Number(durationDays),
        isFree: isFree || false
      });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in createPackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get subscription package by ID
  static async getPackageById(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage(getMessage('VALIDATION.INVALID_ID')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { id } = req.params;
      const result = await SubscriptionPackageService.getPackageById(id!);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in getPackageById controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get all subscription packages with filters
  static async getAllPackages(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      await Promise.all([
        body('page').optional().isInt({ min: 1 }).withMessage(getMessage('VALIDATION.INVALID_PAGE')).run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage(getMessage('VALIDATION.INVALID_LIMIT')).run(req),
        body('search').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.SEARCH_TOO_LONG')).run(req),
        body('isActive').optional().isBoolean().withMessage(getMessage('VALIDATION.INVALID_BOOLEAN')).run(req),
        body('isFree').optional().isBoolean().withMessage(getMessage('VALIDATION.INVALID_BOOLEAN')).run(req),
        body('sortBy.key').optional().isIn(['name', 'price', 'max_students', 'duration_days', 'created_at']).withMessage(getMessage('VALIDATION.INVALID_SORT_KEY')).run(req),
        body('sortBy.order').optional().isIn(['asc', 'desc']).withMessage(getMessage('VALIDATION.INVALID_SORT_ORDER')).run(req)
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

      const {
        page = 1,
        limit = 10,
        search,
        isActive,
        isFree,
        sortBy,
        deleted = false
      } = req.query;

      const params: any = {
        page: Number(page),
        limit: Number(limit),
        deleted: deleted === 'true'
      };

      if (search) params.search = search as string;
      if (isActive === 'true' || isActive === 'false') params.isActive = isActive === 'true';
      if (isFree === 'true' || isFree === 'false') params.isFree = isFree === 'true';
      if (sortBy) params.sortBy = sortBy as { key: string; order: 'asc' | 'desc' };

      const result = await SubscriptionPackageService.getAllPackages(params);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getAllPackages controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Update subscription package (Super Admin only)
  static async updatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params and body
      await Promise.all([
        param('id').isUUID().withMessage(getMessage('VALIDATION.INVALID_ID')).run(req),
        body('name').optional().notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('description').optional().isLength({ max: 1000 }).withMessage(getMessage('VALIDATION.DESCRIPTION_TOO_LONG')).run(req),
        body('maxStudents').optional().isInt({ min: 1 }).withMessage(getMessage('SUBSCRIPTION.MAX_STUDENTS_REQUIRED')).run(req),
        body('price').optional().isFloat({ min: 0 }).withMessage(getMessage('SUBSCRIPTION.PRICE_REQUIRED')).run(req),
        body('durationDays').optional().isInt({ min: 1 }).withMessage(getMessage('SUBSCRIPTION.DURATION_DAYS_REQUIRED')).run(req),
        body('isFree').optional().isBoolean().withMessage(getMessage('VALIDATION.INVALID_BOOLEAN')).run(req),
        body('isActive').optional().isBoolean().withMessage(getMessage('VALIDATION.INVALID_BOOLEAN')).run(req)
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

      const { id } = req.params;
      const updateData = req.body;

      // Convert numeric fields
      if (updateData.maxStudents) updateData.maxStudents = Number(updateData.maxStudents);
      if (updateData.price) updateData.price = Number(updateData.price);
      if (updateData.durationDays) updateData.durationDays = Number(updateData.durationDays);

      const result = await SubscriptionPackageService.updatePackage(id!, updateData);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in updatePackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Activate subscription package (Super Admin only)
  static async activatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage(getMessage('VALIDATION.INVALID_ID')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { id } = req.params;
      const result = await SubscriptionPackageService.activatePackage(id!);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in activatePackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Deactivate subscription package (Super Admin only)
  static async deactivatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage(getMessage('VALIDATION.INVALID_ID')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { id } = req.params;
      const result = await SubscriptionPackageService.deactivatePackage(id!);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in deactivatePackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Delete subscription package (Super Admin only)
  static async deletePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage(getMessage('VALIDATION.INVALID_ID')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { id } = req.params;
      const result = await SubscriptionPackageService.deletePackage(id!);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in deletePackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get active subscription packages (Public)
  static async getActivePackages(_req: Request, res: Response): Promise<void> {
    try {
      const result = await SubscriptionPackageService.getActivePackages();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getActivePackages controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get free subscription package (Public)
  static async getFreePackage(_req: Request, res: Response): Promise<void> {
    try {
      const result = await SubscriptionPackageService.getFreePackage();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in getFreePackage controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
