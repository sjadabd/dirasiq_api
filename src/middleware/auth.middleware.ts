import { TokenModel } from '@/models/token.model';
import { UserModel } from '@/models/user.model';
import { getMessage } from '@/utils/messages';
import { UserType } from '@/types';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

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
        message: getMessage('AUTH.TOKEN_REQUIRED'),
        errors: [getMessage('AUTH.NO_TOKEN_PROVIDED')]
      });
      return;
    }

    // Check if token exists in database
    const dbToken = await TokenModel.findByToken(token);
    if (!dbToken) {
      res.status(401).json({
        success: false,
        message: getMessage('AUTH.INVALID_TOKEN'),
        errors: [getMessage('AUTH.TOKEN_NOT_FOUND')]
      });
      return;
    }

    // Verify JWT token
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('AUTH.JWT_SECRET_NOT_CONFIGURED')]
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as any;

    // Get user from database
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: getMessage('AUTH.USER_NOT_FOUND'),
        errors: [getMessage('AUTH.USER_DOES_NOT_EXIST')]
      });
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      res.status(401).json({
        success: false,
        message: getMessage('AUTH.ACCOUNT_NOT_ACTIVE'),
        errors: [getMessage('AUTH.USER_ACCOUNT_NOT_ACTIVE')]
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: getMessage('AUTH.INVALID_TOKEN'),
        errors: [getMessage('AUTH.TOKEN_VERIFICATION_FAILED')]
      });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: getMessage('AUTH.AUTHENTICATION_FAILED'),
      errors: [getMessage('SERVER.INTERNAL_ERROR')]
    });
  }
};

// Role-based authorization middleware
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.SUPER_ADMIN) {
    res.status(403).json({
      success: false,
      message: getMessage('AUTH.ACCESS_DENIED'),
      errors: [getMessage('AUTH.SUPER_ADMIN_ACCESS_REQUIRED')]
    });
    return;
  }
  next();
};

export const requireTeacher = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.TEACHER) {
    res.status(403).json({
      success: false,
      message: getMessage('AUTH.ACCESS_DENIED'),
      errors: [getMessage('AUTH.TEACHER_ACCESS_REQUIRED')]
    });
    return;
  }
  next();
};

export const requireStudent = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.userType !== UserType.STUDENT) {
    res.status(403).json({
      success: false,
      message: getMessage('AUTH.ACCESS_DENIED'),
      errors: [getMessage('AUTH.STUDENT_ACCESS_REQUIRED')]
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
      message: getMessage('AUTH.AUTHENTICATION_REQUIRED'),
      errors: [getMessage('AUTH.USER_NOT_AUTHENTICATED')]
    });
    return;
  }
  next();
};
