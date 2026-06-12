import type { Request, Response } from 'express';

import pool from '../../config/database';
import { TeacherWalletTransactionModel } from '../../models/teacher-wallet-transaction.model';
import { TeacherWithdrawalRequestModel } from '../../models/teacher-withdrawal-request.model';
import { WithdrawalService } from '../../services/withdrawal.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class TeacherWalletController {
  /**
   * Unified wallet view: the two spendable buckets, their total, the dedicated
   * video-earnings report (earned / withdrawn / remaining), and the in-flight
   * withdrawal total.
   */
  static async getWallet(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;

    await pool.query(
      `INSERT INTO teacher_wallets (teacher_id) VALUES ($1) ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId]
    );

    const [walletRes, earnedRes, withdrawnVideo, inFlightVideo, pendingTotalRes] =
      await Promise.all([
        pool.query<{ balance: string; pending_balance: string }>(
          `SELECT balance, pending_balance FROM teacher_wallets WHERE teacher_id = $1`,
          [teacherId]
        ),
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0)::decimal AS total
             FROM wallet_ledger
            WHERE teacher_id = $1
              AND entry_type = 'video_course_purchase_credit'`,
          [teacherId]
        ),
        TeacherWithdrawalRequestModel.sumVideoHeld(teacherId, ['paid']),
        TeacherWithdrawalRequestModel.sumVideoHeld(teacherId, ['pending', 'approved']),
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_iqd), 0)::decimal AS total
             FROM teacher_withdrawal_requests
            WHERE teacher_id = $1 AND status IN ('pending','approved')`,
          [teacherId]
        ),
      ]);

    const topupBalance = Number(walletRes.rows[0]?.balance ?? 0);
    const videoEarningsAvailable = Number(walletRes.rows[0]?.pending_balance ?? 0);
    const lifetimeEarned = Number(earnedRes.rows[0]?.total ?? 0);
    const total = Math.round((topupBalance + videoEarningsAvailable) * 100) / 100;

    res.status(200).json(
      ok(
        {
          // Backward-compatible: legacy clients read `balance` as the spendable total.
          balance: total,
          total,
          topupBalance,
          videoEarningsAvailable,
          videoReport: {
            lifetimeEarned,
            withdrawn: withdrawnVideo,
            inFlight: inFlightVideo,
            available: videoEarningsAvailable,
          },
          pendingWithdrawalsTotal: Number(pendingTotalRes.rows[0]?.total ?? 0),
        },
        'تم جلب المحفظة'
      )
    );
  }

  static async listTransactions(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit, offset } = parsePagination(req.query);
    const items = await TeacherWalletTransactionModel.listByTeacher(teacherId, limit, offset);
    const total = items.length;
    res.status(200).json(paginated(items, buildPaginationMeta(total, page, limit), 'تم جلب حركات المحفظة'));
  }

  // ---------------------------------------------------------------------------
  // Withdrawals
  // ---------------------------------------------------------------------------
  static async createWithdrawal(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as { amount: number; notes?: string; destination?: string };
    const request = await WithdrawalService.requestWithdrawal({
      teacherId,
      amountIqd: body.amount,
      notes: body.notes ?? null,
      destination: body.destination ?? null,
    });
    res.status(201).json(ok(request, 'تم إرسال طلب السحب — ستتم مراجعته من الإدارة'));
  }

  static async listWithdrawals(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit, offset } = parsePagination(req.query);
    const items = await TeacherWithdrawalRequestModel.listByTeacher(teacherId, limit, offset);
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(items.length, page, limit), 'تم جلب طلبات السحب'));
  }
}
