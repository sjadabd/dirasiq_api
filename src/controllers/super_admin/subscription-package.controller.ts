import { SubscriptionPackageService } from '@/services/super_admin/subscription-package.service';
import { TeacherSubscriptionService } from '@/services/teacher-subscription.service';
import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

export class SubscriptionPackageController {
  // Create a new subscription package (Super Admin only)
  static async createPackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage('الاسم مطلوب').run(req),
        body('description').optional().isLength({ max: 1000 }).withMessage('الوصف طويل جداً').run(req),
        body('maxStudents').isInt({ min: 1 }).withMessage('عدد الطلاب مطلوب').run(req),
        body('price').isFloat({ min: 0 }).withMessage('السعر مطلوب').run(req),
        body('durationDays').isInt({ min: 1 }).withMessage('مدة الباقة مطلوبة').run(req),
        body('isFree').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req)
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get subscription package by ID
  static async getPackageById(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage('معرف غير صحيح').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get all subscription packages with filters (Unified endpoint)
  static async getAllPackages(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search = null,
        isActive = null,
        isFree = null,
        sortBy = null,
        deleted = false
      } = req.query;

      // Validate numeric parameters
      const pageNum = Number(page);
      const limitNum = Number(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        res.status(400).json({
          success: false,
          message: 'رقم الصفحة غير صحيح',
          errors: ['رقم الصفحة غير صحيح']
        });
        return;
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          success: false,
          message: 'الحد غير صحيح',
          errors: ['الحد غير صحيح']
        });
        return;
      }

      // Validate search parameter
      if (search && typeof search === 'string' && search.length > 100) {
        res.status(400).json({
          success: false,
          message: 'البحث طويل جداً',
          errors: ['البحث طويل جداً']
        });
        return;
      }

      // Validate boolean parameters
      let isActiveBool: boolean | null = null;
      let isFreeBool: boolean | null = null;

      if (isActive !== null && isActive !== 'null') {
        if (isActive === 'true') isActiveBool = true;
        else if (isActive === 'false') isActiveBool = false;
        else {
          res.status(400).json({
            success: false,
            message: 'قيمة غير صحيحة',
            errors: ['قيمة غير صحيحة']
          });
          return;
        }
      }

      if (isFree !== null && isFree !== 'null') {
        if (isFree === 'true') isFreeBool = true;
        else if (isFree === 'false') isFreeBool = false;
        else {
          res.status(400).json({
            success: false,
            message: 'قيمة غير صحيحة',
            errors: ['قيمة غير صحيحة']
          });
          return;
        }
      }

      const params: any = {
        page: pageNum,
        limit: limitNum,
        deleted: deleted === 'true'
      };

      // Add optional filters
      if (search && search !== 'null') params.search = search as string;
      if (isActiveBool !== null) params.isActive = isActiveBool;
      if (isFreeBool !== null) params.isFree = isFreeBool;
      if (sortBy && sortBy !== 'null') {
        try {
          params.sortBy = JSON.parse(sortBy as string);
        } catch {
          // If JSON parsing fails, ignore sortBy
        }
      }

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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Update subscription package (Super Admin only)
  static async updatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params and body
      await Promise.all([
        param('id').isUUID().withMessage('معرف غير صحيح').run(req),
        body('name').optional().notEmpty().withMessage('الاسم مطلوب').run(req),
        body('description').optional().isLength({ max: 1000 }).withMessage('الوصف طويل جداً').run(req),
        body('maxStudents').optional().isInt({ min: 1 }).withMessage('عدد الطلاب مطلوب').run(req),
        body('price').optional().isFloat({ min: 0 }).withMessage('السعر مطلوب').run(req),
        body('durationDays').optional().isInt({ min: 1 }).withMessage('مدة الباقة مطلوبة').run(req),
        body('isFree').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req),
        body('isActive').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req)
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Activate subscription package (Super Admin only)
  static async activatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage('معرف غير صحيح').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Deactivate subscription package (Super Admin only)
  static async deactivatePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage('معرف غير صحيح').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Delete subscription package (Super Admin only)
  static async deletePackage(req: Request, res: Response): Promise<void> {
    try {
      // Validate request params
      await param('id').isUUID().withMessage('معرف غير صحيح').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get active subscription packages (Public)
  static async getActivePackages(_req: Request, res: Response): Promise<void> {
    try {
      // ✅ حاول الحصول على user من locals
      const user = (res.locals as any)?.user;
      const teacherId = user?.userId || null;

      // ✅ استدعاء الخدمة وتمرير teacherId فقط عند توفره
      const data = await SubscriptionPackageService.getActivePackages(teacherId || undefined);

      res.status(200).json({
        success: true,
        message: teacherId
          ? 'تم جلب الباقات مع تحديد اشتراكك الحالي ✅'
          : 'تم جلب الباقات العامة (لم يتم تحديد اشتراك)',
        data,
      });
    } catch (error) {
      console.error('Error in getActivePackages controller:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Teacher: Activate subscription by package ID
  static async activateForTeacher(req: Request, res: Response): Promise<void> {
    try {
      await param('id').isUUID().withMessage('معرف غير صحيح').run(req);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(e => e.msg)
        });
        return;
      }

      const teacher = (req as any).user;
      if (!teacher?.id) {
        res.status(401).json({
          success: false,
          message: 'المصادقة مطلوبة',
          errors: ['المستخدم غير مصادق عليه']
        });
        return;
      }

      const { id } = req.params;
      const result = await TeacherSubscriptionService.activateForTeacher(teacher.id, id!);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in activateForTeacher controller:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
