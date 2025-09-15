import { authenticateToken } from '@/middleware/auth.middleware';
import { TokenModel } from '@/models/token.model';
import { UserModel } from '@/models/user.model';
import { Request, Response, Router } from 'express';

const router = Router();

/**
 * @route PUT /api/user/onesignal-player-id
 * @desc Update user's OneSignal player ID (store in tokens table)
 * @access All authenticated users
 */
router.put(
  '/onesignal-player-id',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { oneSignalPlayerId } = req.body;
      const userId = (req as any).user?.id;
      const token = (req as any).token; // لازم يكون محطوط من middleware

      if (!oneSignalPlayerId) {
        res.status(400).json({
          success: false,
          message: 'OneSignal player ID is required',
        });
        return;
      }

      // تحقق أن المستخدم موجود
      const user = await UserModel.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // تحديث Player ID في جدول tokens
      const updated = await TokenModel.updatePlayerId(userId, token, oneSignalPlayerId);
      if (!updated) {
        res.status(400).json({
          success: false,
          message: 'Failed to update OneSignal Player ID for this session',
        });
        return;
      }

      res.json({
        success: true,
        message: 'OneSignal player ID updated successfully',
      });
    } catch (error) {
      console.error('Error updating OneSignal player ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * @route GET /api/user/onesignal-status
 * @desc Get OneSignal player ID status for current user (latest token)
 * @access All authenticated users
 */
router.get(
  '/onesignal-status',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      // تحقق أن المستخدم موجود
      const user = await UserModel.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // جيب آخر Player ID من جدول tokens
      const playerId = await TokenModel.getPlayerId(userId);

      res.json({
        success: true,
        data: {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userType: user.userType,
          onesignalPlayerId: playerId,
          hasOneSignalId: !!playerId,
        },
      });
    } catch (error) {
      console.error('Error getting OneSignal status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * @route GET /api/user/onesignal-status/:userId
 * @desc Get OneSignal player ID status for specific user (admin only)
 * @access Super Admin
 */
router.get(
  '/onesignal-status/:userId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).user;
      const targetUserId = req.params['userId'];

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
        return;
      }

      // تأكد أن المستخدم الحالي Super Admin
      if (currentUser.userType !== 'super_admin') {
        res.status(403).json({
          success: false,
          message: 'Access denied. Only super admins can view other users OneSignal status.',
        });
        return;
      }

      const user = await UserModel.findById(targetUserId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // جيب آخر Player ID من جدول tokens
      const playerId = await TokenModel.getPlayerId(targetUserId);

      res.json({
        success: true,
        data: {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userType: user.userType,
          onesignalPlayerId: playerId,
          hasOneSignalId: !!playerId,
        },
      });
    } catch (error) {
      console.error('Error getting OneSignal status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

export default router;
