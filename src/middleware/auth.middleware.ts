import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { UserType } from '../types';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// JWT Authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'رمز المصادقة مطلوب',
        errors: ['لم يتم توفير رمز المصادقة']
      });
      return;
    }

    // Check if token exists in database
    const dbToken = await TokenModel.findByToken(token);
    if (!dbToken) {
      res.status(401).json({
        success: false,
        message: 'رمز المصادقة غير صحيح',
        errors: ['رمز المصادقة غير موجود']
      });
      return;
    }

    // Verify JWT token
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['مفتاح JWT غير مُعد']
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as any;

    // Get user from database
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'المستخدم غير موجود',
        errors: ['المستخدم غير موجود']
      });
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      res.status(401).json({
        success: false,
        message: 'الحساب غير مفعل',
        errors: ['حساب المستخدم غير مفعل']
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: 'رمز المصادقة غير صحيح',
        errors: ['فشل في التحقق من رمز المصادقة']
      });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في المصادقة',
      errors: ['خطأ داخلي في الخادم']
    });
  }
};

// Role-based authorization middleware
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.SUPER_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'الوصول مرفوض',
      errors: ['مطلوب صلاحيات السوبر أدمن']
    });
    return;
  }
  next();
};

export const requireTeacher = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.TEACHER) {
    res.status(403).json({
      success: false,
      message: 'الوصول مرفوض',
      errors: ['مطلوب صلاحيات المعلم']
    });
    return;
  }
  next();
};

export const requireStudent = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.STUDENT) {
    res.status(403).json({
      success: false,
      message: 'الوصول مرفوض',
      errors: ['مطلوب صلاحيات الطالب']
    });
    return;
  }
  next();
};

// General authentication middleware (any authenticated user)
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'المصادقة مطلوبة',
      errors: ['المستخدم غير مصادق عليه']
    });
    return;
  }
  next();
};
