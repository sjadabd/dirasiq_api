// Withdrawal engine.
//
// A teacher requests a payout from their wallet. The wallet has two spendable
// buckets, both withdrawable:
//   - top-up balance        → teacher_wallets.balance              (legacy ledger: teacher_wallet_transactions)
//   - video-earnings balance → teacher_wallets.pending_balance     (Phase 7 ledger: wallet_ledger)
//
// Lifecycle:  pending → approved → paid     (super-admin driven)
//                    ↘ rejected (from pending or approved → releases the hold)
//
// HOLD model: the requested amount is debited from the buckets AT REQUEST TIME
// (video bucket first, then top-up) so the teacher can't double-spend it on
// platform fees while the payout is in flight. A reject restores each bucket
// exactly from the recorded split. A paid request keeps the debit and bumps
// lifetime_withdrawn.
//
// All balance mutations are serialised by SELECT ... FOR UPDATE on the
// teacher_wallets row inside one transaction with the ledger writes.

import type { PoolClient } from 'pg';

import pool from '../config/database';
import {
  TeacherWithdrawalRequestModel,
  type WithdrawalRequestRow,
  type PayoutMethod,
} from '../models/teacher-withdrawal-request.model';
import { NotificationType, RecipientType } from '../models/notification.model';
import { WalletLedgerEntryType } from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { ImageService } from '../utils/image.service';
import { logger } from '../utils/logger';
import { getNotificationService } from './services-registry';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtIqd(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Fire-and-forget push + inbox notification to the teacher on every status
 * change. Tapping the notification deep-links to the wallet screen (which hosts
 * the "السحوبات" section). Never throws — a notification failure must not roll
 * back the payout transition.
 */
async function notifyTeacher(args: {
  teacherId: string;
  actorUserId: string;
  title: string;
  message: string;
  subType: string;
  withdrawalId: string;
}): Promise<void> {
  const notif = getNotificationService();
  if (!notif) return;
  try {
    await notif.createAndSendNotification({
      title: args.title,
      message: args.message,
      type: NotificationType.PAYMENT_REMINDER,
      recipientType: RecipientType.SPECIFIC_TEACHERS,
      recipientIds: [args.teacherId],
      data: {
        subType: args.subType,
        withdrawalId: args.withdrawalId,
        route: '/teacher/wallet',
      },
      createdBy: args.actorUserId,
    });
  } catch (err) {
    logger.warn({ err, withdrawalId: args.withdrawalId }, 'withdrawal notification failed');
  }
}

interface LockedWallet {
  balance: number;
  pendingBalance: number;
  withdrawableBalance: number;
}

export class WithdrawalService {
  // ---------------------------------------------------------------------------
  // Teacher → request a payout
  // ---------------------------------------------------------------------------
  static async requestWithdrawal(args: {
    teacherId: string;
    amountIqd: number;
    notes?: string | null;
    destination?: string | null;
  }): Promise<WithdrawalRequestRow> {
    const amount = round2(args.amountIqd);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'المبلغ غير صالح', ErrorCodes.VALIDATION_ERROR);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wallet = await this.lockWallet(client, args.teacherId);
      const available = round2(wallet.balance + wallet.pendingBalance);
      if (available < amount) {
        throw new ApiError(
          400,
          'الرصيد غير كافٍ لطلب هذا المبلغ',
          ErrorCodes.INSUFFICIENT_FUNDS,
          { requestedIqd: amount, availableIqd: available }
        );
      }

      // Drain the video bucket first, then the top-up bucket.
      const heldFromVideo = Math.min(amount, wallet.pendingBalance);
      const heldFromTopup = round2(amount - heldFromVideo);
      const newPending = round2(wallet.pendingBalance - heldFromVideo);
      const newBalance = round2(wallet.balance - heldFromTopup);

      const request = await TeacherWithdrawalRequestModel.create(
        {
          teacherId: args.teacherId,
          amountIqd: amount,
          heldFromVideoIqd: heldFromVideo,
          heldFromTopupIqd: heldFromTopup,
          requestedNotes: args.notes ?? null,
          requestedDestination: args.destination ?? null,
        },
        client
      );

      await client.query(
        `UPDATE teacher_wallets
            SET balance = $2, pending_balance = $3, updated_at = now()
          WHERE teacher_id = $1`,
        [args.teacherId, newBalance, newPending]
      );

      if (heldFromVideo > 0) {
        await this.insertWalletLedger(client, {
          teacherId: args.teacherId,
          entryType: WalletLedgerEntryType.WITHDRAWAL_HOLD,
          amount: -heldFromVideo,
          balancePendingAfter: newPending,
          balanceWithdrawableAfter: wallet.withdrawableBalance,
          relatedWithdrawalId: request.id,
          actorUserId: args.teacherId,
          notes: 'withdrawal hold (video earnings)',
        });
      }
      if (heldFromTopup > 0) {
        await this.insertTopupTxn(client, {
          teacherId: args.teacherId,
          txnType: 'debit',
          amount: -heldFromTopup,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          referenceType: 'withdrawal_hold',
          referenceId: request.id,
        });
      }

      await client.query('COMMIT');
      logger.info(
        { withdrawalId: request.id, teacherId: args.teacherId, amount, heldFromVideo, heldFromTopup },
        'withdrawal requested'
      );
      return request;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Super-admin → approve
  // ---------------------------------------------------------------------------
  static async approve(args: {
    requestId: string;
    adminId: string;
    adminNotes?: string | null;
  }): Promise<WithdrawalRequestRow> {
    const req = await TeacherWithdrawalRequestModel.findById(args.requestId);
    if (!req) throw new ApiError(404, 'الطلب غير موجود', ErrorCodes.NOT_FOUND);
    if (req.status !== 'pending') {
      throw new ApiError(
        400,
        'لا يمكن الموافقة على طلب بحالته الحالية',
        ErrorCodes.BUSINESS_RULE,
        { currentStatus: req.status }
      );
    }
    const { rows } = await pool.query<WithdrawalRequestRow>(
      `UPDATE teacher_withdrawal_requests
          SET status = 'approved', approved_by = $2, approved_at = now(),
              admin_notes = COALESCE($3, admin_notes)
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [args.requestId, args.adminId, args.adminNotes ?? null]
    );
    if (!rows[0]) {
      throw new ApiError(409, 'تغيّرت حالة الطلب', ErrorCodes.CONFLICT);
    }
    await notifyTeacher({
      teacherId: rows[0].teacher_id,
      actorUserId: args.adminId,
      title: 'تمت الموافقة على طلب السحب',
      message: `تمت الموافقة على سحب ${fmtIqd(Number(rows[0].amount_iqd))} د.ع — سيتم التحويل خلال 24 ساعة إلى 3 أيام.`,
      subType: 'withdrawal_approved',
      withdrawalId: rows[0].id,
    });
    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // Super-admin → reject (releases the hold back to the wallet buckets)
  // ---------------------------------------------------------------------------
  static async reject(args: {
    requestId: string;
    adminId: string;
    reason: string;
  }): Promise<WithdrawalRequestRow> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const req = await TeacherWithdrawalRequestModel.findById(args.requestId, client);
      if (!req) throw new ApiError(404, 'الطلب غير موجود', ErrorCodes.NOT_FOUND);
      if (req.status !== 'pending' && req.status !== 'approved') {
        throw new ApiError(
          400,
          'لا يمكن رفض طلب بحالته الحالية',
          ErrorCodes.BUSINESS_RULE,
          { currentStatus: req.status }
        );
      }

      const wallet = await this.lockWallet(client, req.teacher_id);
      const heldFromVideo = Number(req.held_from_video_iqd);
      const heldFromTopup = Number(req.held_from_topup_iqd);
      const newPending = round2(wallet.pendingBalance + heldFromVideo);
      const newBalance = round2(wallet.balance + heldFromTopup);

      await client.query(
        `UPDATE teacher_wallets
            SET balance = $2, pending_balance = $3, updated_at = now()
          WHERE teacher_id = $1`,
        [req.teacher_id, newBalance, newPending]
      );

      if (heldFromVideo > 0) {
        await this.insertWalletLedger(client, {
          teacherId: req.teacher_id,
          entryType: WalletLedgerEntryType.WITHDRAWAL_RELEASE,
          amount: heldFromVideo,
          balancePendingAfter: newPending,
          balanceWithdrawableAfter: wallet.withdrawableBalance,
          relatedWithdrawalId: req.id,
          actorUserId: args.adminId,
          notes: 'withdrawal rejected — release (video earnings)',
        });
      }
      if (heldFromTopup > 0) {
        await this.insertTopupTxn(client, {
          teacherId: req.teacher_id,
          txnType: 'adjustment',
          amount: heldFromTopup,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          referenceType: 'withdrawal_release',
          referenceId: req.id,
        });
      }

      const { rows } = await client.query<WithdrawalRequestRow>(
        `UPDATE teacher_withdrawal_requests
            SET status = 'rejected', rejected_by = $2, rejected_at = now(),
                rejection_reason = $3
          WHERE id = $1
          RETURNING *`,
        [req.id, args.adminId, args.reason]
      );

      await client.query('COMMIT');
      logger.info(
        { withdrawalId: req.id, teacherId: req.teacher_id, heldFromVideo, heldFromTopup },
        'withdrawal rejected — hold released'
      );
      await notifyTeacher({
        teacherId: req.teacher_id,
        actorUserId: args.adminId,
        title: 'تم رفض طلب السحب',
        message: `تم رفض طلب سحب ${fmtIqd(Number(req.amount_iqd))} د.ع وأُعيد المبلغ إلى محفظتك. السبب: ${args.reason}`,
        subType: 'withdrawal_rejected',
        withdrawalId: req.id,
      });
      return rows[0]!;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Super-admin → mark paid (uploads the transfer receipt image)
  // ---------------------------------------------------------------------------
  static async markPaid(args: {
    requestId: string;
    adminId: string;
    method: PayoutMethod;
    reference?: string | null;
    destination?: string | null;
    receiptImageBase64: string;
  }): Promise<WithdrawalRequestRow> {
    const req = await TeacherWithdrawalRequestModel.findById(args.requestId);
    if (!req) throw new ApiError(404, 'الطلب غير موجود', ErrorCodes.NOT_FOUND);
    if (req.status !== 'approved') {
      throw new ApiError(
        400,
        'يجب الموافقة على الطلب قبل تأشيره مدفوعاً',
        ErrorCodes.BUSINESS_RULE,
        { currentStatus: req.status }
      );
    }

    // Persist the receipt image first; a failure here must not flip the status.
    let receiptUrl: string;
    try {
      receiptUrl = await ImageService.saveBase64Image(
        args.receiptImageBase64,
        `withdrawal_receipt_${req.id}`
      );
    } catch {
      throw new ApiError(
        400,
        'تعذّر حفظ صورة وصل التحويل — تأكد من الصورة',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wallet = await this.lockWallet(client, req.teacher_id);
      const amount = Number(req.amount_iqd);

      // Balances were already debited at hold time; just record the audit
      // entry and bump lifetime_withdrawn.
      await client.query(
        `UPDATE teacher_wallets
            SET lifetime_withdrawn = round((lifetime_withdrawn + $2)::numeric, 2),
                updated_at = now()
          WHERE teacher_id = $1`,
        [req.teacher_id, amount]
      );
      await this.insertWalletLedger(client, {
        teacherId: req.teacher_id,
        entryType: WalletLedgerEntryType.WITHDRAWAL_PAID,
        amount: 0,
        balancePendingAfter: wallet.pendingBalance,
        balanceWithdrawableAfter: wallet.withdrawableBalance,
        relatedWithdrawalId: req.id,
        actorUserId: args.adminId,
        notes: `withdrawal paid (${args.method})`,
      });

      const { rows } = await client.query<WithdrawalRequestRow>(
        `UPDATE teacher_withdrawal_requests
            SET status = 'paid', paid_by = $2, paid_at = now(),
                payout_method = $3, payout_reference = $4,
                payout_destination = $5, payout_receipt_url = $6
          WHERE id = $1 AND status = 'approved'
          RETURNING *`,
        [
          req.id,
          args.adminId,
          args.method,
          args.reference ?? null,
          args.destination ?? null,
          receiptUrl,
        ]
      );
      if (!rows[0]) {
        throw new ApiError(409, 'تغيّرت حالة الطلب', ErrorCodes.CONFLICT);
      }

      await client.query('COMMIT');
      logger.info(
        { withdrawalId: req.id, teacherId: req.teacher_id, amount, method: args.method },
        'withdrawal marked paid'
      );
      await notifyTeacher({
        teacherId: req.teacher_id,
        actorUserId: args.adminId,
        title: 'تم تحويل مبلغ السحب',
        message: `تم تحويل ${fmtIqd(amount)} د.ع إلى حسابك. يمكنك عرض وصل التحويل في المحفظة.`,
        subType: 'withdrawal_paid',
        withdrawalId: req.id,
      });
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------
  private static async lockWallet(
    client: PoolClient,
    teacherId: string
  ): Promise<LockedWallet> {
    await client.query(
      `INSERT INTO teacher_wallets (teacher_id) VALUES ($1) ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId]
    );
    const { rows } = await client.query<{
      balance: string;
      pending_balance: string;
      withdrawable_balance: string;
    }>(
      `SELECT balance, pending_balance, withdrawable_balance
         FROM teacher_wallets WHERE teacher_id = $1 FOR UPDATE`,
      [teacherId]
    );
    const row = rows[0]!;
    return {
      balance: Number(row.balance),
      pendingBalance: Number(row.pending_balance),
      withdrawableBalance: Number(row.withdrawable_balance),
    };
  }

  private static async insertWalletLedger(
    client: PoolClient,
    e: {
      teacherId: string;
      entryType: WalletLedgerEntryType;
      amount: number;
      balancePendingAfter: number;
      balanceWithdrawableAfter: number;
      relatedWithdrawalId: string;
      actorUserId: string;
      notes: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO wallet_ledger (
         teacher_id, entry_type, amount,
         balance_pending_after, balance_withdrawable_after,
         related_enrollment_id, related_withdrawal_id, related_wayl_link_id,
         related_video_course_purchase_id, actor_user_id, idempotency_key, notes
       ) VALUES ($1,$2,$3,$4,$5,NULL,$6,NULL,NULL,$7,NULL,$8)`,
      [
        e.teacherId,
        e.entryType,
        e.amount,
        e.balancePendingAfter,
        e.balanceWithdrawableAfter,
        e.relatedWithdrawalId,
        e.actorUserId,
        e.notes,
      ]
    );
  }

  private static async insertTopupTxn(
    client: PoolClient,
    t: {
      teacherId: string;
      txnType: 'debit' | 'adjustment';
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      referenceType: string;
      referenceId: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO teacher_wallet_transactions
         (teacher_id, txn_type, amount, balance_before, balance_after, reference_type, reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        t.teacherId,
        t.txnType,
        t.amount,
        t.balanceBefore,
        t.balanceAfter,
        t.referenceType,
        t.referenceId,
      ]
    );
  }
}
