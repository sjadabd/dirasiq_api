import { Router } from 'express';
import { TeacherWalletController } from '../../controllers/teacher/wallet.controller';
import {
  authenticateToken,
  requireTeacher,
} from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireTeacher);

router.get('/', TeacherWalletController.getWallet);
router.get('/transactions', TeacherWalletController.listTransactions);

export default router;
