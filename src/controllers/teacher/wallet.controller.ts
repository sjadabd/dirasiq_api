import { Request, Response } from 'express';
import { TeacherWalletTransactionModel } from '../../models/teacher-wallet-transaction.model';
import { TeacherWalletService } from '../../services/teacher-wallet.service';

export class TeacherWalletController {
  static async getWallet(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = (req as any).user?.id;
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const balance = await TeacherWalletService.getBalance(teacherId);
      res
        .status(200)
        .json({ success: true, message: 'تم جلب المحفظة', data: { balance } });
    } catch (e: any) {
      res
        .status(500)
        .json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: [e.message || 'error'],
        });
    }
  }

  static async listTransactions(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = (req as any).user?.id;
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      const page = parseInt((req.query['page'] as string) || '1', 10);
      const limit = Math.min(
        parseInt((req.query['limit'] as string) || '20', 10),
        100
      );
      const offset = (page - 1) * limit;
      const items = await TeacherWalletTransactionModel.listByTeacher(
        teacherId,
        limit,
        offset
      );
      res
        .status(200)
        .json({
          success: true,
          message: 'تم جلب حركات المحفظة',
          data: items,
          pagination: { page, limit },
        });
    } catch (e: any) {
      res
        .status(500)
        .json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: [e.message || 'error'],
        });
    }
  }
}
