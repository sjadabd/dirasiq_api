import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { TeacherSearchService } from '../services/teacher-search.service';

export class TeacherSearchController {
  // Search teachers by coordinates (with distance calculation)
  static async searchByCoordinates(req: Request, res: Response): Promise<void> {
    try {
      // Validate request query
      await Promise.all([
        body('latitude').isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
        body('longitude').isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
        body('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
        body('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
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
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Search teachers by location names
  static async searchByLocation(req: Request, res: Response): Promise<void> {
    try {
      // Validate request query
      await Promise.all([
        body('governorate').optional().isString().withMessage('المحافظة غير صحيحة').run(req),
        body('city').optional().isString().withMessage('المدينة غير صحيحة').run(req),
        body('district').optional().isString().withMessage('المنطقة غير صحيحة').run(req),
        body('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
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

      const { governorate, city, district, page, limit } = req.query;

      // At least one location parameter is required
      if (!governorate && !city && !district) {
        res.status(400).json({
          success: false,
          message: 'الموقع مطلوب',
          errors: ['الموقع مطلوب']
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
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
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
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          message: 'المحافظة مطلوبة',
          errors: ['المحافظة مطلوبة']
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
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
