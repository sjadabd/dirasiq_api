// Phase 3 of the National Video Marketplace.
//
// GET /api/teacher/commission-preview?priceIqd=N
//
// Returns the same CommissionBreakdown the Phase 7 engine produces for a
// real sale — pre-calculated for an arbitrary sale price. Used by the
// dashboard wizard's pricing step to show the teacher their net live
// while they type.
//
// IMPORTANT: this endpoint is READ-ONLY. CommissionService.computeFor
// does not mutate any state. The teacher_id is taken from the JWT so a
// teacher with a per-account override sees their actual rate, not the
// generic tier rate.

import type { Request, Response } from 'express';

import { CommissionService } from '../../services/commission.service';
import { ok } from '../../utils/response.util';
import type { CommissionPreviewQuery } from '../../schemas/video-course.schemas';

export class TeacherCommissionPreviewController {
  // GET /api/teacher/commission-preview?priceIqd=N
  static async preview(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const q = req.query as unknown as CommissionPreviewQuery;

    const breakdown = await CommissionService.computeFor({
      teacherId,
      grossSalePriceIqd: q.priceIqd,
    });

    // We surface the teacher-facing fields explicitly. The gateway fee +
    // platform-revenue numbers stay in the body (so admin tooling that
    // hits this endpoint sees the full picture) but the dashboard wizard
    // only renders gross / commissionPercent / commissionAmountIqd /
    // netToTeacherIqd.
    res.status(200).json(
      ok(
        {
          grossSalePriceIqd:   breakdown.grossSalePriceIqd,
          commissionPercent:   breakdown.commissionPercent,
          commissionAmountIqd: breakdown.commissionAmountIqd,
          netToTeacherIqd:     breakdown.netToTeacherIqd,
          gatewayFeeIqd:       breakdown.gatewayFeeIqd,
          platformRevenueIqd:  breakdown.platformRevenueIqd,
          source:              breakdown.source,
          appliedTierId:       breakdown.appliedTierId,
          appliedTierName:     breakdown.appliedTierName,
        },
        'معاينة العمولة'
      )
    );
  }
}
