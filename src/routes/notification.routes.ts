import { NextFunction, Request, Response, Router } from 'express';
import { NotificationController, notificationValidation } from '../controllers/notification.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { UserType } from '../types';

const router = Router();
const notificationController = new NotificationController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @route POST /api/notifications/send-to-all
 * @desc Send notification to all users
 * @access Super Admin, Teacher (for course-related notifications)
 */
router.post(
  '/send-to-all',
  notificationValidation.sendNotification,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins and teachers can send notifications to all users.'
      });
    }
  },
  notificationController.sendToAll
);

/**
 * @route POST /api/notifications/send-to-teachers
 * @desc Send notification to all teachers
 * @access Super Admin, Teacher
 */
router.post(
  '/send-to-teachers',
  notificationValidation.sendNotification,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins and teachers can send notifications to teachers.'
      });
    }
  },
  notificationController.sendToTeachers
);

/**
 * @route POST /api/notifications/send-to-students
 * @desc Send notification to all students
 * @access Super Admin, Teacher
 */
router.post(
  '/send-to-students',
  notificationValidation.sendNotification,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins and teachers can send notifications to students.'
      });
    }
  },
  notificationController.sendToStudents
);

/**
 * @route POST /api/notifications/send-to-specific
 * @desc Send notification to specific users
 * @access Super Admin, Teacher
 */
router.post(
  '/send-to-specific',
  notificationValidation.sendToSpecificUsers,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins and teachers can send notifications to specific users.'
      });
    }
  },
  notificationController.sendToSpecificUsers
);

/**
 * @route POST /api/notifications/send-template
 * @desc Send notification using template
 * @access Super Admin, Teacher
 */
router.post(
  '/send-template',
  notificationValidation.sendTemplateNotification,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins and teachers can send template notifications.'
      });
    }
  },
  notificationController.sendTemplateNotification
);

/**
 * @route GET /api/notifications
 * @desc Get all notifications with filters (admin only)
 * @access Super Admin
 */
router.get(
  '/',
  notificationValidation.getNotifications,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins can view all notifications.'
      });
    }
  },
  notificationController.getNotifications
);

/**
 * @route GET /api/notifications/statistics
 * @desc Get notification statistics (admin only)
 * @access Super Admin
 */
router.get(
  '/statistics',
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins can view notification statistics.'
      });
    }
  },
  notificationController.getStatistics
);

/**
 * @route GET /api/notifications/process-pending
 * @desc Process pending notifications (admin only)
 * @access Super Admin
 */
router.post(
  '/process-pending',
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins can process pending notifications.'
      });
    }
  },
  notificationController.processPendingNotifications
);

/**
 * @route GET /api/notifications/:id
 * @desc Get notification by ID
 * @access Super Admin, Teacher (for their own notifications)
 */
router.get(
  '/:id',
  notificationValidation.getNotificationById,
  (req: Request, _res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN) {
      next();
    } else {
      // For teachers, they can only view notifications they created
      // This will be handled in the controller
      next();
    }
  },
  notificationController.getNotificationById
);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete notification (admin only)
 * @access Super Admin
 */
router.delete(
  '/:id',
  notificationValidation.deleteNotification,
  (req: Request, res: Response, next: NextFunction) => {
    const userType = (req as any).user?.userType;
    if (userType === UserType.SUPER_ADMIN) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only super admins can delete notifications.'
      });
    }
  },
  notificationController.deleteNotification
);

/**
 * @route GET /api/notifications/user/my-notifications
 * @desc Get current user's notifications
 * @access All authenticated users
 */
router.get(
  '/user/my-notifications',
  (req: Request, _res: Response, next: NextFunction) => {
    const { page = 1, limit = 10 } = req.query;
    (req as any).query = { ...req.query, page, limit };
    next();
  },
  notificationController.getUserNotifications
);

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark notification as read
 * @access All authenticated users
 */
router.put(
  '/:id/read',
  notificationValidation.markAsRead,
  notificationController.markAsRead
);

// Note: Specialized routes can be added later if needed

export default router;
