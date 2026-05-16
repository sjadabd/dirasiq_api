import { Router } from 'express';
import { TeacherWalletController } from '../../controllers/teacher/wallet.controller';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate.middleware';
import { walletTxQuerySchema } from '../../schemas/teacher.schemas';

const router = Router();

router.get('/', asyncHandler(TeacherWalletController.getWallet));
router.get(
  '/transactions',
  validate({ query: walletTxQuerySchema }),
  asyncHandler(TeacherWalletController.listTransactions)
);

export default router;
