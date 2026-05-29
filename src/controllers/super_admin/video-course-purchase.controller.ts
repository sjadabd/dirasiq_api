// Phase 4 — super-admin manual refund for video course purchases.
//
// This is the ONLY refund surface in v1. There is no student-driven
// self-service refund flow — every refund is admin-initiated to keep
// the abuse surface small while the marketplace is young.
//
// The 7-day window check + wallet clawback + status flip are all
// owned by VideoCoursePurchaseService.refundByAdmin; this controller
// is a thin pass-through that pulls the actor id from the JWT and
// translates the body shape.

import type { Request, Response } from 'express';

import { VideoCoursePurchaseService } from '../../services/video-course-purchase.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { okEmpty } from '../../utils/response.util';
import type { VideoCoursePurchaseRefundInput } from '../../schemas/video-course.schemas';

export class SuperAdminVideoCoursePurchaseController {
  // POST /api/super-admin/video-course-purchases/:id/refund
  static async refund(req: Request, res: Response): Promise<void> {
    const actorUserId = req.user?.id;
    if (!actorUserId) {
      // The router-level requireRole(SUPER_ADMIN) guarantees req.user;
      // this is purely defence-in-depth.
      throw new ApiError(401, 'مصادقة مطلوبة', ErrorCodes.UNAUTHORIZED);
    }

    const purchaseId = req.params['id'] as string;
    const body = req.body as VideoCoursePurchaseRefundInput;

    await VideoCoursePurchaseService.refundByAdmin({
      purchaseId,
      actorUserId,
      reason: body.reason,
    });

    res.status(200).json(okEmpty('تم استرداد الشراء بنجاح'));
  }
}
