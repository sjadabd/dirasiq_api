// Commission engine — Phase 7.
//
// Given a teacher and a course sale price, decide what the platform's
// commission % is. Two-layer lookup:
//
//   1. teacher_commission_overrides — if a row exists for this teacher,
//      that percentage wins outright. Used for partnership / premium deals.
//   2. platform_commission_tiers    — pick the active tier whose
//      [min_sale_price_iqd, max_sale_price_iqd] band contains the sale.
//      If no tier matches (misconfigured / out of bounds) we fall back to
//      a SAFE_DEFAULT_COMMISSION_PERCENT so a sale never silently goes 0%
//      and starves the platform.
//
// The split is reported in two slices the UI surfaces separately:
//   - commissionPercent + commissionAmount  → "Platform commission"
//                                            (what the teacher sees)
//   - gatewayFeeAmount                      → backend-only accounting; the
//                                            teacher dashboards explicitly
//                                            hide this. Stored on the ledger
//                                            as a separate `gateway_fee`
//                                            entry for finance reports.
//
// The actual money movement (credit pending, debit withdrawable, etc.) is
// owned by WalletService — this module computes numbers, never mutates state.

import pool from '../config/database';
import { logger } from '../utils/logger';

const SAFE_DEFAULT_COMMISSION_PERCENT = 15;

// Default per-transaction Wayl fee. We hide this from teacher UI but record
// it on the ledger so platform-revenue analytics is honest. Wayl publishes
// 2.5% + 250 IQD per transaction; override via env when the contract changes.
const DEFAULT_GATEWAY_FEE_PERCENT = Number(process.env['WAYL_FEE_PERCENT'] || 2.5);
const DEFAULT_GATEWAY_FLAT_FEE_IQD = Number(process.env['WAYL_FEE_FLAT_IQD'] || 250);

export interface CommissionBreakdown {
  // Sale + commission
  grossSalePriceIqd: number;
  commissionPercent: number;
  commissionAmountIqd: number;        // gross * percent
  // Net the teacher receives (credited to pending)
  netToTeacherIqd: number;            // gross - commission
  // Platform internal accounting (NOT shown to teacher)
  gatewayFeeIqd: number;
  platformRevenueIqd: number;         // commission - gatewayFee
  // Source
  source: 'override' | 'tier' | 'fallback';
  appliedTierId: string | null;
  appliedTierName: string | null;
}

export class CommissionService {
  /**
   * Compute the commission split for a given sale. Pure read — does not
   * mutate any table. Round HALF UP to whole IQD because the local market
   * doesn't use fractional units.
   */
  static async computeFor(args: {
    teacherId: string;
    grossSalePriceIqd: number;
    gatewayFeePercent?: number;
    gatewayFlatFeeIqd?: number;
  }): Promise<CommissionBreakdown> {
    const gross = Number(args.grossSalePriceIqd);
    if (!Number.isFinite(gross) || gross < 0) {
      throw new Error(`commission.computeFor: bad price ${args.grossSalePriceIqd}`);
    }

    let percent: number = SAFE_DEFAULT_COMMISSION_PERCENT;
    let source: CommissionBreakdown['source'] = 'fallback';
    let appliedTierId: string | null = null;
    let appliedTierName: string | null = null;

    // 1. per-teacher override?
    const override = await pool.query<{ commission_percent: string }>(
      `SELECT commission_percent
         FROM teacher_commission_overrides
        WHERE teacher_id = $1
        LIMIT 1`,
      [args.teacherId],
    );
    if (override.rows.length > 0) {
      percent = Number(override.rows[0]!.commission_percent);
      source = 'override';
    } else {
      // 2. tier match by price band
      const tier = await pool.query<{
        id: string;
        name: string;
        commission_percent: string;
      }>(
        `SELECT id, name, commission_percent
           FROM platform_commission_tiers
          WHERE is_active = true
            AND min_sale_price_iqd <= $1
            AND (max_sale_price_iqd IS NULL OR max_sale_price_iqd >= $1)
          ORDER BY sort_order ASC
          LIMIT 1`,
        [gross],
      );
      if (tier.rows.length > 0) {
        const row = tier.rows[0]!;
        percent = Number(row.commission_percent);
        appliedTierId = row.id;
        appliedTierName = row.name;
        source = 'tier';
      } else {
        logger.warn(
          { teacherId: args.teacherId, grossSalePriceIqd: gross },
          'commission: no active tier matches — falling back to SAFE_DEFAULT_COMMISSION_PERCENT',
        );
      }
    }

    const commission = roundIqd((gross * percent) / 100);
    const net = Math.max(0, gross - commission);

    const feePercent = args.gatewayFeePercent ?? DEFAULT_GATEWAY_FEE_PERCENT;
    const feeFlat = args.gatewayFlatFeeIqd ?? DEFAULT_GATEWAY_FLAT_FEE_IQD;
    const gatewayFee = roundIqd((gross * feePercent) / 100) + roundIqd(feeFlat);
    const platformRevenue = Math.max(0, commission - gatewayFee);

    return {
      grossSalePriceIqd: gross,
      commissionPercent: percent,
      commissionAmountIqd: commission,
      netToTeacherIqd: net,
      gatewayFeeIqd: gatewayFee,
      platformRevenueIqd: platformRevenue,
      source,
      appliedTierId,
      appliedTierName,
    };
  }
}

// IQD has no fractional units in practice. DECIMAL(14,2) gives us 2dp of
// safety; HALF UP rounding biases the half-IQD towards the platform.
function roundIqd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
