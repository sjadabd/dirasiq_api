// /api/user/* — OneSignal status + player-id updates. Any authenticated
// user can read their own status and update their session's player id; the
// admin lookup at `/onesignal-status/:userId` is super-admin only (enforced
// in the controller because the check needs `req.user`).

import { Router } from 'express';

import { UserOneSignalController } from '../controllers/user-onesignal.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/async-handler';
import {
  onesignalStatusByUserIdParamsSchema,
  updateOneSignalPlayerIdSchema,
} from '../schemas/misc.schemas';

const router = Router();

router.use(authenticateToken);

router.put(
  '/onesignal-player-id',
  validate({ body: updateOneSignalPlayerIdSchema }),
  asyncHandler(UserOneSignalController.updatePlayerId)
);

router.get('/onesignal-status', asyncHandler(UserOneSignalController.getMyStatus));

router.get(
  '/onesignal-status/:userId',
  validate({ params: onesignalStatusByUserIdParamsSchema }),
  asyncHandler(UserOneSignalController.getStatusByUserId)
);

export default router;
