import { TeacherSearchService } from '@/services/teacher-search.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export class TeacherSearchController {
  // Search teachers by coordinates (with distance calculation)
  static async searchByCoordinates(req: Request, res: Response): Promise<void> {
    try {
      // Validate request query
      await Promise.all([
        body('latitude').isFloat({ min: -90, max: 90 }).withMessage(getMessage('VALIDATION.INVALID_LATITUDE')).run(req),
        body('longitude').isFloat({ min: -180, max: 180 }).withMessage(getMessage('VALIDATION.INVALID_LONGITUDE')).run(req),
        body('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage(getMessage('VALIDATION.INVALID_MAX_DISTANCE')).run(req),
        body('page').optional().isInt({ min: 1 }).withMessage(getMessage('VALIDATION.INVALID_PAGE')).run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage(getMessage('VALIDATION.INVALID_LIMIT')).run(req)
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

      const { latitude, longitude, maxDistance, page, limit } = req.query;

      const searchParams: any = {
        latitude: Number(latitude),
        longitude: Number(longitude)
      };

      if (maxDistance) searchParams.maxDistance = Number(maxDistance);
      if (page) searchParams.page = Number(page);
      if (limit) searchParams.limit = Number(limit);

      const result = await TeacherSearchService.searchTeachersByCoordinates(searchParams);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in searchByCoordinates controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Search teachers by location names
  static async searchByLocation(req: Request, res: Response): Promise<void> {
    try {
      // Validate request query
      await Promise.all([
        body('governorate').optional().isString().withMessage(getMessage('VALIDATION.INVALID_GOVERNORATE')).run(req),
        body('city').optional().isString().withMessage(getMessage('VALIDATION.INVALID_CITY')).run(req),
        body('district').optional().isString().withMessage(getMessage('VALIDATION.INVALID_DISTRICT')).run(req),
        body('page').optional().isInt({ min: 1 }).withMessage(getMessage('VALIDATION.INVALID_PAGE')).run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage(getMessage('VALIDATION.INVALID_LIMIT')).run(req)
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

      const { governorate, city, district, page, limit } = req.query;

      // At least one location parameter is required
      if (!governorate && !city && !district) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.LOCATION_REQUIRED'),
          errors: [getMessage('VALIDATION.LOCATION_REQUIRED')]
        });
        return;
      }

      const searchParams: any = {
        governorate: governorate as string,
        city: city as string,
        district: district as string
      };

      if (page) searchParams.page = Number(page);
      if (limit) searchParams.limit = Number(limit);

      const result = await TeacherSearchService.searchTeachersByLocation(searchParams);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in searchByLocation controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get available governorates
  static async getGovernorates(_req: Request, res: Response): Promise<void> {
    try {
      const result = await TeacherSearchService.getAvailableGovernorates();

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getGovernorates controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get available cities for a governorate
  static async getCities(req: Request, res: Response): Promise<void> {
    try {
      const { governorate } = req.params;

      if (!governorate) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.GOVERNORATE_REQUIRED'),
          errors: [getMessage('VALIDATION.GOVERNORATE_REQUIRED')]
        });
        return;
      }

      const result = await TeacherSearchService.getAvailableCities(governorate);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getCities controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
